"""Per-user notification preferences endpoints.

* ``GET  /api/users/me/notification-prefs``   → current settings
* ``PATCH /api/users/me/notification-prefs``  → merge-in updates

Missing keys are always defaulted to True (opted-in) so a user who has
never opened the settings screen keeps receiving every alert.
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
    toggle doesn't accidentally reset the others to True.
    """
    current = await get_prefs(user["user_id"])
    merged = dict(current)
    for cat in ALL_CATEGORIES:
        incoming = getattr(body, cat, None)
        if incoming is not None:
            merged[cat] = bool(incoming)
    saved = await update_prefs(user["user_id"], merged)
    return {"prefs": saved}
