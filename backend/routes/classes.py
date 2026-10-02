"""Class sessions (instructor log) + attendance (student self-marking).

Creating a class in the future fires push notifications to every user
who FOLLOWS the posting instructor (via the "My instructors" picker on
Profile). Attendance rows are keyed by (user_id, class_id).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import (
    get_current_user,
    require_instructor,
    user_can_edit_step_sheets,
)
from core.time_helpers import now_iso
from models.schemas import ClassSessionIn
from services.badges import evaluate_badges
from services.instructor_notifications import notify_followers_of_new_class

logger = logging.getLogger(__name__)
router = APIRouter()

# P3 hardening — cap the base64 flyer image so a single class can't
# bloat the DB. Same 6MB ceiling used by suggestions.step_sheet_image.
# Whitelist-gated at the write site (Erin/Jamin only), but a runaway
# phone-picker export would still land here without a cap.
_FLYER_IMAGE_MAX_BYTES = 6_000_000


def _validate_flyer_image(inp: ClassSessionIn) -> None:
    if inp.flyer_image and len(inp.flyer_image) > _FLYER_IMAGE_MAX_BYTES:
        raise HTTPException(
            413,
            "Flyer image is too large — please pick a smaller file (max ~6MB).",
        )


@router.get("/classes")
async def list_classes(
    scope: str = "all",
    limit: int = 100,
    date_from: Optional[str] = None,
):
    """List classes, filtered by ``scope``.

    ``date_from`` is an OPTIONAL client-supplied YYYY-MM-DD anchor for
    "today". The client sends its LOCAL calendar day so an instructor
    in Arizona posting a class dated "today" still sees it in
    "upcoming" between local 5pm and midnight (when UTC has already
    rolled to tomorrow). Falls back to server UTC when the client
    doesn't send anything.
    """
    query: dict = {}
    today = (date_from or "").strip() or datetime.now(timezone.utc).strftime(
        "%Y-%m-%d"
    )
    if scope == "upcoming":
        query["date"] = {"$gte": today}
    elif scope == "past":
        query["date"] = {"$lt": today}
    sort_dir = 1 if scope == "upcoming" else -1
    docs = (
        await db.classes.find(query, {"_id": 0})
        .sort("date", sort_dir)
        .to_list(max(1, min(limit, 500)))
    )
    return docs


@router.get("/classes/{class_id}")
async def get_class(class_id: str):
    doc = await db.classes.find_one({"id": class_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@router.post("/classes")
async def create_class(
    inp: ClassSessionIn, instructor: dict = Depends(require_instructor)
):
    if not inp.date:
        raise HTTPException(400, "Date is required")
    _validate_flyer_image(inp)
    # Resolve dance names for display
    dance_docs = await db.dances.find(
        {"id": {"$in": inp.dance_ids}}, {"_id": 0}
    ).to_list(500)
    by_id = {d["id"]: d for d in dance_docs}
    resolved = [
        {
            "id": did,
            "name": by_id[did]["name"] if did in by_id else "(removed)",
            "difficulty": by_id[did].get("difficulty", "") if did in by_id else "",
        }
        for did in inp.dance_ids
    ]
    doc = {
        "id": f"class_{uuid.uuid4().hex[:10]}",
        "date": inp.date,
        "session_label": (inp.session_label or "").strip(),
        "notes": (inp.notes or "").strip(),
        "instructor_id": instructor["user_id"],
        "instructor_name": instructor.get("name", ""),
        "dance_ids": inp.dance_ids,
        "dances": resolved,
        # Flyer image: senior-instructor whitelist only. Silently blanked
        # for anyone else so the payload isn't rejected.
        "flyer_image": (
            (inp.flyer_image or "").strip()
            if user_can_edit_step_sheets(instructor)
            else ""
        ),
        "created_at": now_iso(),
    }
    await db.classes.insert_one(doc)
    doc.pop("_id", None)

    # Fan-out to FOLLOWERS of this instructor only (per "My instructors"
    # picker). Replaces the old "notify every user" broadcast — dancers
    # who never opted-in to Erin's classes shouldn't get pinged.
    # Helper handles: upcoming-only date check, idempotency, and swallows
    # push-relay failures so a bad outage never blocks the CRUD path.
    follower_recipients: list[str] = []
    try:
        res = await notify_followers_of_new_class(doc)
        if isinstance(res, int):
            # Legacy return — int count only. Follower set already got
            # the push; library broadcast will still skip them via the
            # idempotency ledger even if we can't list them here.
            pass
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Class notification failed (non-blocking): {e}")

    # ALSO broadcast to every opted-in user (``library_updates`` pref)
    # — "A new class was added" nudge for dancers who don't yet follow
    # the posting instructor. The helper skips any user already in the
    # follower ledger via its own dedupe table so phones only buzz once.
    try:
        from services.library_broadcast import broadcast_new_class
        await broadcast_new_class(doc, skip_user_ids=follower_recipients)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Class library broadcast failed (non-blocking): {e}")

    return doc


@router.put("/classes/{class_id}")
async def update_class(
    class_id: str, inp: ClassSessionIn, user: dict = Depends(get_current_user)
):
    doc = await db.classes.find_one({"id": class_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    # Owner, admin, or a whitelisted editor (Erin/Jamin) may edit any class
    is_owner = doc["instructor_id"] == user["user_id"]
    if not (is_owner or user.get("is_admin") or user_can_edit_step_sheets(user)):
        raise HTTPException(403, "Not allowed")
    _validate_flyer_image(inp)
    dance_docs = await db.dances.find(
        {"id": {"$in": inp.dance_ids}}, {"_id": 0}
    ).to_list(500)
    by_id = {d["id"]: d for d in dance_docs}
    resolved = [
        {
            "id": did,
            "name": by_id[did]["name"] if did in by_id else "(removed)",
            "difficulty": by_id[did].get("difficulty", "") if did in by_id else "",
        }
        for did in inp.dance_ids
    ]
    updates = {
        "date": inp.date,
        "session_label": (inp.session_label or "").strip(),
        "notes": (inp.notes or "").strip(),
        "dance_ids": inp.dance_ids,
        "dances": resolved,
    }
    # Flyer image: whitelist-only writes. If a non-editor tries to change it,
    # 403 out to signal the UI shouldn't have surfaced the field.
    can_edit_flyer = user_can_edit_step_sheets(user)
    incoming_flyer = (inp.flyer_image or "").strip()
    prev_flyer = (doc.get("flyer_image") or "").strip()
    if incoming_flyer != prev_flyer:
        if not can_edit_flyer:
            raise HTTPException(403, "Only Erin or Jamin can upload class flyers")
        updates["flyer_image"] = incoming_flyer
    await db.classes.update_one({"id": class_id}, {"$set": updates})
    return {**doc, **updates}


@router.delete("/classes/{class_id}")
async def delete_class(class_id: str, user: dict = Depends(get_current_user)):
    doc = await db.classes.find_one({"id": class_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    # Owner, admin, or a whitelisted editor (Erin/Jamin) may delete any class
    is_owner = doc["instructor_id"] == user["user_id"]
    if not (is_owner or user.get("is_admin") or user_can_edit_step_sheets(user)):
        raise HTTPException(403, "Not allowed")
    await db.classes.delete_one({"id": class_id})
    await db.attendance.delete_many({"class_id": class_id})
    return {"ok": True}


# ---------------- Attendance ----------------
@router.post("/classes/{class_id}/attend")
async def mark_attended(class_id: str, user: dict = Depends(get_current_user)):
    klass = await db.classes.find_one({"id": class_id}, {"_id": 0})
    if not klass:
        raise HTTPException(404, "Class not found")
    await db.attendance.update_one(
        {"user_id": user["user_id"], "class_id": class_id},
        {
            "$set": {
                "user_id": user["user_id"],
                "user_name": user.get("name", ""),
                "class_id": class_id,
                "class_date": klass.get("date", ""),
                "class_label": klass.get("session_label", ""),
                "marked_at": now_iso(),
            }
        },
        upsert=True,
    )
    # Class-attendance badges (class_regular, class_devotee). Attending a
    # class doesn't automatically imply the user has practiced today, so we
    # DON'T bump the daily streak here — only evaluate the badges.
    newly_earned = await evaluate_badges(user["user_id"])
    return {"ok": True, "attended": True, "newly_earned_badges": newly_earned}


@router.delete("/classes/{class_id}/attend")
async def unmark_attended(class_id: str, user: dict = Depends(get_current_user)):
    await db.attendance.delete_one(
        {"user_id": user["user_id"], "class_id": class_id}
    )
    return {"ok": True, "attended": False}


@router.get("/attendance/me")
async def my_attendance(user: dict = Depends(get_current_user)):
    """Return list of class objects the user attended, plus a simple set of class IDs."""
    rows = (
        await db.attendance.find({"user_id": user["user_id"]}, {"_id": 0})
        .sort("class_date", -1)
        .to_list(500)
    )
    ids = [r["class_id"] for r in rows]
    classes = await db.classes.find(
        {"id": {"$in": ids}}, {"_id": 0}
    ).to_list(500)
    by_id = {c["id"]: c for c in classes}
    combined = [by_id[i] for i in ids if i in by_id]
    return {"class_ids": ids, "classes": combined}
