"""Admin-only push notifications for "member request"-style events.

Fires when a non-admin user does something that creates work for the
admin team: submitting a pending dance for review, or unlocking the
instructor role via the self-serve access code. Admins can opt out
via ``notification_prefs.admin_requests`` (defaults ON for admins —
these are review-queue nudges, not noise).

Delivery rules (in order):

1. **Recipient pool** = every user with ``is_admin=True`` (no editor
   whitelist — the admin queue only lives on the admin's own screens).
2. Exclude the triggering actor themselves if they happen to also be
   an admin (so an admin promoting themselves doesn't buzz their own
   phone).
3. Respect per-user ``notification_prefs.admin_requests`` — defaults
   to delivered when the field is missing (opt-out, not opt-in).

The push itself is fire-and-forget: any transient failure is logged
and swallowed so the triggering request (submit / set-instructor)
always returns success regardless.
"""
from __future__ import annotations

import logging

from core.database import db
from core.push_service import send_push_localised
from services.notification_prefs import filter_recipients

logger = logging.getLogger(__name__)


async def _admin_recipients(exclude_actor_id: str | None = None) -> list[str]:
    """Return every admin's ``user_id``, minus the actor if provided."""
    out: list[str] = []
    exclude = (exclude_actor_id or "").strip()
    async for row in db.users.find(
        {"is_admin": True}, {"_id": 0, "user_id": 1}
    ):
        uid = row.get("user_id")
        if not uid or uid == exclude:
            continue
        out.append(uid)
    if not out:
        return []
    # Respect per-admin opt-out via notification_prefs.admin_requests.
    try:
        out = await filter_recipients(out, "admin_requests")
    except Exception:
        # Pref-lookup flake: default to delivering (matches the
        # "opt-out, not opt-in" contract of the shared helper).
        pass
    return out


async def notify_admins_of_pending_dance(pd_row: dict) -> list[str]:
    """Ping every admin that a new pending-dance just landed in the
    review queue. Returns the list of recipient user_ids actually
    queued (empty on no admins / all-muted).
    """
    if not pd_row:
        return []
    actor_id = (pd_row.get("user_id") or "").strip()
    pool = await _admin_recipients(exclude_actor_id=actor_id)
    if not pool:
        return []
    title = (pd_row.get("title") or "").strip() or "A new submission"
    submitter = (
        (pd_row.get("user_name") or "").strip()
        or (pd_row.get("user_email") or "").strip()
        or "A dancer"
    )
    try:
        await send_push_localised(
            recipients=pool,
            title_key="push.admin_pending_dance.title",
            body_key="push.admin_pending_dance.body",
            params={"submitter": submitter, "title": title},
            data={
                # Deeplink straight to the admin pending-dance queue.
                "deeplink": "/admin/pending-dances",
                "action_url": "/admin/pending-dances",
                "kind": "admin_pending_dance",
                "submission_id": pd_row.get("id") or "",
            },
            idempotency_key=f"admin-pd-{pd_row.get('id') or ''}",
        )
    except Exception as e:  # pragma: no cover — network / relay flake
        logger.warning(f"admin pending-dance push failed: {e}")
    return pool


async def notify_admins_of_instructor_grant(user_doc: dict) -> list[str]:
    """Ping every admin when a user self-serve upgrades to instructor
    (either via signup instructor_code or ``POST /auth/set-instructor``).
    Treated as an audit nudge — admins can audit the grant on their own
    screens and demote if needed via /admin/users/promote.
    """
    if not user_doc:
        return []
    actor_id = (user_doc.get("user_id") or "").strip()
    pool = await _admin_recipients(exclude_actor_id=actor_id)
    if not pool:
        return []
    who = (
        (user_doc.get("name") or "").strip()
        or (user_doc.get("email") or "").strip()
        or "Someone"
    )
    try:
        await send_push_localised(
            recipients=pool,
            title_key="push.admin_instructor_grant.title",
            body_key="push.admin_instructor_grant.body",
            params={"who": who},
            data={
                "deeplink": "/admin/users",
                "action_url": "/admin/users",
                "kind": "admin_instructor_grant",
                "user_id": actor_id,
            },
            # Idempotency on user_id — a user flipping role via different
            # paths within a short window won't double-ping.
            idempotency_key=f"admin-instr-{actor_id}",
        )
    except Exception as e:  # pragma: no cover — network / relay flake
        logger.warning(f"admin instructor-grant push failed: {e}")
    return pool
