"""Admin announcements — "pin" a message to every user.

* ``POST   /api/admin/announcements``             — admin creates (optionally scheduled, optionally audience-filtered)
* ``PATCH  /api/admin/announcements/{id}``        — admin edits a scheduled pin
* ``DELETE /api/admin/announcements/{id}``        — admin retracts
* ``GET    /api/admin/announcements/scheduled``   — admin lists pending drafts
* ``POST   /api/admin/announcements/audience/preview`` — admin dry-runs the recipient count
* ``GET    /api/admin/announcements/instructor-picker`` — admin picker list (name + id)
* ``GET    /api/admin/announcements/difficulty-tiers``  — admin tier chip list
* ``GET    /api/announcements``                   — any user reads the sent feed

The underlying write + push fan-out live in
``services/announcements.py`` so the HTTP shell stays thin.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.database import db
from core.security import get_current_user, require_admin
from services.announcements import (
    create_and_broadcast,
    delete_announcement,
    list_recent,
    list_scheduled,
    preview_audience,
    update_scheduled,
)
from services.difficulty_tier import KNOWN_TIERS

router = APIRouter()


class AudiencePayload(BaseModel):
    scope: str | None = "everyone"
    instructor_user_ids: list[str] | None = None
    difficulty_tiers: list[str] | None = None


class AnnouncementIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=2000)
    # ISO-8601 datetime (UTC). ``None`` or omitted = broadcast immediately.
    scheduled_for: str | None = None
    audience: AudiencePayload | None = None


class AnnouncementPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    body: str | None = Field(default=None, min_length=1, max_length=2000)
    scheduled_for: str | None = None
    audience: AudiencePayload | None = None


@router.post("/admin/announcements")
async def create_announcement(
    body: AnnouncementIn, admin: dict = Depends(require_admin)
):
    """Create + (unless scheduled) fan out a push to every opted-in
    user matching the audience filter."""
    try:
        doc = await create_and_broadcast(
            title=body.title,
            body=body.body,
            author=admin,
            scheduled_for=body.scheduled_for,
            audience=body.audience.dict() if body.audience else None,
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
            audience=body.audience.dict() if body.audience else None,
        )
    except ValueError as e:
        raise HTTPException(422, f"Invalid scheduled_for: {e}")
    if row is None:
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


@router.post("/admin/announcements/audience/preview")
async def audience_preview(
    body: AudiencePayload,
    admin: dict = Depends(require_admin),  # noqa: ARG001
):
    """Dry-run — "how many dancers would this audience filter reach?"
    Returns ``{"count": N, "sample_names": [..up to 5..]}``.
    """
    return await preview_audience(body.dict() if body else None)


@router.get("/admin/announcements/instructor-picker")
async def admin_instructor_picker(
    admin: dict = Depends(require_admin),  # noqa: ARG001
):
    """Light projection of instructors + admins for the audience
    picker dropdown — just id + name + follower_count so the admin
    can gauge reach without a full ``/instructors`` payload."""
    out: list[dict] = []
    async for u in db.users.find(
        {
            "$or": [
                {"is_instructor": True},
                {"is_admin": True},
            ]
        },
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1},
    ).sort("name", 1):
        out.append(
            {
                "user_id": u.get("user_id") or "",
                "name": u.get("name") or u.get("email") or "Instructor",
                "picture": u.get("picture") or "",
            }
        )
    return {"items": out}


@router.get("/admin/announcements/difficulty-tiers")
async def admin_difficulty_tiers(
    admin: dict = Depends(require_admin),  # noqa: ARG001
):
    """Static list of the canonical difficulty tiers for the audience
    picker chip row. Exposed as an endpoint (vs. hardcoded in the
    client) so adding a tier server-side instantly shows up in the
    picker without a client rebuild."""
    return {"items": list(KNOWN_TIERS)}


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
