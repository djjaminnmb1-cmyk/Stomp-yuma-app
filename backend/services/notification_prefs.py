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

Quiet Hours
-----------
Users can define a daily window during which chat pushes are held
back. Stored inline on the same sub-doc:

    "quiet_hours": {
        "enabled": bool,
        "start_hour": int (0-23),   # inclusive
        "end_hour":   int (0-23),   # exclusive; may wrap past midnight
        "tz_offset_minutes": int,   # signed offset from UTC
    }

The window wraps past midnight (e.g. 22 → 7) so a "10pm to 7am" quiet
period works with a single start/end pair. Only ``chat_alerts`` and
``mention_alerts`` respect quiet hours — a class-in-2-hours reminder
still fires so dancers don't sleep through practice.

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
from datetime import datetime, timedelta, timezone
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
    # June 2026 — admin + broadcast categories.
    "admin_requests",       # admin-only — pending-dance + instructor-grant
    "announcements",        # admin "pin" fan-out to every user
    "library_updates",      # any new dance / class added to the library
    # October 2026 — weekly email digest of unread notifications.
    "weekly_digest",        # Monday-morning recap email (opt-out)
)

# Only these categories are silenced during quiet hours — reminders /
# class alerts / event alerts stay live because those carry time-
# sensitive info the user actually needs.
_QUIET_APPLIES_TO = ("chat_alerts", "mention_alerts")

_DEFAULT_QUIET = {
    "enabled": False,
    "start_hour": 22,       # 10 PM
    "end_hour": 7,          # 7 AM
    "tz_offset_minutes": 0,  # UTC by default; client sets its local offset
}


def _sanitize_quiet(quiet: dict | None) -> dict:
    """Coerce arbitrary input into the canonical quiet-hours shape.
    Clamps hours to 0-23 and offset to -1440..+1440 (a full day either
    side of UTC, which covers every real-world TZ).
    """
    quiet = quiet or {}
    def _clamp(v, lo, hi, default):
        try:
            n = int(v)
        except (TypeError, ValueError):
            return default
        return max(lo, min(hi, n))
    return {
        "enabled": bool(quiet.get("enabled", False)),
        "start_hour": _clamp(quiet.get("start_hour"), 0, 23, 22),
        "end_hour": _clamp(quiet.get("end_hour"), 0, 23, 7),
        "tz_offset_minutes": _clamp(
            quiet.get("tz_offset_minutes"), -14 * 60, 14 * 60, 0
        ),
    }


def _sanitize(prefs: dict | None) -> dict:
    """Coerce arbitrary input into the canonical shape. Unknown keys
    are silently dropped. Any provided value is boolean-cast, and the
    quiet-hours sub-doc is normalised via ``_sanitize_quiet``.
    """
    prefs = prefs or {}
    out = {k: bool(prefs.get(k, True)) for k in ALL_CATEGORIES}
    out["quiet_hours"] = _sanitize_quiet(prefs.get("quiet_hours"))
    return out


def _in_quiet_window(quiet: dict, *, at: Optional[datetime] = None) -> bool:
    """Return True if ``at`` (defaulting to now) falls inside the
    user's quiet window. Wraps past midnight cleanly:

    * ``start=22, end=7``  → quiet from 22:00-23:59 AND 00:00-06:59.
    * ``start=9,  end=17`` → quiet from 09:00-16:59.
    * ``start=end``        → treated as "always quiet" for the whole
      day; a saver's-guard against a user setting a zero-width window
      by accident (very rare, but explicit is better than silent
      no-op).
    """
    if not quiet or not quiet.get("enabled"):
        return False
    tz_offset = int(quiet.get("tz_offset_minutes") or 0)
    now = at or datetime.now(timezone.utc)
    # Shift UTC-now into the user's local wall-clock.
    local = now + timedelta(minutes=tz_offset)
    hour = local.hour
    start = int(quiet.get("start_hour") or 0)
    end = int(quiet.get("end_hour") or 0)
    if start == end:
        return True  # zero-width → treat as always quiet
    if start < end:
        return start <= hour < end
    # Wraps midnight
    return hour >= start or hour < end


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
    muted this category OR whose quiet-hours window is currently
    open (only applies to chat_alerts / mention_alerts). Unknown
    categories are treated as "always deliver" so misuse can't
    accidentally mute users.
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
    # Quiet-hours pass — only relevant for chat/mention categories.
    if category in _QUIET_APPLIES_TO:
        async for row in db.users.find(
            {
                "user_id": {"$in": user_ids},
                "notification_prefs.quiet_hours.enabled": True,
            },
            {
                "_id": 0,
                "user_id": 1,
                "notification_prefs.quiet_hours": 1,
            },
        ):
            uid = row["user_id"]
            if uid in muted:
                continue
            quiet = (
                (row.get("notification_prefs") or {}).get("quiet_hours") or {}
            )
            if _in_quiet_window(quiet):
                muted.add(uid)
    if not muted:
        return list(user_ids)
    return [u for u in user_ids if u not in muted]


async def is_muted(user_id: str, category: str) -> bool:
    """Convenience for single-user checks (e.g. reminder scheduler)."""
    if not user_id or category not in ALL_CATEGORIES:
        return False
    prefs = await get_prefs(user_id)
    if not prefs.get(category, True):
        return True
    if category in _QUIET_APPLIES_TO:
        return _in_quiet_window(prefs.get("quiet_hours") or {})
    return False
