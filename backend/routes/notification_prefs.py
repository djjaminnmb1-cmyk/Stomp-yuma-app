"""Per-user notification preferences endpoints.

* ``GET  /api/users/me/notification-prefs``   → current settings
* ``PATCH /api/users/me/notification-prefs``  → merge-in updates

Missing keys are always defaulted to True (opted-in) so a user who has
never opened the settings screen keeps receiving every alert.

Also carries the Quiet Hours sub-doc — a daily window during which
chat + mention pushes are held back. See
``services/notification_prefs.py`` for the full contract.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core.security import get_current_user
from services.notification_prefs import (
    ALL_CATEGORIES,
    get_prefs,
    update_prefs,
)

router = APIRouter()


class QuietHoursIn(BaseModel):
    enabled: Optional[bool] = None
    start_hour: Optional[int] = None      # 0-23
    end_hour: Optional[int] = None        # 0-23
    tz_offset_minutes: Optional[int] = None  # signed minutes from UTC


class NotificationPrefsIn(BaseModel):
    """All fields optional — PATCH-style merge. Only supplied keys
    are written; missing keys keep their stored value (or default to
    True if never set).
    """
    class_alerts: Optional[bool] = None
    event_alerts: Optional[bool] = None
    choreographer_alerts: Optional[bool] = None
    mention_alerts: Optional[bool] = None
    reminder_alerts: Optional[bool] = None
    chat_alerts: Optional[bool] = None
    # June 2026 — new categories (admin requests only applies to admins,
    # library-updates = broadcast of any new dance / class, announcements
    # = admin "pin" posts).
    admin_requests: Optional[bool] = None
    announcements: Optional[bool] = None
    library_updates: Optional[bool] = None
    quiet_hours: Optional[QuietHoursIn] = None


@router.get("/users/me/notification-prefs")
async def get_my_notification_prefs(user: dict = Depends(get_current_user)):
    prefs = await get_prefs(user["user_id"])
    return {"prefs": prefs, "categories": list(ALL_CATEGORIES)}


@router.patch("/users/me/notification-prefs")
async def patch_my_notification_prefs(
    body: NotificationPrefsIn, user: dict = Depends(get_current_user)
):
    """Merge-in: fields set to ``None`` keep their existing value.

    We fetch → apply overrides → save so a caller PATCHing a single
    toggle doesn't accidentally reset the others to True. The
    ``quiet_hours`` sub-doc is merged field-by-field so a client that
    only wants to toggle ``enabled`` doesn't have to re-send
    start / end / tz.
    """
    current = await get_prefs(user["user_id"])
    merged = dict(current)
    for cat in ALL_CATEGORIES:
        incoming = getattr(body, cat, None)
        if incoming is not None:
            merged[cat] = bool(incoming)
    if body.quiet_hours is not None:
        # Field-by-field merge so partial PATCH is safe.
        current_quiet = dict(current.get("quiet_hours") or {})
        for f in ("enabled", "start_hour", "end_hour", "tz_offset_minutes"):
            val = getattr(body.quiet_hours, f, None)
            if val is not None:
                current_quiet[f] = val
        merged["quiet_hours"] = current_quiet
    saved = await update_prefs(user["user_id"], merged)
    return {"prefs": saved}
