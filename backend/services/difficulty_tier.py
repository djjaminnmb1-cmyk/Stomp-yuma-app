"""Difficulty tier classification — "what level is this dancer at?"

Returns the dancer's **most-practiced difficulty tier in the last 30
days**. A dancer who's been working through Beginner material gets
``"Beginner"``; the same dancer three months later, after moving on to
Improvers, gets ``"Improver"``. Keeps the audience targeting fresh
without any explicit action from the user.

Why 30 days?
------------
Short enough that it reflects the dancer's CURRENT focus (not a
3-year-ago impulse to practice Advanced choreography once), long
enough that infrequent dancers still have signal.

Return values
-------------
One of the canonical tiers in ``KNOWN_TIERS``, or ``None`` when the
dancer has no practice sessions in the last 30 days (unclassifiable;
audience filters treat them as excluded unless the pool is
"everyone").
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from core.database import db

logger = logging.getLogger(__name__)

# Must align with ``dances.difficulty`` values seeded via
# ``import_catalog.ALLOWED_LEVELS``. Order matters — tier labels in
# this list are shown in the admin picker in this order.
KNOWN_TIERS: tuple[str, ...] = (
    "Beginner",
    "Improver",
    "High Improver",
    "Intermediate",
    "Advanced",
)
TIERS_SET = set(KNOWN_TIERS)


def _lookback_cutoff_iso() -> str:
    return (
        datetime.now(timezone.utc) - timedelta(days=30)
    ).isoformat()


async def tier_for_user(user_id: str) -> Optional[str]:
    """Return the user's most-practiced tier in the last 30 days, or
    ``None`` if they have no recent practice.
    """
    cutoff = _lookback_cutoff_iso()
    pipeline = [
        {
            "$match": {
                "user_id": user_id,
                "last_opened_at": {"$gte": cutoff},
            }
        },
        {
            "$lookup": {
                "from": "dances",
                "localField": "dance_id",
                "foreignField": "id",
                "as": "d",
            }
        },
        {"$unwind": "$d"},
        {
            "$group": {
                "_id": "$d.difficulty",
                "total": {"$sum": "$count"},
            }
        },
        {"$sort": {"total": -1}},
        {"$limit": 1},
    ]
    try:
        rows = await db.practice_sessions.aggregate(pipeline).to_list(1)
    except Exception as e:
        logger.warning(f"tier_for_user aggregation failed: {e}")
        return None
    if not rows:
        return None
    tier = rows[0].get("_id") or ""
    if tier in TIERS_SET:
        return tier
    # Normalize common variants (case, trailing whitespace).
    norm = (tier or "").strip()
    if norm in TIERS_SET:
        return norm
    # Case-insensitive match — some older imports used "intermediate".
    for canonical in KNOWN_TIERS:
        if canonical.lower() == norm.lower():
            return canonical
    return None


async def user_ids_matching_tiers(tiers: list[str]) -> set[str]:
    """Return the set of user_ids whose current tier is in ``tiers``.

    Used by the announcement audience resolver — called with a small
    tier list, so a loop-over-users is fine for our scale (<10k).
    For a larger userbase this should become a materialised view
    maintained incrementally.
    """
    if not tiers:
        return set()
    requested = {t for t in tiers if t in TIERS_SET}
    if not requested:
        return set()
    hits: set[str] = set()
    cutoff = _lookback_cutoff_iso()
    # Aggregate once over all users — faster than N round-trips.
    pipeline = [
        {"$match": {"last_opened_at": {"$gte": cutoff}}},
        {
            "$lookup": {
                "from": "dances",
                "localField": "dance_id",
                "foreignField": "id",
                "as": "d",
            }
        },
        {"$unwind": "$d"},
        {
            "$group": {
                "_id": {
                    "user_id": "$user_id",
                    "difficulty": "$d.difficulty",
                },
                "total": {"$sum": "$count"},
            }
        },
        {"$sort": {"total": -1}},
        {
            "$group": {
                "_id": "$_id.user_id",
                "top": {"$first": "$_id.difficulty"},
            }
        },
    ]
    try:
        async for row in db.practice_sessions.aggregate(pipeline):
            top = (row.get("top") or "").strip()
            if top in requested:
                hits.add(row["_id"])
    except Exception as e:
        logger.warning(f"user_ids_matching_tiers aggregation failed: {e}")
    return hits
