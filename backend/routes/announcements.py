"""Admin announcements — "pin" a message to every user.

* ``POST   /api/admin/announcements``             — admin creates (optionally scheduled)
* ``PATCH  /api/admin/announcements/{id}``        — admin edits a scheduled pin
* ``DELETE /api/admin/announcements/{id}``        — admin retracts
* ``GET    /api/admin/announcements/scheduled``   — admin lists pending drafts
* ``GET    /api/announcements``                   — any user reads the sent feed

The underlying write + push fan-out live in
``services/announcements.py`` so the HTTP shell stays thin.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.security import get_current_user, require_admin
from services.announcements import (
    create_and_broadcast,
    delete_announcement,
    list_recent,
    list_scheduled,
    update_scheduled,
)

router = APIRouter()


class AnnouncementIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=2000)
    # ISO-8601 datetime (UTC). ``None`` or omitted = broadcast immediately.
    scheduled_for: str | None = None


class AnnouncementPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    body: str | None = Field(default=None, min_length=1, max_length=2000)
    scheduled_for: str | None = None


@router.post("/admin/announcements")
async def create_announcement(
    body: AnnouncementIn, admin: dict = Depends(require_admin)
):
    """Create + (unless scheduled) fan out a push to every opted-in
    user."""
    try:
        doc = await create_and_broadcast(
            title=body.title,
            body=body.body,
            author=admin,
            scheduled_for=body.scheduled_for,
        )
    except ValueError as e:
        raise HTTPException(422, f"Invalid scheduled_for: {e}")
    return {"ok": True, "announcement": doc}


@router.patch("/admin/announcements/{ann_id}")
async def patch_announcement(
    ann_id: str,
    body: AnnouncementPatch,
    admin: dict = Depends(require_admin),  # noqa: ARG001
):
    """Edit a scheduled (not-yet-broadcast) announcement.

    Returns 400 if the row has already been sent — in that case
    the admin should delete + recreate rather than silently rewrite
    history for the push that already landed on dancers' phones.
    """
    try:
        row = await update_scheduled(
            ann_id,
            title=body.title,
            body=body.body,
            scheduled_for=body.scheduled_for,
        )
    except ValueError as e:
        raise HTTPException(422, f"Invalid scheduled_for: {e}")
    if row is None:
        # Could be: unknown id OR already-broadcast. Distinguish for
        # the admin UI so the error message is actionable.
        from core.database import db
        existing = await db.announcements.find_one(
            {"id": ann_id}, {"_id": 0, "broadcasted_at": 1}
        )
        if not existing:
            raise HTTPException(404, "Announcement not found")
        raise HTTPException(
            400,
            "Already sent — delete and recreate to change this pin.",
        )
    return {"ok": True, "announcement": row}


@router.delete("/admin/announcements/{ann_id}")
async def remove_announcement(
    ann_id: str, admin: dict = Depends(require_admin)  # noqa: ARG001
):
    """Admin can retract a mistake OR cancel a scheduled draft. 404
    if the id is gone (which includes anything already-deleted)."""
    ok = await delete_announcement(ann_id)
    if not ok:
        raise HTTPException(404, "Announcement not found")
    return {"ok": True}


@router.get("/admin/announcements/scheduled")
async def read_scheduled(admin: dict = Depends(require_admin)):  # noqa: ARG001
    """Admin-only — rows pending future broadcast, soonest first."""
    items = await list_scheduled()
    return {"items": items, "count": len(items)}


@router.get("/announcements")
async def read_announcements(
    limit: int = 50,
    user: dict = Depends(get_current_user),  # noqa: ARG001
):
    """Latest already-broadcast announcements for any signed-in user.
    Scheduled drafts are NOT returned here — only through the admin
    ``/scheduled`` endpoint."""
    items = await list_recent(limit=limit)
    return {"items": items, "count": len(items)}
