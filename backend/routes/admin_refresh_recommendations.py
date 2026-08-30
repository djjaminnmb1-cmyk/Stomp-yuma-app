"""Admin-facing endpoints for the nightly "refresh recommendations"
drift-scan (see ``services/refresh_recommendations.py``).

* ``GET /api/admin/refresh-recommendations``           → the queue
* ``GET /api/admin/refresh-recommendations/counts``    → badges
* ``POST /api/admin/refresh-recommendations/rerun``    → manual trigger
* ``POST /api/admin/refresh-recommendations/{dance_id}/seen``
                                                       → mark reviewed
* ``DELETE /api/admin/refresh-recommendations/{dance_id}``
                                                       → dismiss ("not
                                                          stale — don't
                                                          bug me again")

All routes require ``is_admin`` via ``core.security.require_admin``.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core.security import require_admin
from services.refresh_recommendations import (
    counts as drift_counts,
    dismiss as drift_dismiss,
    list_flags,
    mark_seen as drift_mark_seen,
    run_nightly_scan,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/admin/refresh-recommendations")
async def get_refresh_recommendations(
    seen: Optional[bool] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    _admin: dict = Depends(require_admin),
):
    """Full flag queue. Optional ``seen`` filter — omit for everything,
    ``false`` for unreviewed only (default admin list), ``true`` for
    the audit trail of what admins have already looked at.
    """
    rows = await list_flags(seen=seen, limit=limit)
    return {"flags": rows, "count": len(rows)}


@router.get("/admin/refresh-recommendations/counts")
async def get_refresh_counts(_admin: dict = Depends(require_admin)):
    """Small counts payload for the admin dashboard badge — cheap
    enough to call on tab focus."""
    return await drift_counts()


@router.post("/admin/refresh-recommendations/rerun")
async def post_rerun(_admin: dict = Depends(require_admin)):
    """Kick off an out-of-band scan. Runs INLINE — this may take a few
    minutes; the client should show a progress spinner and read the
    summary from the response. Kept synchronous so the admin sees the
    fresh counts immediately without polling.
    """
    result = await run_nightly_scan()
    return {"ok": True, **result}


@router.post("/admin/refresh-recommendations/{dance_id}/seen")
async def post_mark_seen(
    dance_id: str,
    source: Optional[str] = Query(default=None),
    _admin: dict = Depends(require_admin),
):
    """Flip ``seen=True`` on the pair(s) — the queue drops the row
    from the default unread view but keeps the audit trail so a
    later /counts?seen=true call can show "reviewed" history."""
    if source and source not in ("copperknob", "bootstepper"):
        raise HTTPException(400, "Unknown source")
    updated = await drift_mark_seen(dance_id, source)
    return {"ok": True, "updated": updated}


@router.delete("/admin/refresh-recommendations/{dance_id}")
async def delete_flag(
    dance_id: str,
    source: Optional[str] = Query(default=None),
    _admin: dict = Depends(require_admin),
):
    """Dismiss the flag — admin has decided the drift isn't worth
    acting on. Row is deleted; won't come back unless a future scan
    detects NEW drift (different fields)."""
    if source and source not in ("copperknob", "bootstepper"):
        raise HTTPException(400, "Unknown source")
    removed = await drift_dismiss(dance_id, source)
    return {"ok": True, "removed": removed}
