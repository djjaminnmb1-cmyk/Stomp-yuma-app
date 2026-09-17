"""User feedback & bug reports with automatic version-pin.

Powers the Profile → "Send Feedback" flow. Every submission is stamped
with the caller's client diagnostics (app version, OTA update ID,
channel, runtime version, platform, OS version) so an admin can jump
straight from a report into the specific bundle the dancer was on.

Endpoints
---------
- ``POST /api/feedback`` — authenticated dancer submits feedback
- ``GET  /api/admin/feedback`` — admin lists all reports (paginated)
- ``PATCH /api/admin/feedback/{id}`` — admin sets status / adds note
"""
from __future__ import annotations

import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.database import db
from core.diagnostics import client_diagnostics
from core.security import get_current_user, require_admin
from core.time_helpers import now_iso

router = APIRouter()


FeedbackCategory = Literal[
    "bug", "feature_request", "content_error", "instructor_help", "other"
]


class FeedbackBody(BaseModel):
    message: str = Field(..., min_length=3, max_length=4000)
    category: FeedbackCategory = "other"
    # Optional route the user was on when they hit "Send" — helps
    # narrow down the screen where a bug lives.
    screen: Optional[str] = None
    # Extra structured data the client wants to attach (e.g. dance
    # id they were trying to complete). Free-form; capped at 2 KB
    # server-side.
    context: Optional[dict] = None


class FeedbackPatchBody(BaseModel):
    status: Optional[Literal["open", "in_progress", "resolved", "wontfix"]] = None
    admin_note: Optional[str] = None


@router.post("/feedback")
async def submit_feedback(
    body: FeedbackBody,
    user: dict = Depends(get_current_user),
    diag: dict = Depends(client_diagnostics),
):
    msg = (body.message or "").strip()
    if not msg:
        raise HTTPException(400, "Message can't be empty.")
    ctx = body.context or {}
    # Cheap defensive cap so a bad client can't push a 2 MB blob.
    if isinstance(ctx, dict) and len(str(ctx)) > 2048:
        raise HTTPException(400, "context is too large (max ~2 KB).")

    # Apple UGC 1.2: pre-insert content filter.
    from services import content_filter
    verdict = content_filter.check(msg)
    if not verdict.ok:
        content_filter.log_block(
            user_id=user["user_id"],
            category=verdict.category or "unknown",
            detail=verdict.detail,
            surface="feedback",
        )
        raise HTTPException(
            400,
            {
                "code": "content_blocked",
                "message": verdict.message,
                "category": verdict.category,
            },
        )

    doc = {
        "id": f"fb_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "user_email": user.get("email", ""),
        "user_name": user.get("name", ""),
        "category": body.category,
        "message": msg[:4000],
        "screen": (body.screen or "").strip()[:200],
        "context": ctx if isinstance(ctx, dict) else {},
        "diagnostics": diag,
        "status": "open",
        "admin_note": "",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.feedback.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "feedback": doc}


@router.get("/admin/feedback")
async def list_feedback(
    status: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    admin: dict = Depends(require_admin),
):
    q: dict = {}
    if status:
        q["status"] = status
    if category:
        q["category"] = category
    rows = await db.feedback.find(q, {"_id": 0}).sort("created_at", -1).to_list(
        length=limit
    )
    counts = {}
    async for row in db.feedback.aggregate(
        [{"$group": {"_id": "$status", "n": {"$sum": 1}}}]
    ):
        counts[row["_id"] or "open"] = row["n"]
    return {"items": rows, "counts": counts, "total_returned": len(rows)}


@router.patch("/admin/feedback/{fb_id}")
async def patch_feedback(
    fb_id: str,
    body: FeedbackPatchBody,
    admin: dict = Depends(require_admin),
):
    upd: dict = {}
    if body.status is not None:
        upd["status"] = body.status
    if body.admin_note is not None:
        upd["admin_note"] = body.admin_note.strip()[:2000]
    if not upd:
        raise HTTPException(400, "Nothing to update.")
    upd["updated_at"] = now_iso()
    upd["resolved_by"] = admin.get("email", "") if body.status == "resolved" else ""
    res = await db.feedback.update_one({"id": fb_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Feedback not found.")
    row = await db.feedback.find_one({"id": fb_id}, {"_id": 0})
    return {"ok": True, "feedback": row}
