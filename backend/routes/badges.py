"""Achievement & streak read endpoints.

Write-side ``award_and_streak`` is called inline from the tracking /
attendance / practice-log endpoints so the client can render fresh
badges immediately in the same response payload. The routes below are
purely for the Achievements screen and Home streak card.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core.security import get_current_user
from services.badges import (
    get_streak,
    list_badges_for,
    mark_badges_seen,
)

router = APIRouter()


class MarkSeenBody(BaseModel):
    ids: Optional[List[str]] = None  # None / [] → mark ALL earned as seen


@router.get("/badges")
async def get_my_badges(user: dict = Depends(get_current_user)):
    """Return the full catalog with the caller's progress + earned status.

    Also returns the caller's streak so the Home card and Achievements
    screen can render in one round-trip.
    """
    badges = await list_badges_for(user["user_id"])
    streak = await get_streak(user["user_id"])
    # Convenience derivations for the client
    total_earned = sum(1 for b in badges if b.get("earned"))
    unseen = sum(1 for b in badges if b.get("earned") and not b.get("seen"))
    return {
        "badges": badges,
        "streak": streak,
        "total_earned": total_earned,
        "total_badges": len(badges),
        "unseen_count": unseen,
    }


@router.post("/badges/mark-seen")
async def post_mark_seen(
    body: MarkSeenBody, user: dict = Depends(get_current_user)
):
    """Flip ``seen=True`` on all (or specified) earned badges."""
    n = await mark_badges_seen(user["user_id"], body.ids or None)
    return {"ok": True, "updated": n}


@router.get("/streak")
async def get_my_streak(user: dict = Depends(get_current_user)):
    """Lightweight streak-only endpoint — used by the Home card so we don't
    have to pull the whole badge catalog on every home render.
    """
    return await get_streak(user["user_id"])
