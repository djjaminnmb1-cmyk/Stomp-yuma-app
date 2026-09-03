"""Push follower nudges when an instructor posts a new class or event.

Users pick their instructors via the "My instructors" picker (stored
in ``users.instructor_ids``). When an instructor drops a new class /
event we fan out ONLY to those dancers — no more spamming the whole
library the way the previous "send-to-all-users" class push did.

Idempotency
-----------
``instructor_notifications`` ledger, unique on
``(user_id, entity_type, entity_id)`` so re-publishing a draft or
editing the event description never sends the same follower twice.

Best-effort
-----------
Every helper catches its own exceptions — a push relay outage must
NEVER block the underlying CRUD path. The scheduler / route just logs
+ moves on.
"""
from __future__ import annotations

import logging
from typing import Iterable, Optional

from core.database import db
from core.push_service import send_push
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)


_INDEXES_READY = False


async def ensure_indexes() -> None:
    global _INDEXES_READY
    if _INDEXES_READY:
        return
    try:
        await db.instructor_notifications.create_index(
            [("user_id", 1), ("entity_type", 1), ("entity_id", 1)],
            unique=True,
            name="uniq_user_entity",
        )
        _INDEXES_READY = True
    except Exception as e:
        logger.warning(f"instructor_notifications index setup failed: {e}")


async def _follower_ids(
    instructor_id: str, exclude: Optional[Iterable[str]] = None
) -> list[str]:
    """Every user who lists this instructor in their ``instructor_ids``.

    Excludes the instructor themselves + any explicit ``exclude`` list
    so the instructor isn't nagged about their own post.
    """
    if not instructor_id:
        return []
    rows = await db.users.find(
        {"instructor_ids": instructor_id},
        {"_id": 0, "user_id": 1},
    ).to_list(length=5000)
    ids = {r["user_id"] for r in rows if r.get("user_id")}
    ids.discard(instructor_id)
    if exclude:
        for e in exclude:
            ids.discard(e)
    return list(ids)


async def _dedupe_fresh(
    user_ids: list[str], entity_type: str, entity_id: str
) -> list[str]:
    """Drop users who already have a ledger row for this pair."""
    if not user_ids or not entity_id:
        return []
    existing = set()
    async for row in db.instructor_notifications.find(
        {
            "user_id": {"$in": user_ids},
            "entity_type": entity_type,
            "entity_id": entity_id,
        },
        {"_id": 0, "user_id": 1},
    ):
        existing.add(row["user_id"])
    return [u for u in user_ids if u not in existing]


async def _write_ledger(
    user_ids: list[str], entity_type: str, entity_id: str, instructor_id: str
) -> None:
    if not user_ids:
        return
    now = now_iso()
    try:
        await db.instructor_notifications.insert_many(
            [
                {
                    "user_id": u,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "instructor_id": instructor_id,
                    "sent_at": now,
                }
                for u in user_ids
            ],
            ordered=False,
        )
    except Exception as e:  # noqa: BLE001
        # Duplicate-key errors are expected on concurrent creates —
        # ordered=False keeps the rest going; log at info level only.
        logger.info(f"instructor_notifications ledger insert partial: {e}")


# ---------------- Classes ----------------
async def notify_followers_of_new_class(class_doc: dict) -> int:
    """Fan-out to followers of the class instructor. Only fires for
    UPCOMING classes (past-dated ones are silent — no point pinging
    dancers about a session that already happened).

    Returns the number of fresh pushes actually sent.
    """
    if not class_doc:
        return 0
    instructor_id = class_doc.get("instructor_id") or ""
    class_id = class_doc.get("id") or ""
    date = (class_doc.get("date") or "").strip()
    if not instructor_id or not class_id:
        return 0
    # Cheap upcoming check — string compare on ISO-formatted date.
    today = now_iso()[:10]
    if date and date < today:
        return 0

    followers = await _follower_ids(instructor_id)
    # Respect per-user push preferences — a dancer who muted "class
    # alerts" won't get a ping. Their ledger row is ALSO skipped so
    # a later prefs flip immediately re-enables notifications for
    # future classes rather than back-filling stale ones.
    from services.notification_prefs import filter_recipients
    followers = await filter_recipients(followers, "class_alerts")
    fresh = await _dedupe_fresh(followers, "class", class_id)
    if not fresh:
        return 0

    instructor_name = class_doc.get("instructor_name") or "Your instructor"
    label = (class_doc.get("session_label") or "").strip() or "New class"
    dance_names = ", ".join(
        [d.get("name", "") for d in class_doc.get("dances", [])[:3]]
    ) or "class"
    remainder = len(class_doc.get("dances", [])) - 3
    more = f" +{remainder} more" if remainder > 0 else ""

    await _write_ledger(fresh, "class", class_id, instructor_id)
    try:
        await send_push(
            recipients=fresh,
            data={
                "title": f"{instructor_name} · {label}",
                "message": f"{date} — {dance_names}{more}",
                "deeplink": "/classes",
                "action_url": "/classes",
            },
            idempotency_key=f"class-new-{class_id}",
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"class-new push failed: {e}")
    return len(fresh)


# ---------------- Events ----------------
async def notify_followers_of_new_event(event_doc: dict) -> int:
    """Fan-out to followers of the event's host instructor. Only fires
    for PUBLISHED, upcoming events. Idempotent per (user, event_id).
    """
    if not event_doc:
        return 0
    if not event_doc.get("is_published", True):
        return 0
    instructor_id = event_doc.get("instructor_id") or ""
    event_id = event_doc.get("id") or ""
    date = (event_doc.get("date") or "").strip()
    if not instructor_id or not event_id:
        return 0
    today = now_iso()[:10]
    if date and date < today:
        return 0

    followers = await _follower_ids(instructor_id)
    from services.notification_prefs import filter_recipients
    followers = await filter_recipients(followers, "event_alerts")
    fresh = await _dedupe_fresh(followers, "event", event_id)
    if not fresh:
        return 0

    instructor_name = event_doc.get("instructor_name") or "Your instructor"
    ev_name = (event_doc.get("name") or "").strip() or "New event"
    where = (
        (event_doc.get("venue_name") or "").strip()
        or (event_doc.get("city") or "").strip()
        or "TBA"
    )
    when_bits = [date] if date else []
    if event_doc.get("start_time"):
        when_bits.append(event_doc["start_time"])
    when = " · ".join(when_bits) if when_bits else "Date TBA"

    await _write_ledger(fresh, "event", event_id, instructor_id)
    try:
        await send_push(
            recipients=fresh,
            data={
                "title": f"{instructor_name} · {ev_name}",
                "message": f"{when} @ {where}",
                "deeplink": f"/events/{event_id}",
                "action_url": f"/events/{event_id}",
                # Interactive push category — the mobile app registers
                # an "event_new" category with a single "I'm going"
                # action at boot. Tapping that button hits
                # /events/{id}/rsvp in the background so the user can
                # confirm attendance without opening the app.
                "categoryIdentifier": "event_new",
                "category_identifier": "event_new",
                "event_id": event_id,
            },
            idempotency_key=f"event-new-{event_id}",
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"event-new push failed: {e}")
    return len(fresh)


# ---------------- Cleanup ----------------
async def purge_user(user_id: str) -> None:
    """Called from account-deletion. Cleans up ledger rows keyed on
    this user_id both as recipient AND as posting instructor."""
    await db.instructor_notifications.delete_many({"user_id": user_id})
    await db.instructor_notifications.delete_many({"instructor_id": user_id})
