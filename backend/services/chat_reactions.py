"""Emoji reactions on chat-room messages.

Design mirrors the existing ``feed_reactions`` collection so client
code stays symmetric:

    ``{message_id, user_id, user_name, kind, created_at}``

* Unique on ``(user_id, message_id, kind)`` so a single user can't
  double-add the same emoji, but CAN add multiple different emojis
  to the same message (like Slack / iMessage tapback).
* ``kind`` is a short emoji token; we don't try to validate against
  a static list — instructors might want a niche emoji we haven't
  thought of. Length-cap keeps it small so someone can't paste a
  paragraph in.

Reads
-----
``summarize_for_messages(ids)`` returns a compact bucket per message:

    {msg_id: {"counts": {"👍": 3, "🎉": 1}, "mine": ["🎉"]}}

That's the whole shape the chat UI needs — total per emoji plus which
emojis THIS user has already applied (so the bubble can highlight
their own picks in the reaction chip).
"""
from __future__ import annotations

import logging
from typing import Optional

from core.database import db
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)


# Small guard so a user can't paste a wall of text into a `kind`
# field. Every real emoji fits in << 12 chars (including surrogate
# pairs + combining marks). Kept slightly generous to accommodate
# regional flags.
_MAX_KIND_LEN = 16


# ------------- Index management -------------
_INDEXES_READY = False


async def ensure_indexes() -> None:
    global _INDEXES_READY
    if _INDEXES_READY:
        return
    try:
        await db.chat_reactions.create_index(
            [("user_id", 1), ("message_id", 1), ("kind", 1)],
            unique=True,
            name="uniq_user_msg_kind",
        )
        await db.chat_reactions.create_index("message_id", name="by_message")
        _INDEXES_READY = True
    except Exception as e:  # pragma: no cover
        logger.warning(f"chat_reactions index setup failed: {e}")


def _clean_kind(kind: str) -> str:
    """Trim + length-cap. Empty strings return empty (caller decides)."""
    k = (kind or "").strip()
    if len(k) > _MAX_KIND_LEN:
        k = k[:_MAX_KIND_LEN]
    return k


# ------------- Toggle -------------
async def toggle(
    *,
    message_id: str,
    kind: str,
    user_id: str,
    user_name: str,
) -> dict:
    """Toggle a reaction for the caller on the given message.

    Returns ``{added: bool, kind: str}``. ``added=True`` means the row
    was inserted (net-new); ``added=False`` means the existing row was
    removed. Idempotent under network retry — a duplicate insert
    attempt just becomes a delete on the second call.
    """
    k = _clean_kind(kind)
    if not message_id or not k or not user_id:
        return {"added": False, "kind": k}
    key = {"message_id": message_id, "user_id": user_id, "kind": k}
    existing = await db.chat_reactions.find_one(key, {"_id": 1})
    if existing:
        await db.chat_reactions.delete_one(key)
        return {"added": False, "kind": k}
    await db.chat_reactions.insert_one({
        **key,
        "user_name": user_name or "",
        "created_at": now_iso(),
    })
    return {"added": True, "kind": k}


# ------------- Reads -------------
async def summarize_for_messages(
    message_ids: list[str], viewer_id: str
) -> dict:
    """Return a compact per-message reaction bucket.

    Shape::

        {msg_id: {"counts": {"👍": 3, "🎉": 1}, "mine": ["🎉"]}}

    Messages with no reactions are OMITTED (the client can treat any
    missing id as "no reactions"). That keeps the JSON payload small
    on a screenful of clean messages.
    """
    if not message_ids:
        return {}
    out: dict[str, dict] = {}
    # Aggregate the counts in one round-trip.
    pipeline = [
        {"$match": {"message_id": {"$in": message_ids}}},
        {"$group": {
            "_id": {"message_id": "$message_id", "kind": "$kind"},
            "count": {"$sum": 1},
            "mine": {
                "$max": {
                    "$cond": [{"$eq": ["$user_id", viewer_id]}, 1, 0]
                }
            },
        }},
    ]
    async for row in db.chat_reactions.aggregate(pipeline):
        mid = row["_id"]["message_id"]
        kind = row["_id"]["kind"]
        bucket = out.setdefault(mid, {"counts": {}, "mine": []})
        bucket["counts"][kind] = int(row.get("count") or 0)
        if int(row.get("mine") or 0):
            bucket["mine"].append(kind)
    return out


async def purge_message(message_id: str) -> None:
    """Called when a chat message is deleted — cascade the reactions."""
    if message_id:
        await db.chat_reactions.delete_many({"message_id": message_id})


async def purge_user(user_id: str) -> None:
    """Called from account-deletion."""
    if user_id:
        await db.chat_reactions.delete_many({"user_id": user_id})
