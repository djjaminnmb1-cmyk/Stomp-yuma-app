"""Per-user push notification preferences.

Each user has a small ``notification_prefs`` sub-document that gates
which fan-out helpers actually deliver a push to them. Missing keys
default to ``True`` (opt-out, not opt-in) — a user who has never
touched the settings screen should still receive every alert.

Categories
----------
* ``class_alerts``          — instructor posts a new class
* ``event_alerts``          — instructor posts a new event
* ``choreographer_alerts``  — a followed choreographer's new dance
* ``mention_alerts``        — someone tags you in chat
* ``reminder_alerts``       — 24h-before-class reminder (existing)
* ``chat_alerts``           — any new post in the instructor chat room

Contract
--------
* Read-through helpers:
    ``get_prefs(user_id) -> dict``
    ``filter_recipients(user_ids, category) -> list[str]``
* Write:
    ``update_prefs(user_id, prefs) -> dict``
"""
from __future__ import annotations

import logging
from typing import Optional

from core.database import db

logger = logging.getLogger(__name__)


ALL_CATEGORIES = (
    "class_alerts",
    "event_alerts",
    "choreographer_alerts",
    "mention_alerts",
    "reminder_alerts",
    "chat_alerts",
)


def _sanitize(prefs: dict | None) -> dict:
    """Coerce arbitrary input into the canonical shape. Unknown keys
    are silently dropped. Any provided value is boolean-cast."""
    prefs = prefs or {}
    return {k: bool(prefs.get(k, True)) for k in ALL_CATEGORIES}


async def get_prefs(user_id: str) -> dict:
    """Return the caller's preferences with every category defaulted
    to True. Missing users still return a valid payload — safest
    behaviour for a first-run experience.
    """
    if not user_id:
        return _sanitize(None)
    row = await db.users.find_one(
        {"user_id": user_id}, {"_id": 0, "notification_prefs": 1}
    )
    stored = (row or {}).get("notification_prefs") or {}
    return _sanitize(stored)


async def update_prefs(user_id: str, prefs: dict) -> dict:
    """Write the sanitized prefs back. Returns the final shape."""
    clean = _sanitize(prefs)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"notification_prefs": clean}},
    )
    return clean


async def filter_recipients(
    user_ids: list[str], category: str
) -> list[str]:
    """Given a candidate list of recipients, drop anyone who has
    muted this category. Unknown categories are treated as "always
    deliver" so misuse can't accidentally mute users.
    """
    if not user_ids or not category or category not in ALL_CATEGORIES:
        return list(user_ids or [])
    # Users with an explicit false → skip. Missing sub-doc / key → keep.
    muted = set()
    async for row in db.users.find(
        {
            "user_id": {"$in": user_ids},
            f"notification_prefs.{category}": False,
        },
        {"_id": 0, "user_id": 1},
    ):
        muted.add(row["user_id"])
    if not muted:
        return list(user_ids)
    return [u for u in user_ids if u not in muted]


async def is_muted(user_id: str, category: str) -> bool:
    """Convenience for single-user checks (e.g. reminder scheduler)."""
    if not user_id or category not in ALL_CATEGORIES:
        return False
    prefs = await get_prefs(user_id)
    return not prefs.get(category, True)
