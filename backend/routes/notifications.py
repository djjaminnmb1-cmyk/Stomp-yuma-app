"""Notification Center HTTP endpoints.

Routes
------
* ``GET  /api/notifications``                — paginated list
* ``GET  /api/notifications/unread-count``   — tiny badge query
* ``POST /api/notifications/{id}/read``      — mark one row read
* ``POST /api/notifications/read-all``       — mark everything read
* ``DELETE /api/notifications/{id}``         — delete one row

All routes require a signed-in user. Rows are scoped to the caller —
there's no admin view (admins can see their own notifications like
any other user).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from core.security import get_current_user
from services.notification_feed import (
    count_unread,
    delete_event,
    list_for_user,
    mark_all_read,
    mark_read,
)

router = APIRouter()


@router.get("/notifications")
async def list_notifications(
    limit: int = Query(50, ge=1, le=200),
    before: str | None = Query(
        None,
        description="created_at cursor — return rows strictly older than this",
    ),
    user: dict = Depends(get_current_user),
):
    items = await list_for_user(
        user["user_id"], limit=limit, before_created_at=before
    )
    return {
        "items": items,
        "count": len(items),
        # ``has_more`` is best-effort: if we got exactly ``limit`` rows
        # there MAY be more. Client should request the next page with
        # ``before=<last_row.created_at>``.
        "has_more": len(items) >= limit,
    }


@router.get("/notifications/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    return {"unread": await count_unread(user["user_id"])}


@router.post("/notifications/{event_id}/read")
async def mark_one_read(
    event_id: str, user: dict = Depends(get_current_user)
):
    ok = await mark_read(user["user_id"], event_id)
    if not ok:
        # Could be: unknown id, not-yours, or already-read. All are
        # 200-ok from the client's perspective — nothing to do. 404 only
        # if the row doesn't exist at all for this user.
        from core.database import db
        exists = await db.notification_events.find_one(
            {"id": event_id, "user_id": user["user_id"]},
            {"_id": 0, "id": 1},
        )
        if not exists:
            raise HTTPException(404, "Notification not found")
    return {"ok": True}


@router.post("/notifications/read-all")
async def mark_everything_read(user: dict = Depends(get_current_user)):
    n = await mark_all_read(user["user_id"])
    return {"ok": True, "marked_read": n}


@router.delete("/notifications/{event_id}")
async def remove_one(
    event_id: str, user: dict = Depends(get_current_user)
):
    ok = await delete_event(user["user_id"], event_id)
    if not ok:
        raise HTTPException(404, "Notification not found")
    return {"ok": True}
