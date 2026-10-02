"""Admin-authored announcements — a lightweight "pin" that fans out
to every user as a push + a durable row they can browse later.

Routes (see ``routes/announcements.py``):

* ``POST /api/admin/announcements``  — admin creates + broadcasts
* ``GET  /api/announcements``        — any user reads the recent feed

Delivery rules (in order):

1. **Recipient pool** = every user, minus the author.
2. Exclude anyone whose ``notification_prefs.announcements=False``
   via the shared ``filter_recipients`` helper (default True).

The push + the DB write are decoupled: the row is inserted FIRST so
the "Announcements" feed always has the latest message even if the
push relay is down. The push itself is best-effort and never raises.
"""
from __future__ import annotations

import logging
import uuid

from core.database import db
from core.push_service import send_push_localised
from core.time_helpers import now_iso
from services.notification_prefs import filter_recipients

logger = logging.getLogger(__name__)


# -------- Row shape --------
# {
#   "id": "ann_<hex>",
#   "title": "...",
#   "body":  "...",
#   "created_by": "<user_id>",
#   "created_by_name": "...",
#   "created_at": "<iso>",
# }
# No TTL — admins can keep history forever. The feed query caps the
# list length at 50 and sorts by created_at desc, so tail rows just
# become archive.

_ANN_MAX_TITLE = 120
_ANN_MAX_BODY = 2000


async def create_and_broadcast(
    *,
    title: str,
    body: str,
    author: dict,
) -> dict:
    """Insert the announcement row AND fan out the push.

    Returns the stored announcement dict so the admin UI can show the
    just-created item at the top of its list without a second GET.
    """
    title = (title or "").strip()[:_ANN_MAX_TITLE]
    body = (body or "").strip()[:_ANN_MAX_BODY]
    author_id = (author or {}).get("user_id") or ""
    author_name = (
        (author or {}).get("name")
        or (author or {}).get("email")
        or "Admin"
    )

    doc = {
        "id": f"ann_{uuid.uuid4().hex[:12]}",
        "title": title,
        "body": body,
        "created_by": author_id,
        "created_by_name": author_name,
        "created_at": now_iso(),
    }
    await db.announcements.insert_one(doc)
    doc.pop("_id", None)

    # Fan-out — all users except the author.
    pool: list[str] = []
    async for row in db.users.find(
        {}, {"_id": 0, "user_id": 1},
    ):
        uid = row.get("user_id")
        if uid and uid != author_id:
            pool.append(uid)
    if not pool:
        return doc

    try:
        pool = await filter_recipients(pool, "announcements")
    except Exception:
        # Pref-lookup flake: default to delivering.
        pass

    if not pool:
        return doc

    # The push body is a tight preview of the full text so an
    # auto-collapsed notification still carries the information. Users
    # can tap through to the "Announcements" screen for the full body.
    preview = body[:140]
    try:
        await send_push_localised(
            recipients=pool,
            title_key="push.announcement.title",
            body_key="push.announcement.body",
            params={"title": title or "Announcement", "preview": preview},
            data={
                "deeplink": "/announcements",
                "action_url": "/announcements",
                "kind": "announcement",
                "announcement_id": doc["id"],
            },
            idempotency_key=f"announcement-{doc['id']}",
        )
    except Exception as e:  # pragma: no cover — network / relay flake
        logger.warning(f"announcement push failed: {e}")

    return doc


async def list_recent(limit: int = 50) -> list[dict]:
    """Newest-first, capped at 50 (lightweight read for the Users
    feed and the admin history view)."""
    cur = db.announcements.find({}, {"_id": 0}).sort(
        "created_at", -1
    ).limit(max(1, min(int(limit or 50), 200)))
    return [row async for row in cur]


async def delete_announcement(ann_id: str) -> bool:
    """Admin removes a mistake. Returns True if a row was deleted."""
    res = await db.announcements.delete_one({"id": ann_id})
    return bool(int(res.deleted_count or 0) > 0)
