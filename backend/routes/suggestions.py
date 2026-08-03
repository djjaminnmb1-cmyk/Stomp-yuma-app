"""User-submitted dance suggestions (with optional step-sheet photo).

Signed-in users can propose dances they'd love to see in the library. Admins
and step-sheet editors review the queue and change status. Per-user daily
quotas prevent DB flooding via base64 uploads.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from core.config import SUGGESTION_IMAGE_QUOTA_PER_DAY, SUGGESTION_QUOTA_PER_DAY
from core.database import db
from core.security import get_current_user, require_admin_or_editor
from core.time_helpers import now_iso
from models.schemas import SuggestionIn

router = APIRouter()


@router.post("/suggestions")
async def submit_suggestion(inp: SuggestionIn, user: dict = Depends(get_current_user)):
    if not inp.dance_name or not inp.dance_name.strip():
        raise HTTPException(400, "Dance name is required")

    # Sanitise / cap the base64 image so a single suggestion can't OOM the DB.
    img = (inp.step_sheet_image or "").strip()
    if img and len(img) > 6_000_000:
        raise HTTPException(413, "Step sheet image is too large — please pick a smaller file.")

    # Per-user daily quota (24-hour rolling window)
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    total_today = await db.suggestions.count_documents({
        "user_id": user["user_id"],
        "created_at": {"$gte": since},
    })
    if total_today >= SUGGESTION_QUOTA_PER_DAY:
        raise HTTPException(
            429,
            f"You've reached the daily limit of {SUGGESTION_QUOTA_PER_DAY} "
            "suggestions. Please try again tomorrow.",
        )
    if img:
        images_today = await db.suggestions.count_documents({
            "user_id": user["user_id"],
            "created_at": {"$gte": since},
            "step_sheet_image": {"$ne": ""},
        })
        if images_today >= SUGGESTION_IMAGE_QUOTA_PER_DAY:
            raise HTTPException(
                429,
                f"You've reached the daily limit of "
                f"{SUGGESTION_IMAGE_QUOTA_PER_DAY} suggestions with attached "
                "photos. Send more tomorrow, or submit without a photo.",
            )

    doc = {
        "id": f"sug_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "user_name": user.get("name", ""),
        "user_email": user.get("email", ""),
        "dance_name": inp.dance_name.strip(),
        "song": (inp.song or "").strip(),
        "artist": (inp.artist or "").strip(),
        "difficulty": (inp.difficulty or "").strip(),
        "youtube_url": (inp.youtube_url or "").strip(),
        "step_sheet_url": (inp.step_sheet_url or "").strip(),
        "step_sheet_image": img,
        "notes": (inp.notes or "").strip(),
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.suggestions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/suggestions/mine")
async def my_suggestions(user: dict = Depends(get_current_user)):
    docs = (
        await db.suggestions.find({"user_id": user["user_id"]}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(200)
    )
    return docs


@router.get("/suggestions")
async def list_suggestions(reviewer: dict = Depends(require_admin_or_editor)):
    docs = (
        await db.suggestions.find({}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(1000)
    )
    return docs


@router.put("/suggestions/{sug_id}/status")
async def update_suggestion_status(
    sug_id: str, status: str, reviewer: dict = Depends(require_admin_or_editor)
):
    if status not in ("pending", "reviewed", "queued", "declined"):
        raise HTTPException(400, "Invalid status")
    await db.suggestions.update_one({"id": sug_id}, {"$set": {"status": status}})
    d = await db.suggestions.find_one({"id": sug_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    return d


@router.delete("/suggestions/{sug_id}")
async def delete_suggestion(sug_id: str, user: dict = Depends(get_current_user)):
    # Owner can delete their own; admin can delete any
    doc = await db.suggestions.find_one({"id": sug_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if doc["user_id"] != user["user_id"] and not user.get("is_admin"):
        raise HTTPException(403, "Not allowed")
    await db.suggestions.delete_one({"id": sug_id})
    return {"ok": True}
