"""Boot Scoot Board Prizes.

Admins configure a set of prizes displayed on the Leaderboard screen — one
per rank slot (1st / 2nd / 3rd), per range (week / month / all). All users
see the prizes for the range they're currently viewing.

Payload per prize slot:
    - ``rank`` — 1 / 2 / 3
    - ``range`` — "all" | "week" | "month"
    - ``title`` — headline, e.g. "1st Place — Gift Card"
    - ``description`` — details, e.g. "$50 Amazon gift card"
    - ``image`` — optional base64 data URL (capped at 2MB to keep the DB
      lean; larger and we'd want blob storage instead)

Storage: one Mongo doc per (range, rank) keyed unique — upsert on write.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.database import db
from core.security import require_admin
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)
router = APIRouter()

_VALID_RANGES = {"all", "week", "month"}
_VALID_RANKS = {1, 2, 3}


class PrizeIn(BaseModel):
    title: str = ""
    description: str = ""
    image: str = ""  # base64 data URL — optional


def _prize_doc(range_: str, rank: int, p: dict | None) -> dict:
    return {
        "range": range_,
        "rank": rank,
        "title": (p or {}).get("title", "") or "",
        "description": (p or {}).get("description", "") or "",
        "image": (p or {}).get("image", "") or "",
        "updated_at": (p or {}).get("updated_at", "") or "",
    }


@router.get("/leaderboard/prizes")
async def list_prizes(range: str = "all"):
    """Public: list the 3 prize slots for the given range.

    Always returns exactly 3 rows (rank 1/2/3), filling gaps with empty
    placeholders so the client can render a stable 3-slot podium.
    """
    if range not in _VALID_RANGES:
        raise HTTPException(400, "range must be one of all|week|month")
    docs = await db.leaderboard_prizes.find(
        {"range": range}, {"_id": 0}
    ).to_list(10)
    by_rank = {d.get("rank"): d for d in docs if d.get("rank") in _VALID_RANKS}
    out = [_prize_doc(range, r, by_rank.get(r)) for r in (1, 2, 3)]
    return {"range": range, "prizes": out}


@router.put("/admin/leaderboard/prizes/{rank}")
async def upsert_prize(
    rank: int,
    body: PrizeIn,
    range: str = "all",
    admin: dict = Depends(require_admin),
):
    """Admin: create / update a single prize slot for a range."""
    if range not in _VALID_RANGES:
        raise HTTPException(400, "range must be one of all|week|month")
    if rank not in _VALID_RANKS:
        raise HTTPException(400, "rank must be 1, 2 or 3")
    image = (body.image or "").strip()
    if image and len(image) > 2_100_000:
        raise HTTPException(413, "Prize image is too large — please pick a smaller file (max ~2MB).")

    payload = {
        "range": range,
        "rank": rank,
        "title": (body.title or "").strip()[:120],
        "description": (body.description or "").strip()[:400],
        "image": image,
        "updated_at": now_iso(),
        "updated_by": admin.get("email", ""),
    }
    await db.leaderboard_prizes.update_one(
        {"range": range, "rank": rank},
        {"$set": payload},
        upsert=True,
    )
    payload.pop("_id", None)
    return payload


@router.delete("/admin/leaderboard/prizes/{rank}")
async def delete_prize(
    rank: int,
    range: str = "all",
    admin: dict = Depends(require_admin),
):
    if range not in _VALID_RANGES:
        raise HTTPException(400, "range must be one of all|week|month")
    if rank not in _VALID_RANKS:
        raise HTTPException(400, "rank must be 1, 2 or 3")
    await db.leaderboard_prizes.delete_one({"range": range, "rank": rank})
    return {"ok": True, "range": range, "rank": rank}
