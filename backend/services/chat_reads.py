"""Chat-room read receipts.

Design
------
* One row per (user_id) in ``chat_reads``: ``{user_id, last_read_at,
  updated_at}``.  We're intentionally NOT tracking a per-message read
  ledger — the chat room is a single stream, so a single high-water
  timestamp is enough to render "who's caught up to which message".
* ``mark_read`` bumps the timestamp to the newest message the caller
  saw. Idempotent — safe to call on every open + every scroll.
* ``recent_readers`` returns the last-read timestamps for every
  instructor / admin in the room so the client can compute the
  "seen by … " avatar rows against the message list it already has.

Privacy
-------
Reads are room-scoped, not per-message, so the API never leaks WHICH
message a specific user viewed last past the second-precision
timestamp. Users are also excluded from their own read list
client-side (nobody wants to see "read by me" on their own bubbles).
"""
from __future__ import annotations

import logging
from typing import Optional

from core.database import db
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)


# ------------- Index management -------------
_INDEXES_READY = False


async def ensure_indexes() -> None:
    """Create the unique index on ``user_id``. Idempotent."""
    global _INDEXES_READY
    if _INDEXES_READY:
        return
    try:
        await db.chat_reads.create_index("user_id", unique=True, name="uniq_user")
        _INDEXES_READY = True
    except Exception as e:  # pragma: no cover
        logger.warning(f"chat_reads index setup failed: {e}")


# ------------- Writes -------------
async def mark_read(user_id: str, *, at: Optional[str] = None) -> str:
    """Set the caller's ``last_read_at`` timestamp to the newer of the
    current value and ``at`` (defaults to ``now``). Never rewinds — a
    late-arriving stale mark from a background poll can't overwrite a
    fresher read stamped by the foreground UI.

    Returns the timestamp that was persisted.
    """
    if not user_id:
        return ""
    now = at or now_iso()
    await db.chat_reads.update_one(
        {"user_id": user_id},
        {
            "$max": {"last_read_at": now},
            "$set": {"updated_at": now_iso()},
            "$setOnInsert": {"user_id": user_id},
        },
        upsert=True,
    )
    doc = await db.chat_reads.find_one({"user_id": user_id}, {"_id": 0, "last_read_at": 1})
    return (doc or {}).get("last_read_at", "") or now


# ------------- Reads -------------
async def read_state_for_room() -> list[dict]:
    """Return every instructor's / admin's current ``last_read_at``,
    joined with their display name + profile picture so the client can
    render the "seen by" avatar row without a second round-trip per
    user. Users with no ``chat_reads`` row yet return ``last_read_at=""``
    so the client treats them as "hasn't opened the room yet".
    """
    # Every user in the room's viewership pool — instructors + admins.
    pool: dict[str, dict] = {}
    async for row in db.users.find(
        {"$or": [{"is_instructor": True}, {"is_admin": True}]},
        {"_id": 0, "user_id": 1, "name": 1, "picture": 1},
    ):
        uid = row.get("user_id")
        if not uid:
            continue
        pool[uid] = {
            "user_id": uid,
            "user_name": row.get("name", "") or "",
            "picture": row.get("picture", "") or "",
            "last_read_at": "",
        }
    if not pool:
        return []
    # Overlay the read timestamps.
    async for row in db.chat_reads.find(
        {"user_id": {"$in": list(pool.keys())}},
        {"_id": 0, "user_id": 1, "last_read_at": 1},
    ):
        uid = row.get("user_id")
        if uid and uid in pool:
            pool[uid]["last_read_at"] = row.get("last_read_at", "") or ""
    # Stable order: users with a read timestamp first (most-recent first),
    # then everyone else alphabetically. Callers can re-sort as they like.
    seen = [p for p in pool.values() if p["last_read_at"]]
    unseen = [p for p in pool.values() if not p["last_read_at"]]
    seen.sort(key=lambda p: p["last_read_at"], reverse=True)
    unseen.sort(key=lambda p: (p["user_name"] or "").lower())
    return seen + unseen


async def purge_user(user_id: str) -> None:
    """Called from account-deletion. Wipes the user's read pointer."""
    if user_id:
        await db.chat_reads.delete_many({"user_id": user_id})
