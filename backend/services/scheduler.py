"""Background scheduler for time-based reminders.

Currently: 24-hour class reminder push. Uses ``sent_reminders`` collection
for per-class idempotency so we never duplicate a notification.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from core.database import db
from core.push_service import send_push
from core.time_helpers import now_iso
from services.refresh_recommendations import run_nightly_scan

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")


async def send_24h_class_reminders():
    """Runs hourly. Pushes a heads-up to attendees whose 'I was there' record
    is on a class dated tomorrow. Uses per-class idempotency to avoid duplicates.
    """
    try:
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
        upcoming = await db.classes.find(
            {"date": tomorrow}, {"_id": 0}
        ).to_list(500)
        for klass in upcoming:
            # Attendees who "signed up" (marked they'll be there)
            atts = await db.attendance.find(
                {"class_id": klass["id"]}, {"_id": 0, "user_id": 1}
            ).to_list(2000)
            recipients = [a["user_id"] for a in atts]
            if not recipients:
                continue

            # Have we already sent this reminder?
            key = f"reminder-24h-{klass['id']}"
            already = await db.sent_reminders.find_one({"key": key})
            if already:
                continue

            label = klass.get("session_label") or "Line dance class"
            dance_names = ", ".join([d["name"] for d in klass.get("dances", [])[:3]])
            more = (
                f" +{len(klass.get('dances', [])) - 3} more"
                if len(klass.get("dances", [])) > 3
                else ""
            )
            try:
                await send_push(
                    recipients=recipients,
                    data={
                        "title": f"Tomorrow: {label}",
                        "message": (
                            f"See you at {klass.get('date')}! "
                            f"Dances: {dance_names}{more}"
                        ),
                        "action_url": "/classes",
                    },
                    idempotency_key=key,
                )
                await db.sent_reminders.insert_one({
                    "key": key,
                    "class_id": klass["id"],
                    "sent_at": now_iso(),
                    "recipient_count": len(recipients),
                })
                logger.info(
                    f"Sent 24h reminder for class {klass['id']} to "
                    f"{len(recipients)} attendees"
                )
            except Exception as e:
                logger.warning(f"Reminder push failed for {klass['id']}: {e}")
    except Exception as e:
        logger.exception(f"send_24h_class_reminders crashed: {e}")


def start_scheduler() -> None:
    """Register the hourly job and start the scheduler (idempotent)."""
    try:
        scheduler.add_job(
            send_24h_class_reminders,
            "interval",
            hours=1,
            id="class_24h_reminders",
            replace_existing=True,
            next_run_time=datetime.now(timezone.utc) + timedelta(seconds=30),
        )
        # Refresh-recommendations drift scan — runs once every 24h at
        # 08:00 UTC (03:00 AZ time, well outside the busy dance-class
        # window). Rate-limited internally to ~1 req/sec so upstream
        # providers stay happy. First run is scheduled 5 minutes after
        # boot so a fresh deploy immediately starts flagging drift
        # rather than waiting for the next scheduled tick.
        scheduler.add_job(
            run_nightly_scan,
            "interval",
            hours=24,
            id="drift_refresh_scan",
            replace_existing=True,
            next_run_time=datetime.now(timezone.utc) + timedelta(minutes=5),
        )
        if not scheduler.running:
            scheduler.start()
        logger.info("Reminder scheduler started (hourly + daily drift scan)")
    except Exception as e:
        logger.warning(f"Could not start scheduler: {e}")


def stop_scheduler() -> None:
    try:
        if scheduler.running:
            scheduler.shutdown(wait=False)
    except Exception:
        pass
