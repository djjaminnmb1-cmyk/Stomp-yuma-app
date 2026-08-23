"""User tracking: mark dances as completed/wishlist, retrieve own list."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import get_current_user
from core.time_helpers import now_iso
from models.schemas import TrackingIn
from services.badges import award_and_streak, evaluate_badges, get_streak
from services.social import record_completion_event

router = APIRouter()


@router.get("/tracking/me")
async def my_tracking(user: dict = Depends(get_current_user)):
    docs = await db.tracking.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).to_list(2000)
    return [
        {
            "dance_id": d["dance_id"],
            "status": d.get("status", "wishlist"),
            "rating": d.get("rating", 0),
            "notes": d.get("notes", ""),
            "updated_at": d.get("updated_at", ""),
        }
        for d in docs
    ]


@router.post("/tracking/{dance_id}")
async def upsert_tracking(
    dance_id: str, inp: TrackingIn, user: dict = Depends(get_current_user)
):
    if inp.status not in ("completed", "wishlist"):
        raise HTTPException(400, "Invalid status")
    dance = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not dance:
        raise HTTPException(404, "Dance not found")
    # Look up prior state so we only fire a feed event when the user is
    # transitioning INTO the completed state (not toggling completed →
    # completed on a save-notes call).
    prior = await db.tracking.find_one(
        {"user_id": user["user_id"], "dance_id": dance_id},
        {"_id": 0, "status": 1},
    )
    was_completed = bool(prior and prior.get("status") == "completed")
    payload = {
        "user_id": user["user_id"],
        "dance_id": dance_id,
        "status": inp.status,
        "rating": max(0, min(5, int(inp.rating or 0))),
        "notes": inp.notes or "",
        "updated_at": now_iso(),
    }
    await db.tracking.update_one(
        {"user_id": user["user_id"], "dance_id": dance_id},
        {"$set": payload},
        upsert=True,
    )
    # Streak + badge check on every completion (wishlist doesn't bump streak,
    # only completed does, but wishlist_dreamer badge is still evaluated).
    newly_earned: list[dict] = []
    if inp.status == "completed":
        award = await award_and_streak(user["user_id"])
        newly_earned = award["newly_earned_badges"]
        streak = award["streak"]
        # Feed event on first-time completion. Idempotent inside the
        # helper so a re-save of the same completed row is a no-op.
        if not was_completed:
            await record_completion_event(user["user_id"], dance_id)
    else:
        # Non-completion (wishlist) — evaluate wishlist_dreamer et al without
        # bumping the daily streak counter. Return the CURRENT streak (may be
        # zero) instead of null so the client always sees the same shape.
        newly_earned = await evaluate_badges(user["user_id"])
        streak = await get_streak(user["user_id"])
    return {
        "dance_id": dance_id,
        "status": payload["status"],
        "rating": payload["rating"],
        "notes": payload["notes"],
        "updated_at": payload["updated_at"],
        "newly_earned_badges": newly_earned,
        "streak": streak,
    }


@router.delete("/tracking/{dance_id}")
async def delete_tracking(dance_id: str, user: dict = Depends(get_current_user)):
    await db.tracking.delete_one(
        {"user_id": user["user_id"], "dance_id": dance_id}
    )
    return {"ok": True}
