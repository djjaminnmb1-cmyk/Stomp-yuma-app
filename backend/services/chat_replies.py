"""Fan-out helper for CHAT REPLY push + in-app notification.

When a dancer taps "Reply" on another dancer's message and posts, we
want to buzz the ORIGINAL POSTER (parent.user_id) specifically so a
thread doesn't quietly die. This is distinct from:

* `fan_out_mentions`     — fires for ``@username`` tokens anywhere in
                           the message body
* `fan_out_chat_post`    — fires a general "someone posted" push to
                           every eligible chat-room member

Replies are considered a direct-engagement signal (someone talking
TO you specifically), so we gate on ``notification_prefs.mention_alerts``
rather than ``chat_alerts`` — this keeps the behavior intuitive:
"muting @mentions also mutes replies to me". It also means replies
respect quiet hours (mention_alerts is in the quiet-hours category
list).

Delivery rules (in order):

1. **Recipient** = parent message's ``user_id`` (singleton — a reply
   fans out to one person, not a pool).
2. Skip if replier == parent author (self-reply).
3. Skip if parent is already deleted / missing.
4. Skip if the parent author has blocked the replier (or vice versa).
5. Skip if the parent author is already in the ``already_notified``
   set — e.g. a reply that also tags the parent author via @mention
   should buzz exactly once (the @mention wins).
6. Skip if parent author has ``mention_alerts = False``.

Returns the (singleton or empty) list of pushed user_ids so the
caller can forward it into ``fan_out_chat_post`` as
``already_notified``.
"""
from __future__ import annotations

import logging

from core.database import db
from core.push_service import send_push_localised
from services.blocks import hidden_user_ids
from services.notification_prefs import filter_recipients

logger = logging.getLogger(__name__)


async def fan_out_chat_reply(
    *,
    reply_message_id: str,
    reply_text: str,
    replier_user_id: str,
    replier_name: str,
    parent_id: str,
    already_notified: list[str] | None = None,
) -> list[str]:
    """Push + feed-log the "someone replied to your message" alert.

    Returns the list of user_ids that were queued (0 or 1 element).
    """
    if not reply_message_id or not parent_id or not replier_user_id:
        return []

    parent = await db.instructor_messages.find_one(
        {"id": parent_id},
        {"_id": 0, "id": 1, "user_id": 1, "message": 1},
    )
    if not parent:
        # Deleted / unknown — the reply still exists but there's no
        # one to notify.
        return []
    parent_author = (parent.get("user_id") or "").strip()
    if not parent_author or parent_author == replier_user_id:
        return []

    already = set(already_notified or [])
    if parent_author in already:
        # @mention already handled it — don't double-buzz.
        return []

    # Mutual block check — if either side has hidden the other, no ping.
    try:
        if parent_author in await hidden_user_ids(replier_user_id):
            return []
        if replier_user_id in await hidden_user_ids(parent_author):
            return []
    except Exception:
        # Defense-in-depth; the pref filter still provides opt-out
        # control if the block lookup flakes.
        pass

    # Opt-out via notification_prefs.mention_alerts (same gate as @mentions).
    try:
        allowed = await filter_recipients([parent_author], "mention_alerts")
    except Exception:
        allowed = [parent_author]
    if not allowed:
        return []

    preview = (reply_text or "").strip()[:100]
    sender = (replier_name or "Someone").strip() or "Someone"

    try:
        await send_push_localised(
            recipients=allowed,
            title_key="push.chat_reply.title",
            body_key="push.chat_reply.body",
            params={"sender": sender, "preview": preview},
            data={
                "deeplink": "/(tabs)/instructor",
                "action_url": "/(tabs)/instructor",
                "kind": "chat_reply",
                "message_id": reply_message_id,
                "parent_id": parent_id,
            },
            idempotency_key=f"chat-reply-{reply_message_id}",
        )
    except Exception as e:  # pragma: no cover — network/relay flake
        logger.warning(f"chat reply push failed: {e}")

    try:
        from services.notification_feed import log_event
        await log_event(
            recipients=allowed,
            kind="chat_reply",
            title=f"{sender} replied to your message",
            body=preview or "Tap to view the thread",
            deeplink="/(tabs)/instructor",
            metadata={
                "entity_id": reply_message_id,
                "entity_type": "chat_reply",
                "parent_id": parent_id,
                "replier_id": replier_user_id,
            },
        )
    except Exception as e:
        logger.warning(f"chat reply feed log failed: {e}")

    return allowed
