"""Admin-authored announcements — a lightweight "pin" that fans out
to every user as a push + a durable row they can browse later.

Routes (see ``routes/announcements.py``):

* ``POST   /api/admin/announcements``        — admin creates (or schedules)
* ``PATCH  /api/admin/announcements/{id}``   — admin edits a NOT-YET-sent pin
* ``DELETE /api/admin/announcements/{id}``   — admin retracts
* ``GET    /api/admin/announcements/scheduled`` — admin lists pending
* ``GET    /api/announcements``              — any user reads the sent feed

Scheduling
----------
Announcements now carry an optional ``scheduled_for`` ISO datetime:

* ``scheduled_for = None`` → broadcast immediately (default; backward-
  compat with every existing call).
* ``scheduled_for = <future ISO>`` → row is inserted with
  ``broadcasted_at = None``, and the scheduler
  (:func:`services.scheduler.broadcast_pending_announcements`) runs
  every minute to fire any whose scheduled time has arrived.

Once broadcast, ``broadcasted_at`` is stamped and the row becomes
immutable (PATCH 400s). The user-facing ``/announcements`` feed only
surfaces rows with ``broadcasted_at`` set so dancers don't see draft
pins. The admin-only ``/scheduled`` endpoint surfaces the opposite —
rows pending future broadcast — so admins can edit or cancel.

Delivery rules
--------------
1. **Recipient pool** = every user, minus the author.
2. Exclude anyone whose ``notification_prefs.announcements=False``
   via the shared ``filter_recipients`` helper (default True).
3. Every recipient also gets a persistent ``notification_events`` row
   logged via ``services.notification_feed.log_event`` so the push
   lives in the user's Notification Center forever (90-day retention).

The push + the DB write are decoupled: the row is inserted FIRST so
the "Announcements" feed always has the latest message even if the
push relay is down. The push itself is best-effort and never raises.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from core.database import db
from core.push_service import send_push_localised
from core.time_helpers import now_iso
from services.notification_feed import log_event
from services.notification_prefs import filter_recipients

logger = logging.getLogger(__name__)


_ANN_MAX_TITLE = 120
_ANN_MAX_BODY = 2000


def _normalize_scheduled_for(value: Optional[str]) -> Optional[str]:
    """Accept an ISO-8601 string and return the normalized UTC-ISO
    form, or ``None`` if the input is falsy. Raises ``ValueError`` on
    unparseable input so route-level validation can 422 it.
    """
    if not value:
        return None
    s = value.strip()
    if not s:
        return None
    # Common pattern — Python's fromisoformat accepts the "T..." form
    # on 3.11+. Trailing "Z" is accepted on 3.11+ too but we normalize
    # defensively for 3.10 fallbacks.
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        # Treat naive strings as UTC to avoid local-tz drift between
        # the admin's phone and the server.
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat()


async def _broadcast_now(
    doc: dict,
    *,
    log_feed: bool = True,
) -> dict:
    """Run the push + feed fan-out for a stored row. Idempotent:
    callers must only run this ONCE per row (the ``broadcasted_at``
    guard belongs to the caller — ``create_and_broadcast`` /
    ``broadcast_pending_announcements`` both set it).
    """
    author_id = doc.get("created_by") or ""
    title = doc.get("title") or ""
    body = doc.get("body") or ""

    pool: list[str] = []
    async for row in db.users.find({}, {"_id": 0, "user_id": 1}):
        uid = row.get("user_id")
        if uid and uid != author_id:
            pool.append(uid)
    if not pool:
        return doc

    try:
        pool = await filter_recipients(pool, "announcements")
    except Exception:
        pass

    if not pool:
        return doc

    preview = body[:140]
    try:
        await send_push_localised(
            recipients=pool,
            title_key="push.announcement.title",
            body_key="push.announcement.body",
            params={"title": title or "Announcement", "preview": preview},
            data={
                "deeplink": "/announcements",
                "action_url": "/announcements",
                "kind": "announcement",
                "announcement_id": doc["id"],
            },
            idempotency_key=f"announcement-{doc['id']}",
        )
    except Exception as e:  # pragma: no cover — relay flake
        logger.warning(f"announcement push failed: {e}")

    # Also drop a row into every recipient's Notification Center so
    # the push lives beyond the OS banner.
    if log_feed:
        try:
            await log_event(
                recipients=pool,
                kind="announcement",
                title=title,
                body=preview,
                deeplink="/announcements",
                metadata={"entity_id": doc["id"]},
            )
        except Exception as e:
            logger.warning(f"announcement feed log failed: {e}")

    return doc


async def create_and_broadcast(
    *,
    title: str,
    body: str,
    author: dict,
    scheduled_for: Optional[str] = None,
) -> dict:
    """Insert the announcement row AND (unless scheduled) fan out the
    push. For scheduled rows the push waits for the minute-interval
    scheduler job.

    Returns the stored announcement dict so the admin UI can show the
    just-created item at the top of its list without a second GET.
    """
    title = (title or "").strip()[:_ANN_MAX_TITLE]
    body = (body or "").strip()[:_ANN_MAX_BODY]
    author_id = (author or {}).get("user_id") or ""
    author_name = (
        (author or {}).get("name")
        or (author or {}).get("email")
        or "Admin"
    )
    normalized_scheduled = _normalize_scheduled_for(scheduled_for)
    now = now_iso()

    doc = {
        "id": f"ann_{uuid.uuid4().hex[:12]}",
        "title": title,
        "body": body,
        "created_by": author_id,
        "created_by_name": author_name,
        "created_at": now,
        "scheduled_for": normalized_scheduled,  # None = immediate
        "broadcasted_at": None,
    }
    await db.announcements.insert_one(doc)
    doc.pop("_id", None)

    # If scheduled for the future, bail — the scheduler will fire it.
    if normalized_scheduled and normalized_scheduled > now:
        return doc

    await _broadcast_now(doc)
    await db.announcements.update_one(
        {"id": doc["id"]}, {"$set": {"broadcasted_at": now_iso()}}
    )
    doc["broadcasted_at"] = now_iso()
    return doc


async def broadcast_pending_announcements() -> int:
    """Scheduler-driven: find announcements whose ``scheduled_for``
    has arrived and which haven't been broadcast yet, then fire each.
    Returns the number of rows broadcast on this tick.

    Safe to run concurrently with ``create_and_broadcast`` — the
    ``broadcasted_at`` guard prevents double-firing.
    """
    now = now_iso()
    sent = 0
    cur = db.announcements.find(
        {
            "scheduled_for": {"$ne": None, "$lte": now},
            "broadcasted_at": None,
        },
        {"_id": 0},
    )
    async for row in cur:
        try:
            # Guard against double-fire if two scheduler ticks run
            # within the same minute (shouldn't happen, but belt-and-
            # braces): claim the row by stamping broadcasted_at FIRST.
            res = await db.announcements.update_one(
                {"id": row["id"], "broadcasted_at": None},
                {"$set": {"broadcasted_at": now_iso()}},
            )
            if int(res.modified_count or 0) == 0:
                continue
            await _broadcast_now(row)
            sent += 1
        except Exception as e:
            logger.exception(
                f"broadcast_pending_announcements failed on {row.get('id')}: {e}"
            )
    if sent:
        logger.info(f"broadcast_pending_announcements fired {sent} pin(s)")
    return sent


async def update_scheduled(
    ann_id: str,
    *,
    title: Optional[str] = None,
    body: Optional[str] = None,
    scheduled_for: Optional[str] = None,
) -> Optional[dict]:
    """Edit a scheduled (not-yet-broadcast) announcement. Returns the
    updated row, or ``None`` if the row doesn't exist / already sent.
    """
    row = await db.announcements.find_one({"id": ann_id}, {"_id": 0})
    if not row:
        return None
    if row.get("broadcasted_at"):
        return None  # Caller must 400 "already sent — delete + recreate"

    patch: dict = {}
    if title is not None:
        patch["title"] = title.strip()[:_ANN_MAX_TITLE]
    if body is not None:
        patch["body"] = body.strip()[:_ANN_MAX_BODY]
    if scheduled_for is not None:
        patch["scheduled_for"] = _normalize_scheduled_for(scheduled_for)
    if patch:
        await db.announcements.update_one({"id": ann_id}, {"$set": patch})
        row.update(patch)
    return row


async def list_recent(limit: int = 50) -> list[dict]:
    """Newest-first, capped at 50. Users-facing — only returns rows
    whose push has actually been broadcast (so scheduled drafts
    never appear in the dancer feed)."""
    cur = (
        db.announcements.find(
            {"broadcasted_at": {"$ne": None}}, {"_id": 0}
        )
        .sort("broadcasted_at", -1)
        .limit(max(1, min(int(limit or 50), 200)))
    )
    return [row async for row in cur]


async def list_scheduled() -> list[dict]:
    """Admin-only — pending future broadcasts, soonest first. Returns
    every row where ``scheduled_for`` is set and ``broadcasted_at``
    is still null (includes rows whose time already elapsed but
    haven't been picked up by the scheduler yet — those should fire
    on the next tick within 60s)."""
    cur = db.announcements.find(
        {
            "scheduled_for": {"$ne": None},
            "broadcasted_at": None,
        },
        {"_id": 0},
    ).sort("scheduled_for", 1)
    return [row async for row in cur]


async def delete_announcement(ann_id: str) -> bool:
    """Admin removes a mistake. Returns True if a row was deleted.
    Works for both scheduled drafts and already-sent pins (the push
    isn't recalled; the row simply disappears from feeds)."""
    res = await db.announcements.delete_one({"id": ann_id})
    return bool(int(res.deleted_count or 0) > 0)
