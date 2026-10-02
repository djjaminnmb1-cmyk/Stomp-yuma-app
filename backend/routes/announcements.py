"""Admin announcements — "pin" a message to every user.

* ``POST /api/admin/announcements`` — admin creates + broadcasts
* ``DELETE /api/admin/announcements/{id}`` — admin removes
* ``GET  /api/announcements``        — any user reads the recent feed

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
)

router = APIRouter()


class AnnouncementIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=2000)


@router.post("/admin/announcements")
async def create_announcement(
    body: AnnouncementIn, admin: dict = Depends(require_admin)
):
    """Create + fan out a push to every opted-in user."""
    doc = await create_and_broadcast(
        title=body.title, body=body.body, author=admin
    )
    return {"ok": True, "announcement": doc}


@router.delete("/admin/announcements/{ann_id}")
async def remove_announcement(
    ann_id: str, admin: dict = Depends(require_admin)  # noqa: ARG001
):
    """Admin can retract a mistake. 404 if the id is gone."""
    ok = await delete_announcement(ann_id)
    if not ok:
        raise HTTPException(404, "Announcement not found")
    return {"ok": True}


@router.get("/announcements")
async def read_announcements(
    limit: int = 50,
    user: dict = Depends(get_current_user),  # noqa: ARG001
):
    """Latest announcements for any signed-in user. Capped at 50 by
    default so the Users feed stays snappy on slow connections."""
    items = await list_recent(limit=limit)
    return {"items": items, "count": len(items)}
