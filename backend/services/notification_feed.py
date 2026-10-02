"""Persistent in-app notification feed (a.k.a. "Notification Center").

Every push the user receives — and some in-app events that never fire a
push (new follower, RSVP to your event) — is also written to the
``notification_events`` collection. The user can scroll back through
their history, mark rows read, delete junk, and never miss a push just
because they tapped away before the OS banner finished sliding in.

Shape of a stored event::

    {
        "id":        "evt_<hex>",       # client-side id
        "user_id":   "<recipient uid>", # one row per recipient per fan-out
        "kind":      "announcement|library_new_dance|library_new_class|
                     admin_pending_dance|admin_instructor_grant|
                     chat_mention|chat_message|new_dance|new_class|
                     new_event|class_reminder|new_follower|event_rsvp",
        "title":     "<pre-rendered title>",
        "body":      "<pre-rendered body>",
        "deeplink":  "/announcements"   # expo-router path, no host
        "metadata":  { "entity_id": "...", ...free-form },
        "created_at": "<iso>",
        "read_at":    "<iso>" | null,
    }

Retention
---------
A TTL index on ``created_at`` purges rows after **90 days** so the
collection never balloons. Users can also delete individual rows.

Idempotency
-----------
Not globally — one push can be re-sent (edge case; unusual) and the
user will see two rows. That matches the "every push I got" contract
better than a dedupe would. Callers that fan out to the same user from
the same entity (e.g. choreographer-follower push + library broadcast)
already dedupe at the push layer via their own ledgers.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Iterable, Optional

from core.database import db
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)


# ``kinds`` with an icon hint used by the frontend. Pure metadata — the
# frontend has its own map but keeping one here lets backend callers
# pass a kind without worrying about typos.
KNOWN_KINDS = {
    "announcement",
    "library_new_dance",
    "library_new_class",
    "admin_pending_dance",
    "admin_instructor_grant",
    "chat_mention",
    "chat_message",
    "new_dance",             # follower-targeted
    "new_class",             # follower-targeted
    "new_event",             # follower-targeted
    "class_reminder",
    "new_follower",
    "event_rsvp",
}

RETENTION_SECONDS = 90 * 24 * 60 * 60  # 90 days
_INDEXES_READY = False


async def ensure_indexes() -> None:
    """One-shot per process: TTL on ``created_at`` + lookup indexes.

    The TTL expects an ISO-formatted ``created_at`` so Mongo auto-prunes
    after 90 days. We ALSO add a ``(user_id, created_at desc)`` index
    for the newest-first feed query and a ``(user_id, read_at)`` index
    for the unread-count query.
    """
    global _INDEXES_READY
    if _INDEXES_READY:
        return
    try:
        # Mongo TTL only works on native date fields — we store ISO
        # strings for consistency with the rest of the app, so instead
        # of a TTL index we rely on a daily scheduler sweep (see
        # ``services/scheduler.py::purge_old_notifications``).
        await db.notification_events.create_index(
            [("user_id", 1), ("created_at", -1)],
            name="user_created_desc",
        )
        await db.notification_events.create_index(
            [("user_id", 1), ("read_at", 1)],
            name="user_read_at",
        )
        await db.notification_events.create_index(
            [("id", 1)],
            unique=True,
            name="uniq_id",
        )
        _INDEXES_READY = True
    except Exception as e:
        logger.warning(f"notification_events index setup failed: {e}")


async def log_event(
    *,
    recipients: Iterable[str],
    kind: str,
    title: str,
    body: str,
    deeplink: str = "/",
    metadata: Optional[dict] = None,
) -> int:
    """Bulk-insert one row per recipient. Returns the actual insert
    count (duplicates / empty are silently skipped). Never raises —
    the caller's push flow must always succeed even if the feed write
    fails."""
    uids = [u for u in (recipients or []) if u]
    if not uids:
        return 0
    if kind not in KNOWN_KINDS:
        logger.info(f"notification_feed.log_event unknown kind={kind!r}")
    now = now_iso()
    docs = [
        {
            "id": f"evt_{uuid.uuid4().hex[:16]}",
            "user_id": uid,
            "kind": kind,
            "title": title or "",
            "body": body or "",
            "deeplink": deeplink or "/",
            "metadata": metadata or {},
            "created_at": now,
            "read_at": None,
        }
        for uid in uids
    ]
    try:
        res = await db.notification_events.insert_many(docs, ordered=False)
        return len(res.inserted_ids)
    except Exception as e:
        logger.warning(f"notification_feed.log_event insert failed: {e}")
        return 0


async def list_for_user(
    user_id: str,
    *,
    limit: int = 50,
    before_created_at: Optional[str] = None,
) -> list[dict]:
    """Return rows for ``user_id`` newest first, capped at ``limit``.
    If ``before_created_at`` is set, returns rows strictly OLDER than
    that cursor (keyset pagination — stable across inserts).
    """
    q: dict[str, Any] = {"user_id": user_id}
    if before_created_at:
        q["created_at"] = {"$lt": before_created_at}
    cur = (
        db.notification_events.find(q, {"_id": 0})
        .sort("created_at", -1)
        .limit(max(1, min(int(limit or 50), 200)))
    )
    return [row async for row in cur]


async def count_unread(user_id: str) -> int:
    try:
        return int(
            await db.notification_events.count_documents(
                {"user_id": user_id, "read_at": None}
            )
        )
    except Exception:
        return 0


async def mark_read(user_id: str, event_id: str) -> bool:
    """Returns True if a row was actually flipped from unread→read."""
    res = await db.notification_events.update_one(
        {"id": event_id, "user_id": user_id, "read_at": None},
        {"$set": {"read_at": now_iso()}},
    )
    return bool(int(res.modified_count or 0) > 0)


async def mark_all_read(user_id: str) -> int:
    """Returns the count of rows flipped."""
    res = await db.notification_events.update_many(
        {"user_id": user_id, "read_at": None},
        {"$set": {"read_at": now_iso()}},
    )
    return int(res.modified_count or 0)


async def delete_event(user_id: str, event_id: str) -> bool:
    res = await db.notification_events.delete_one(
        {"id": event_id, "user_id": user_id}
    )
    return bool(int(res.deleted_count or 0) > 0)


async def purge_user(user_id: str) -> None:
    """Called from account-deletion."""
    await db.notification_events.delete_many({"user_id": user_id})


async def purge_expired() -> int:
    """Daily scheduler sweep — delete any row older than
    ``RETENTION_SECONDS``. Returns the count deleted."""
    from datetime import datetime, timedelta, timezone
    cutoff = (
        datetime.now(timezone.utc) - timedelta(seconds=RETENTION_SECONDS)
    ).isoformat()
    try:
        res = await db.notification_events.delete_many(
            {"created_at": {"$lt": cutoff}}
        )
        n = int(res.deleted_count or 0)
        if n:
            logger.info(
                f"notification_feed.purge_expired removed {n} rows "
                f"older than {cutoff}"
            )
        return n
    except Exception as e:
        logger.warning(f"notification_feed.purge_expired failed: {e}")
        return 0
