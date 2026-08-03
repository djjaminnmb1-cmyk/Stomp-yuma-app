"""Admin management of the Boot Scoot Board.

Three capabilities:

- Hide/unhide a specific user from the public leaderboard (admin override,
  ignores the user's own privacy setting). Stored on the user doc as
  ``leaderboard_hidden_by_admin: bool``.
- Reset a specific user's completion count (deletes their tracking rows
  with status="completed"). Their wishlist rows are preserved.
- Roll the whole board to a new "season" epoch. Instead of destroying
  tracking data, we record an ``epoch_started_at`` timestamp. The public
  leaderboard aggregation (``routes/leaderboard.py``) filters completions
  by ``updated_at >= epoch_started_at`` for the ALL-TIME view, effectively
  starting a fresh season without losing the raw completion history.
  Previous seasons are archived to ``leaderboard_seasons`` so admins can
  browse historical results.

Also exposes CRUD for the Prizes area (see ``routes/prizes.py``).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from core.database import db
from core.security import require_admin
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/admin/leaderboard/hidden-users")
async def admin_list_hidden(admin: dict = Depends(require_admin)):
    """Return the list of user_ids currently hidden from the public
    leaderboard by admin override. Used by the admin console to render
    accurate Hide/Show toggle state on the roster."""
    docs = await db.users.find(
        {"leaderboard_hidden_by_admin": True},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1},
    ).to_list(2000)
    return {
        "hidden_user_ids": [d["user_id"] for d in docs],
        "users": docs,
    }


# ---------- Hide / unhide a user (admin override) ----------
@router.post("/admin/leaderboard/users/{user_id}/hide")
async def admin_hide_user(user_id: str, admin: dict = Depends(require_admin)):
    """Force-hide a user from the public leaderboard, regardless of their own
    privacy setting. The user is not deleted; ``leaderboard_hidden_by_admin``
    is set to True on their user doc.
    """
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1})
    if not target:
        raise HTTPException(404, "User not found")
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"leaderboard_hidden_by_admin": True}},
    )
    logger.info(
        "admin=%s hid user=%s (%s) from leaderboard",
        admin.get("email"), user_id, target.get("email"),
    )
    return {"ok": True, "user_id": user_id, "hidden": True}


@router.post("/admin/leaderboard/users/{user_id}/unhide")
async def admin_unhide_user(user_id: str, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"leaderboard_hidden_by_admin": False}},
    )
    return {"ok": True, "user_id": user_id, "hidden": False}


# ---------- Reset a specific user's completion count ----------
@router.post("/admin/leaderboard/users/{user_id}/reset")
async def admin_reset_user(user_id: str, admin: dict = Depends(require_admin)):
    """Delete every ``tracking`` row with status=completed for this user.
    Wishlist rows are preserved. Practice-log sessions are preserved (they
    represent activity, not a scoreboard-worthy accomplishment)."""
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1})
    if not target:
        raise HTTPException(404, "User not found")
    result = await db.tracking.delete_many({
        "user_id": user_id,
        "status": "completed",
    })
    logger.warning(
        "admin=%s reset user=%s (%s) — removed %d completions",
        admin.get("email"), user_id, target.get("email"), result.deleted_count,
    )
    return {
        "ok": True,
        "user_id": user_id,
        "removed_completions": result.deleted_count,
    }


# ---------- Season epoch (whole-board reset) ----------
@router.get("/admin/leaderboard/season")
async def admin_get_season(admin: dict = Depends(require_admin)):
    """Return current season metadata + list of archived past seasons."""
    cur = await db.leaderboard_state.find_one({"key": "season"}, {"_id": 0})
    past = (
        await db.leaderboard_seasons.find({}, {"_id": 0})
        .sort("started_at", -1)
        .to_list(100)
    )
    return {"current": cur or {}, "past": past}


@router.post("/admin/leaderboard/season/reset")
async def admin_reset_season(
    admin: dict = Depends(require_admin),
    label: str = Body("", embed=True),
):
    """Roll the leaderboard into a new season.

    Non-destructive: raw completions in ``tracking`` are preserved. What
    changes is the aggregation cutoff — the public "All Time" view now
    filters completions to those made on/after this instant.

    The previous season's top 10 (if any) is archived to
    ``leaderboard_seasons`` for historical reference.
    """
    now = now_iso()
    old = await db.leaderboard_state.find_one({"key": "season"}, {"_id": 0})
    prev_started_at = (old or {}).get("started_at")

    # Archive the previous season's top 10 (if there was one).
    if prev_started_at:
        pipeline = [
            {"$match": {"status": "completed", "updated_at": {"$gte": prev_started_at}}},
            {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
        rows = await db.tracking.aggregate(pipeline).to_list(20)
        user_ids = [r["_id"] for r in rows if r.get("_id")]
        users_docs = (
            await db.users.find(
                {"user_id": {"$in": user_ids}},
                {"_id": 0, "user_id": 1, "name": 1, "picture": 1},
            ).to_list(len(user_ids) or 1)
        )
        by_id = {u["user_id"]: u for u in users_docs}
        top: list = []
        for i, r in enumerate(rows, start=1):
            u = by_id.get(r["_id"])
            if not u:
                continue
            top.append({
                "rank": i,
                "name": u.get("name", "Dancer"),
                "picture": u.get("picture", ""),
                "count": int(r["count"]),
            })
        await db.leaderboard_seasons.insert_one({
            "id": f"season_{uuid.uuid4().hex[:10]}",
            "label": (old or {}).get("label", "") or "Previous season",
            "started_at": prev_started_at,
            "ended_at": now,
            "top": top,
            "ended_by": admin.get("email", ""),
        })

    await db.leaderboard_state.update_one(
        {"key": "season"},
        {
            "$set": {
                "key": "season",
                "started_at": now,
                "label": (label or "").strip(),
                "started_by": admin.get("email", ""),
            }
        },
        upsert=True,
    )
    logger.warning(
        "admin=%s rolled leaderboard to new season starting at %s",
        admin.get("email"), now,
    )
    return {"ok": True, "started_at": now, "label": (label or "").strip()}


@router.delete("/admin/leaderboard/season")
async def admin_clear_season(admin: dict = Depends(require_admin)):
    """Reset the season pointer back to "since the beginning of time".
    Useful if an admin created a season by mistake and wants to restore
    the classic all-time view. Existing archives in ``leaderboard_seasons``
    are preserved.
    """
    await db.leaderboard_state.delete_one({"key": "season"})
    logger.warning(
        "admin=%s cleared the current leaderboard season pointer",
        admin.get("email"),
    )
    return {"ok": True, "cleared": True}
