"""Weekly digest email — admin preview + status endpoints.

The actual delivery runs on an APScheduler cron (every Monday 15:00
UTC = 08:00 America/Phoenix) via ``services.weekly_digest.send_weekly_digest``.

These routes let an admin dry-run the digest on their own account at
any time (no waiting for Monday) and inspect the last sweep's stats.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_admin
from services.weekly_digest import send_digest_for_user, send_weekly_digest

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/admin/weekly-digest/preview")
async def preview_weekly_digest(admin: dict = Depends(require_admin)):
    """Fire the digest email to the caller RIGHT NOW. Bypasses:
       * the ``weekly_digest`` preference check (so an admin who
         turned the pref off can still preview)
       * the "already sent this week" ledger guard
       * the "no unread items" short-circuit (so an inbox-zero admin
         still gets a demo render)

    Does NOT write a ledger row — the Monday sweep must still fire for
    this admin.
    """
    user = await db.users.find_one(
        {"user_id": admin["user_id"]},
        {
            "_id": 0,
            "user_id": 1,
            "name": 1,
            "email": 1,
            "email_is_synthetic": 1,
        },
    )
    if not user:
        raise HTTPException(404, "Admin user not found")
    if not (user.get("email") or "").strip():
        raise HTTPException(400, "This admin account has no email on file.")
    if user.get("email_is_synthetic"):
        raise HTTPException(
            400,
            "This admin account uses an Apple relay email that isn't "
            "deliverable from the server. Preview to a real email instead.",
        )
    res = await send_digest_for_user(user, force=True)
    if not res["sent"]:
        # 500 if the SMTP relay bounced — the admin needs to know, not
        # pretend-success.
        if res.get("reason") == "send_failed":
            raise HTTPException(502, "Email send failed — check SMTP logs.")
        # Any other reason is a programming error given force=True.
        raise HTTPException(500, f"Preview failed: {res.get('reason')}")
    return {"ok": True, **res}


@router.post("/admin/weekly-digest/run-now")
async def run_sweep_now(admin: dict = Depends(require_admin)):
    """Manual trigger for the full Monday-morning sweep. Useful if the
    cron missed a window (pod restart around 15:00 UTC) or we want to
    kick a mid-week catch-up. Respects every normal guard (prefs,
    already-sent, deliverability, empty-digest skip)."""
    stats = await send_weekly_digest()
    return {"ok": True, "stats": stats}


@router.get("/admin/weekly-digest/status")
async def digest_status(admin: dict = Depends(require_admin)):
    """How many digests landed this week, how many are opted out,
    and when the last sweep ran. Handy for the admin dashboard."""
    from datetime import datetime, timezone, timedelta
    from services.weekly_digest import _iso_week_key

    week_start = _iso_week_key()
    sent_this_week = await db.weekly_digest_sends.count_documents(
        {"week_start": week_start}
    )
    last_send = await db.weekly_digest_sends.find_one(
        {}, sort=[("sent_at", -1)]
    )
    opted_in = await db.users.count_documents(
        {
            "notification_prefs.weekly_digest": {"$ne": False},
            "email_is_synthetic": {"$ne": True},
        }
    )
    opted_out = await db.users.count_documents(
        {"notification_prefs.weekly_digest": False}
    )
    return {
        "current_week_start": week_start,
        "sent_this_week": sent_this_week,
        "opted_in_recipients": opted_in,
        "opted_out_users": opted_out,
        "last_send_at": (last_send or {}).get("sent_at"),
    }
