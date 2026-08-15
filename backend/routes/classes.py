"""Class sessions (instructor log) + attendance (student self-marking).

Creating a class in the future fires push notifications to every user.
Attendance rows are keyed by (user_id, class_id).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.push_service import send_push
from core.security import (
    get_current_user,
    require_instructor,
    user_can_edit_step_sheets,
)
from core.time_helpers import now_iso
from models.schemas import ClassSessionIn
from services.badges import evaluate_badges

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/classes")
async def list_classes(scope: str = "all", limit: int = 100):
    query: dict = {}
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
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

    # Fire push to all registered users if this is an upcoming class
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if inp.date >= today:
        try:
            all_users = await db.users.find(
                {}, {"_id": 0, "user_id": 1}
            ).to_list(5000)
            recipients = [u["user_id"] for u in all_users]
            label = doc["session_label"] or "New class"
            dance_names = ", ".join([r["name"] for r in resolved[:3]])
            more = f" +{len(resolved) - 3} more" if len(resolved) > 3 else ""
            await send_push(
                recipients=recipients,
                data={
                    "title": f"{label} · {inp.date}",
                    "message": (
                        f"{instructor.get('name', 'An instructor')} added a new class. "
                        f"Dances: {dance_names}{more}"
                    ),
                    "action_url": "/classes",
                },
                idempotency_key=f"class-{doc['id']}",
            )
        except Exception as e:
            logger.warning(f"Push failed (non-blocking): {e}")

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
