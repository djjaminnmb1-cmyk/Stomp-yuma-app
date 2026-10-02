"""Library-wide broadcast pushes — "a new X was added".

Separate from the follower-only fan-out helpers in
``services/instructor_notifications`` and
``services/choreographer_follows``, this module notifies the ENTIRE
user base about:

* ``broadcast_new_dance(dance)``  — any newly published dance in the
  local library (regardless of whether the viewer follows the
  choreographer).
* ``broadcast_new_class(class_doc)`` — any newly scheduled, upcoming
  class (regardless of whether the viewer follows the instructor).

Both respect the shared ``notification_prefs.library_updates`` opt-out
so a dancer who only wants pushes from followed instructors / followed
choreographers can mute these broadcasts without losing the targeted
ones (which continue to go through the existing follower paths).

Idempotency
-----------
``library_broadcasts`` ledger, unique on
``(user_id, entity_type, entity_id)`` so a double-insert /
unpublish → re-publish never spams the same user twice.

Best-effort
-----------
Every helper catches its own exceptions — a push relay outage must
NEVER block the underlying CRUD path. The route just logs + moves on.
"""
from __future__ import annotations

import logging

from core.database import db
from core.push_service import send_push_localised
from core.time_helpers import now_iso
from services.notification_prefs import filter_recipients

logger = logging.getLogger(__name__)


_INDEXES_READY = False


async def ensure_indexes() -> None:
    """Create the unique ledger index once per process. Idempotent."""
    global _INDEXES_READY
    if _INDEXES_READY:
        return
    try:
        await db.library_broadcasts.create_index(
            [("user_id", 1), ("entity_type", 1), ("entity_id", 1)],
            unique=True,
            name="uniq_user_entity",
        )
        _INDEXES_READY = True
    except Exception as e:
        logger.warning(f"library_broadcasts index setup failed: {e}")


async def _recipients(
    *,
    exclude_user_ids: list[str] | None = None,
) -> list[str]:
    """Every user_id in the DB, minus ``exclude_user_ids``, filtered
    through ``notification_prefs.library_updates``.
    """
    exclude = set(exclude_user_ids or [])
    out: list[str] = []
    async for row in db.users.find(
        {}, {"_id": 0, "user_id": 1}
    ):
        uid = row.get("user_id")
        if uid and uid not in exclude:
            out.append(uid)
    if not out:
        return []
    try:
        out = await filter_recipients(out, "library_updates")
    except Exception:
        # Pref-lookup flake: default to delivering.
        pass
    return out


async def _dedupe_fresh(
    user_ids: list[str], entity_type: str, entity_id: str
) -> list[str]:
    """Drop users who already have a ledger row for this pair."""
    if not user_ids or not entity_id:
        return []
    existing: set[str] = set()
    async for row in db.library_broadcasts.find(
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
    user_ids: list[str], entity_type: str, entity_id: str
) -> None:
    if not user_ids:
        return
    now = now_iso()
    try:
        await db.library_broadcasts.insert_many(
            [
                {
                    "user_id": u,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "sent_at": now,
                }
                for u in user_ids
            ],
            ordered=False,
        )
    except Exception as e:
        # Duplicate-key errors are expected on concurrent creates —
        # ordered=False keeps the rest going; log at info level only.
        logger.info(f"library_broadcasts ledger insert partial: {e}")


async def broadcast_new_dance(
    dance: dict,
    *,
    skip_user_ids: list[str] | None = None,
) -> int:
    """Push every opted-in user that a new dance landed in the local
    library. ``skip_user_ids`` is used by callers that already fanned
    out a more-targeted push to a subset (e.g. choreographer followers)
    — those users still get the broadcast skipped so their phone only
    buzzes once per dance.

    Returns the number of NEW notifications actually sent.
    """
    if not dance:
        return 0
    if not dance.get("is_published"):
        return 0
    dance_id = (dance.get("id") or "").strip()
    if not dance_id:
        return 0
    name = (dance.get("name") or "").strip() or "New dance"
    chor = (dance.get("choreographer") or "").strip()

    exclude = list(skip_user_ids or [])
    # Don't ping the creator themselves.
    creator = (dance.get("created_by") or "").strip()
    if creator and creator not in exclude:
        exclude.append(creator)

    pool = await _recipients(exclude_user_ids=exclude)
    fresh = await _dedupe_fresh(pool, "dance", dance_id)
    if not fresh:
        return 0

    await _write_ledger(fresh, "dance", dance_id)
    try:
        await send_push_localised(
            recipients=fresh,
            title_key="push.library_new_dance.title",
            body_key="push.library_new_dance.body",
            params={
                "dance_name": name,
                "choreographer": chor or "the local line-up",
            },
            data={
                "deeplink": f"/dance/{dance_id}",
                "action_url": f"/dance/{dance_id}",
                "kind": "library_new_dance",
                "dance_id": dance_id,
            },
            idempotency_key=f"lib-dance-{dance_id}",
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"library new-dance broadcast push failed: {e}")

    return len(fresh)


async def broadcast_new_class(
    class_doc: dict,
    *,
    skip_user_ids: list[str] | None = None,
) -> int:
    """Push every opted-in user that a new upcoming class got scheduled.
    Past-dated classes are silent (same policy as the follower-only
    fan-out). ``skip_user_ids`` lets the caller avoid double-buzzing
    users who already received the follower push.

    Returns the number of NEW notifications actually sent.
    """
    if not class_doc:
        return 0
    class_id = (class_doc.get("id") or "").strip()
    date = (class_doc.get("date") or "").strip()
    if not class_id:
        return 0
    today = now_iso()[:10]
    if date and date < today:
        return 0

    exclude = list(skip_user_ids or [])
    instr = (class_doc.get("instructor_id") or "").strip()
    if instr and instr not in exclude:
        exclude.append(instr)

    pool = await _recipients(exclude_user_ids=exclude)
    fresh = await _dedupe_fresh(pool, "class", class_id)
    if not fresh:
        return 0

    label = (class_doc.get("session_label") or "").strip() or "New class"
    instructor_name = (
        (class_doc.get("instructor_name") or "").strip() or "Your instructors"
    )
    dance_names = ", ".join(
        [d.get("name", "") for d in class_doc.get("dances", [])[:3]]
    ) or "class"
    remainder = len(class_doc.get("dances", [])) - 3
    more = f" +{remainder} more" if remainder > 0 else ""

    await _write_ledger(fresh, "class", class_id)
    try:
        await send_push_localised(
            recipients=fresh,
            title_key="push.library_new_class.title",
            body_key="push.library_new_class.body",
            params={
                "instructor": instructor_name,
                "class_title": label,
                "when": f"{date} — {dance_names}{more}".strip(),
            },
            data={
                "deeplink": "/classes",
                "action_url": "/classes",
                "kind": "library_new_class",
                "class_id": class_id,
            },
            idempotency_key=f"lib-class-{class_id}",
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"library new-class broadcast push failed: {e}")

    return len(fresh)


async def purge_user(user_id: str) -> None:
    """Called from account-deletion. Cleans up ledger rows keyed on
    this user_id."""
    await db.library_broadcasts.delete_many({"user_id": user_id})
