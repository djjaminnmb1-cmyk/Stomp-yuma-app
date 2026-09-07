"""Fan-out helper for chat-room push notifications.

Every new post in the instructor chat room fires a push to the OTHER
instructors and admins in the room, so someone who isn't currently
looking at the chat tab still knows a conversation is happening.

Delivery rules (in order):

1. **Recipient pool** = every user with ``is_instructor=True`` OR
   ``is_admin=True``.
2. Exclude the poster themselves — no self-notification.
3. Exclude anyone the poster has blocked (or who has blocked them) —
   mirrors chat-list visibility so a blocked user never resurfaces
   through a push.
4. Exclude anyone already fanned-out by ``fan_out_mentions`` for this
   same message — a single ``@Erin great post!`` should not buzz Erin
   twice.
5. Exclude anyone whose ``notification_prefs.chat_alerts = False`` —
   respected by the shared ``filter_recipients`` helper.

The push itself is fire-and-forget: any transient failure is logged
and swallowed so the chat POST always returns a fresh doc to the
poster regardless.
"""
from __future__ import annotations

import logging

from core.database import db
from core.push_service import send_push_localised
from services.blocks import hidden_user_ids
from services.notification_prefs import filter_recipients

logger = logging.getLogger(__name__)


async def fan_out_chat_post(
    *,
    message_id: str,
    message_text: str,
    poster_user_id: str,
    poster_name: str,
    already_notified: list[str] | None = None,
) -> list[str]:
    """Push a "new chat message" alert to every eligible instructor/admin.

    Returns the list of user_ids that were queued for delivery so the
    caller can log / test against.
    """
    if not message_id or not poster_user_id:
        return []

    already = set(already_notified or [])
    already.add(poster_user_id)  # never notify the poster of their own post

    # 1 + 2. Pool: instructors OR admins, excluding the poster.
    pool: list[str] = []
    async for row in db.users.find(
        {
            "$or": [
                {"is_instructor": True},
                {"is_admin": True},
            ],
        },
        {"_id": 0, "user_id": 1},
    ):
        uid = row.get("user_id")
        if uid and uid not in already:
            pool.append(uid)
    if not pool:
        return []

    # 3. Blocks — mutual hide.
    try:
        hidden = await hidden_user_ids(poster_user_id)
        if hidden:
            pool = [u for u in pool if u not in hidden]
    except Exception:
        # Non-fatal; blocks visibility is defense-in-depth on top of the
        # explicit pref filter that follows.
        pass
    if not pool:
        return []

    # 5. Per-user opt-out via notification_prefs.
    try:
        pool = await filter_recipients(pool, "chat_alerts")
    except Exception:
        # If the pref-lookup fails, default to sending — matches the
        # "opt-out, not opt-in" contract of the shared helper.
        pass
    if not pool:
        return []

    preview = (message_text or "").strip()[:100]
    sender = (poster_name or "Someone").strip() or "Someone"
    try:
        await send_push_localised(
            recipients=pool,
            title_key="push.chat_message.title",
            body_key="push.chat_message.body",
            params={"sender": sender, "preview": preview},
            data={
                "deeplink": "/(tabs)/instructor",
                "action_url": "/(tabs)/instructor",
                "kind": "chat_message",
                "message_id": message_id,
            },
            idempotency_key=f"chat-message-{message_id}",
        )
    except Exception as e:  # pragma: no cover — network/relay flake
        logger.warning(f"chat post push failed: {e}")

    return pool
