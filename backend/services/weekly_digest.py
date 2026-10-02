"""Weekly digest email — a Monday-morning recap of unread notifications.

Design decisions (confirmed with user Oct 2026):
    * Content           — unread notifications from the last 7 days,
                          grouped into 4 sections: Classes, Events,
                          Announcements, @Mentions.
    * Cap per section   — 5 items; a "+N more in the app" tail hints
                          there's more waiting in the bell icon.
    * Schedule          — Monday 08:00 America/Phoenix (15:00 UTC —
                          Arizona doesn't observe DST so this is
                          stable year-round).
    * Default           — opt-out (``notification_prefs.weekly_digest``
                          missing / True → send). Dancers can mute in
                          Settings → Notifications.
    * Empty digest      — skip the email entirely; silence is a
                          feature.
    * Synthetic emails  — skip Apple-relay accounts with
                          ``email_is_synthetic: True`` since
                          ``apple:<sub>`` isn't deliverable.
    * Idempotency       — one send ledger row per ISO-week per user
                          in ``weekly_digest_sends``. Re-running the
                          cron the same week (e.g. after a pod
                          restart) is a no-op.
    * Admin preview     — POST /api/admin/weekly-digest/preview
                          routes an on-demand send to the caller
                          bypassing the ledger (dev/QA aid).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from html import escape as _esc
from typing import Any, Iterable, Optional

from core.database import db
from core.email_service import send_email
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)


# ---------------- Section grouping ----------------
# Every known notification_feed kind is mapped to one of 4 digest
# sections. Kinds not in this map are intentionally skipped from the
# digest (they'd just add noise — e.g. a "new_follower" row isn't
# something that needs chasing down a week later).
_SECTION_LABEL_CLASSES = "📚 Classes"
_SECTION_LABEL_EVENTS = "🎉 Events"
_SECTION_LABEL_ANNOUNCEMENTS = "📣 Announcements & Pins"
_SECTION_LABEL_MENTIONS = "💬 @Mentions"

_SECTION_FOR_KIND = {
    # Classes
    "new_class": _SECTION_LABEL_CLASSES,
    "library_new_class": _SECTION_LABEL_CLASSES,
    "class_reminder": _SECTION_LABEL_CLASSES,
    # Events
    "new_event": _SECTION_LABEL_EVENTS,
    # Announcements (both immediate and scheduled "pins" land here)
    "announcement": _SECTION_LABEL_ANNOUNCEMENTS,
    # @mentions (keep chat_mention; raw chat_message is excluded to
    # avoid flooding a dancer who skipped a chatty week).
    "chat_mention": _SECTION_LABEL_MENTIONS,
}

# Preserved display order so Classes always appears above Events, etc.
_SECTION_ORDER = (
    _SECTION_LABEL_CLASSES,
    _SECTION_LABEL_EVENTS,
    _SECTION_LABEL_ANNOUNCEMENTS,
    _SECTION_LABEL_MENTIONS,
)

MAX_ITEMS_PER_SECTION = 5

# Window = last 7 days. Users who open the app Sunday night will see
# everything from last Monday forward in their Monday-morning digest.
WINDOW_DAYS = 7


# ---------------- Index + ledger helpers ----------------
_INDEXES_READY = False


async def ensure_indexes() -> None:
    """One-shot per process: unique index on (user_id, week_start)
    so re-running the cron the same week is idempotent."""
    global _INDEXES_READY
    if _INDEXES_READY:
        return
    try:
        await db.weekly_digest_sends.create_index(
            [("user_id", 1), ("week_start", 1)],
            unique=True,
            name="uniq_user_week",
        )
        _INDEXES_READY = True
    except Exception as e:
        logger.warning(f"weekly_digest_sends index setup failed: {e}")


def _iso_week_key(at: Optional[datetime] = None) -> str:
    """Return the ISO week start-date (Monday) as YYYY-MM-DD. Used as
    the idempotency key for "sent this user this week's digest already"."""
    now = at or datetime.now(timezone.utc)
    monday = now - timedelta(days=now.weekday())
    return monday.strftime("%Y-%m-%d")


async def _mark_sent(user_id: str, week_start: str, items: int) -> None:
    try:
        await db.weekly_digest_sends.insert_one(
            {
                "id": f"wds_{uuid.uuid4().hex[:12]}",
                "user_id": user_id,
                "week_start": week_start,
                "sent_at": now_iso(),
                "item_count": int(items),
            }
        )
    except Exception as e:  # noqa: BLE001
        # Duplicate = already sent this week; log at info level only.
        logger.info(f"weekly_digest_sends insert: {e}")


async def _already_sent_this_week(user_id: str, week_start: str) -> bool:
    doc = await db.weekly_digest_sends.find_one(
        {"user_id": user_id, "week_start": week_start}, {"_id": 1}
    )
    return doc is not None


# ---------------- Data collection ----------------
async def collect_user_digest(user_id: str) -> dict[str, Any]:
    """Pull every UNREAD notification row for ``user_id`` in the last
    ``WINDOW_DAYS`` days, grouped into the 4 digest sections (capped
    at ``MAX_ITEMS_PER_SECTION`` each).

    Returns::

        {
            "total_items": <int, sum of displayed items>,
            "total_unread_in_window": <int, raw unread count>,
            "sections": [
                {
                    "label": "📚 Classes",
                    "items": [{title, body, deeplink, kind, created_at}, ...],
                    "shown": <int>,
                    "truncated": <int, how many extra rows exist>,
                },
                ...
            ],
            "generated_at": <iso>,
            "window_start": <iso>,
        }
    """
    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)
    ).isoformat()
    cur = db.notification_events.find(
        {
            "user_id": user_id,
            "read_at": None,
            "created_at": {"$gte": cutoff},
        },
        {
            "_id": 0,
            "id": 1,
            "kind": 1,
            "title": 1,
            "body": 1,
            "deeplink": 1,
            "created_at": 1,
        },
    ).sort("created_at", -1)
    buckets: dict[str, list[dict]] = {s: [] for s in _SECTION_ORDER}
    raw_total = 0
    async for row in cur:
        kind = row.get("kind", "")
        section = _SECTION_FOR_KIND.get(kind)
        if not section:
            continue
        raw_total += 1
        buckets[section].append(row)

    sections = []
    total_items = 0
    for label in _SECTION_ORDER:
        rows = buckets[label]
        shown = rows[:MAX_ITEMS_PER_SECTION]
        truncated = max(0, len(rows) - MAX_ITEMS_PER_SECTION)
        if not shown:
            continue
        sections.append(
            {
                "label": label,
                "items": shown,
                "shown": len(shown),
                "truncated": truncated,
            }
        )
        total_items += len(shown)

    return {
        "total_items": total_items,
        "total_unread_in_window": raw_total,
        "sections": sections,
        "generated_at": now_iso(),
        "window_start": cutoff,
    }


# ---------------- Rendering ----------------
def _rel_days(iso: str) -> str:
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except Exception:
        return ""
    now = datetime.now(timezone.utc)
    diff = (now - d).total_seconds()
    if diff < 60:
        return "just now"
    if diff < 3600:
        return f"{int(diff / 60)}m ago"
    if diff < 86_400:
        return f"{int(diff / 3600)}h ago"
    days = int(diff / 86_400)
    return f"{days}d ago" if days != 1 else "1 day ago"


_SUBJECT = "Your week on the dance floor — Stompin' Ground Yuma"


def _render_html(user: dict, digest: dict, app_url: str) -> str:
    name = _esc(user.get("name", "").split()[0] or "there")
    sections_html = []
    for sec in digest["sections"]:
        label = _esc(sec["label"])
        rows_html = []
        for it in sec["items"]:
            title = _esc(it.get("title") or "")
            body = _esc(it.get("body") or "")
            when = _esc(_rel_days(it.get("created_at", "")))
            rows_html.append(
                f"""
                <tr>
                    <td style="padding:12px 0;border-top:1px solid #eee;">
                        <div style="font-weight:600;color:#1a1a1a;font-size:15px;">
                            {title}
                        </div>
                        <div style="color:#555;font-size:14px;line-height:1.4;margin-top:4px;">
                            {body}
                        </div>
                        <div style="color:#999;font-size:12px;margin-top:6px;">
                            {when}
                        </div>
                    </td>
                </tr>
                """
            )
        more_html = ""
        if sec["truncated"] > 0:
            more_html = f"""
                <tr>
                    <td style="padding:10px 0 0;">
                        <a href="{app_url}/notifications"
                           style="color:#D62828;text-decoration:none;font-weight:600;font-size:13px;">
                            +{sec['truncated']} more in the app →
                        </a>
                    </td>
                </tr>
            """
        sections_html.append(
            f"""
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                   style="margin:28px 0 0;">
                <tr>
                    <td style="padding-bottom:4px;">
                        <div style="font-size:18px;font-weight:700;color:#1a1a1a;">
                            {label}
                        </div>
                    </td>
                </tr>
                {''.join(rows_html)}
                {more_html}
            </table>
            """
        )

    inner = "".join(sections_html)
    settings_url = f"{app_url}/settings/notifications"
    bell_url = f"{app_url}/notifications"
    total = digest["total_items"]
    item_word = "item" if total == 1 else "items"
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Your week on the dance floor</title>
</head>
<body style="margin:0;padding:0;background:#faf6ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;">
        <tr>
            <td align="center" style="padding:24px 12px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                       style="max-width:560px;background:#ffffff;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.04);overflow:hidden;">
                    <tr>
                        <td style="background:linear-gradient(135deg,#D62828 0%,#F77F00 100%);padding:28px 24px;text-align:center;">
                            <div style="color:#fff;font-weight:800;font-size:22px;letter-spacing:0.5px;">
                                Stompin' Ground Yuma
                            </div>
                            <div style="color:#ffe8d6;font-weight:500;font-size:13px;margin-top:4px;">
                                Your week on the dance floor
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:28px 24px 8px;">
                            <div style="font-size:20px;font-weight:700;color:#1a1a1a;">
                                Hey {name} 👋
                            </div>
                            <div style="font-size:15px;color:#444;line-height:1.5;margin-top:8px;">
                                You've got <strong>{total}</strong> unread {item_word} waiting for you
                                from the past week. Here's the roundup so nothing slips past.
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 24px 8px;">
                            {inner}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:28px 24px 8px;">
                            <a href="{bell_url}"
                               style="display:inline-block;background:#D62828;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px;font-size:14px;">
                                Open the Notification Center
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:16px 24px 28px;color:#888;font-size:12px;line-height:1.6;">
                            You're receiving this because weekly digest emails are on
                            in your preferences.
                            <a href="{settings_url}" style="color:#D62828;text-decoration:none;">
                                Change your notification settings
                            </a>
                            anytime.
                        </td>
                    </tr>
                </table>
                <div style="color:#999;font-size:11px;margin-top:16px;">
                    Stompin' Ground Yuma · Yuma, AZ · Where line dancing is community
                </div>
            </td>
        </tr>
    </table>
</body>
</html>
"""


def _render_text(user: dict, digest: dict, app_url: str) -> str:
    name = user.get("name", "").split()[0] or "there"
    lines = [
        f"Hey {name},",
        "",
        f"You've got {digest['total_items']} unread notification(s) from the "
        "past week on Stompin' Ground Yuma. Here's the roundup:",
        "",
    ]
    for sec in digest["sections"]:
        lines.append(sec["label"])
        lines.append("-" * 40)
        for it in sec["items"]:
            when = _rel_days(it.get("created_at", ""))
            title = (it.get("title") or "").strip()
            body = (it.get("body") or "").strip()
            lines.append(f"  • {title}")
            if body:
                lines.append(f"    {body}")
            if when:
                lines.append(f"    ({when})")
        if sec["truncated"] > 0:
            lines.append(
                f"  +{sec['truncated']} more waiting in the app →"
            )
        lines.append("")
    lines += [
        f"Open the Notification Center: {app_url}/notifications",
        "",
        f"Change your settings: {app_url}/settings/notifications",
        "",
        "— Stompin' Ground Yuma",
    ]
    return "\n".join(lines)


# ---------------- Delivery ----------------
def _app_url() -> str:
    import os
    url = (
        os.environ.get("APP_BASE_URL")
        or os.environ.get("PUBLIC_APP_URL")
        or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
        or ""
    ).rstrip("/")
    # Strip trailing /api if the backend URL was reused as a fallback.
    if url.endswith("/api"):
        url = url[:-4]
    return url or "https://stompinground.com"


def _is_deliverable_email(user: dict) -> bool:
    """Apple private-relay / synthetic addresses are NOT deliverable.
    Also sanity-check the shape so we don't blast SMTP with junk."""
    if user.get("email_is_synthetic"):
        return False
    email = (user.get("email") or "").strip().lower()
    if not email or "@" not in email or email.startswith("apple:"):
        return False
    return True


async def send_digest_for_user(
    user: dict, *, force: bool = False
) -> dict[str, Any]:
    """Collect + render + send the digest for a single user. Returns
    a status dict so the caller (admin preview / sweep) can log.

    ``force=True`` skips both the pref check AND the already-sent-this-
    week guard — reserved for the admin preview endpoint.
    """
    user_id = user.get("user_id") or ""
    email = (user.get("email") or "").strip()
    week_start = _iso_week_key()

    if not user_id or not email:
        return {"sent": False, "reason": "missing_user_or_email", "user_id": user_id}

    if not force:
        if not _is_deliverable_email(user):
            return {
                "sent": False,
                "reason": "undeliverable_email",
                "user_id": user_id,
            }
        from services.notification_prefs import get_prefs
        prefs = await get_prefs(user_id)
        if not prefs.get("weekly_digest", True):
            return {
                "sent": False,
                "reason": "pref_disabled",
                "user_id": user_id,
            }
        if await _already_sent_this_week(user_id, week_start):
            return {
                "sent": False,
                "reason": "already_sent_this_week",
                "user_id": user_id,
            }

    digest = await collect_user_digest(user_id)
    if digest["total_items"] == 0 and not force:
        return {
            "sent": False,
            "reason": "no_unread_items",
            "user_id": user_id,
        }

    app_url = _app_url()
    html = _render_html(user, digest, app_url)
    text = _render_text(user, digest, app_url)
    ok = await send_email(email, _SUBJECT, text, html=html)
    if ok and not force:
        await _mark_sent(user_id, week_start, digest["total_items"])
    return {
        "sent": bool(ok),
        "reason": "sent" if ok else "send_failed",
        "user_id": user_id,
        "email": email,
        "items": digest["total_items"],
        "sections": [s["label"] for s in digest["sections"]],
        "force": force,
    }


async def send_weekly_digest() -> dict[str, Any]:
    """Scheduler entry point — sweep every user with the pref ON and a
    deliverable email. Idempotent per ISO week via the sends ledger.

    Returns summary stats so the next run's log line is informative.
    """
    await ensure_indexes()
    week_start = _iso_week_key()
    logger.info(f"weekly_digest sweep start week_start={week_start}")

    stats = {
        "week_start": week_start,
        "scanned": 0,
        "sent": 0,
        "skipped_pref": 0,
        "skipped_empty": 0,
        "skipped_synthetic": 0,
        "skipped_already": 0,
        "send_failures": 0,
    }

    # Pull only the fields we need. Users with the pref explicitly OFF
    # are server-side filtered to keep the pipeline tight. We can't
    # pre-filter "already sent this week" at the DB level without a
    # join, so that's a per-user check inside send_digest_for_user.
    #
    # Note: `notification_prefs.weekly_digest: {$ne: false}` keeps the
    # "missing key → opt-out" default — anyone who's never touched the
    # settings gets the digest.
    cur = db.users.find(
        {
            "notification_prefs.weekly_digest": {"$ne": False},
            "email_is_synthetic": {"$ne": True},
        },
        {
            "_id": 0,
            "user_id": 1,
            "name": 1,
            "email": 1,
            "email_is_synthetic": 1,
        },
    )
    async for u in cur:
        stats["scanned"] += 1
        try:
            res = await send_digest_for_user(u)
            if res["sent"]:
                stats["sent"] += 1
            else:
                reason = res.get("reason", "")
                if reason == "pref_disabled":
                    stats["skipped_pref"] += 1
                elif reason == "no_unread_items":
                    stats["skipped_empty"] += 1
                elif reason == "undeliverable_email":
                    stats["skipped_synthetic"] += 1
                elif reason == "already_sent_this_week":
                    stats["skipped_already"] += 1
                else:
                    stats["send_failures"] += 1
        except Exception as e:  # noqa: BLE001
            stats["send_failures"] += 1
            logger.warning(
                f"weekly_digest per-user failure user_id={u.get('user_id')} "
                f"err={e}"
            )

    logger.info(f"weekly_digest sweep done {stats}")
    return stats


async def purge_user(user_id: str) -> None:
    """Called from account deletion to clear this user's send ledger
    so a replay doesn't leak history to a re-registered email."""
    await db.weekly_digest_sends.delete_many({"user_id": user_id})
