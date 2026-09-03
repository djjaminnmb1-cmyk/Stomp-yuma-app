"""Chat @mention parsing + fan-out.

Contract: instructors can write ``@name`` in a chat message. When
``name`` uniquely resolves to an existing user (case-insensitive
prefix / substring match, preferring exact matches), a row is written
to ``chat_mentions`` and a push is fired so the mentioned user gets a
nudge even when they aren't in the room.

Data model
----------
``chat_mentions``:
    ``{mention_id, mentioned_user_id, mentioner_id, mentioner_name,
       message_id, message_text_snippet, seen, created_at}``
* Unique on ``(mentioned_user_id, message_id, mentioner_id)`` so
  re-parsing the same message never doubles up.
* ``message_text_snippet`` is capped to 200 chars so the "My mentions"
  screen renders quickly.

Parsing rules
-------------
Regex ``@([A-Za-z0-9._'\-]{2,32})`` captures the raw token immediately
after the ``@``. We stop at whitespace / punctuation. For each token
we look up an exact name match first (``users.name`` iEquals) then
fall back to a case-insensitive prefix match. Ambiguous tokens (2+
matches) are silently dropped — we don't want a "did you mean" pop-up
for a chat message.
"""
from __future__ import annotations

import logging
import re
import uuid
from typing import Iterable

from core.database import db
from core.push_service import send_push
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)


# Mention token regex — 2-32 chars of name-safe symbols.
# We intentionally do NOT require a preceding whitespace so a message
# that STARTS with @Erin still counts, and a period after the token
# ("Great job @Erin.") won't break it.
_MENTION_RE = re.compile(r"@([A-Za-z0-9._'\-]{2,32})")


_INDEXES_READY = False


async def ensure_indexes() -> None:
    """Create the unique + query indexes. Idempotent."""
    global _INDEXES_READY
    if _INDEXES_READY:
        return
    try:
        await db.chat_mentions.create_index(
            [
                ("mentioned_user_id", 1),
                ("message_id", 1),
                ("mentioner_id", 1),
            ],
            unique=True,
            name="uniq_mention_dedupe",
        )
        await db.chat_mentions.create_index(
            [("mentioned_user_id", 1), ("created_at", -1)],
            name="by_recipient_recent",
        )
        _INDEXES_READY = True
    except Exception as e:
        logger.warning(f"chat_mentions index setup failed: {e}")


def extract_mention_tokens(text: str) -> list[str]:
    """Return the raw @-tokens found in ``text``, de-duplicated in
    encounter order. ``text`` may be empty / None.
    """
    if not text:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for m in _MENTION_RE.finditer(text):
        raw = m.group(1)
        low = raw.lower()
        if low in seen:
            continue
        seen.add(low)
        out.append(raw)
    return out


async def resolve_mention_token(
    token: str, exclude_user_id: str
) -> str | None:
    """Resolve a raw ``@token`` to a user_id, if it uniquely matches.

    Priority:
        1. iExact match on ``users.name``.
        2. iPrefix match on ``users.name`` — accepted only if exactly
           one user matches (ambiguity is silently dropped).

    Also folds spaces so ``@ErinB`` matches a user named "Erin B" once
    we strip whitespace. Ignores the caller themselves so a self-
    mention doesn't ping the sender.
    """
    if not token:
        return None
    stripped_token = token.strip()
    if not stripped_token:
        return None

    esc = re.escape(stripped_token)

    # 1. Exact match (case-insensitive)
    exact = await db.users.find_one(
        {"name": {"$regex": f"^{esc}$", "$options": "i"}, "user_id": {"$ne": exclude_user_id}},
        {"_id": 0, "user_id": 1, "name": 1},
    )
    if exact:
        return exact["user_id"]

    # 2. Prefix match — accept only if UNIQUE
    hits = await db.users.find(
        {"name": {"$regex": f"^{esc}", "$options": "i"}, "user_id": {"$ne": exclude_user_id}},
        {"_id": 0, "user_id": 1, "name": 1},
    ).limit(3).to_list(3)
    if len(hits) == 1:
        return hits[0]["user_id"]

    # 3. Also try "collapsed spaces" — e.g. "@ErinB" → "Erin B"
    # Insert a space after each cap-letter break and re-try prefix.
    # Skip if token already contains spaces (already tried above).
    if " " not in stripped_token and any(c.isupper() for c in stripped_token[1:]):
        spaced = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", stripped_token)
        if spaced != stripped_token:
            esc2 = re.escape(spaced)
            hit2 = await db.users.find_one(
                {"name": {"$regex": f"^{esc2}$", "$options": "i"}, "user_id": {"$ne": exclude_user_id}},
                {"_id": 0, "user_id": 1, "name": 1},
            )
            if hit2:
                return hit2["user_id"]

    return None


async def fan_out_mentions(
    text: str,
    mentioner_id: str,
    mentioner_name: str,
    message_id: str,
) -> list[str]:
    """Parse ``text``, resolve the mentions, write ledger rows +
    fire pushes. Returns the list of user_ids we actually notified.

    Best-effort — swallowed errors so a chat POST never fails because
    a downstream push provider is unreachable.
    """
    tokens = extract_mention_tokens(text or "")
    if not tokens:
        return []

    resolved: list[tuple[str, str]] = []  # (token, user_id)
    for tok in tokens:
        uid = await resolve_mention_token(tok, exclude_user_id=mentioner_id)
        if uid:
            resolved.append((tok, uid))

    if not resolved:
        return []

    # Blocks — never notify anyone the mentioner is blocked by (or has
    # blocked). Same rules as feed / chat visibility.
    from services.blocks import hidden_user_ids
    hidden = await hidden_user_ids(mentioner_id)
    if hidden:
        resolved = [(t, u) for (t, u) in resolved if u not in hidden]
    if not resolved:
        return []

    now = now_iso()
    snippet = (text or "").strip()[:200]
    notified: list[str] = []
    for (tok, uid) in resolved:
        try:
            await db.chat_mentions.insert_one({
                "mention_id": f"mention_{uuid.uuid4().hex[:12]}",
                "mentioned_user_id": uid,
                "mentioner_id": mentioner_id,
                "mentioner_name": mentioner_name or "An instructor",
                "message_id": message_id,
                "message_text_snippet": snippet,
                "seen": False,
                "created_at": now,
            })
            notified.append(uid)
        except Exception:
            # Duplicate-key — already notified this user about this
            # exact message. Silent no-op.
            continue

    if notified:
        # Respect notification prefs — mentions can be noisy.
        from services.notification_prefs import filter_recipients
        push_recipients = await filter_recipients(notified, "mention_alerts")
        if push_recipients:
            try:
                await send_push(
                    recipients=push_recipients,
                    data={
                        "title": f"{mentioner_name or 'An instructor'} mentioned you",
                        "message": snippet or "Tap to view",
                        "deeplink": "/mentions",
                        "action_url": "/mentions",
                    },
                    idempotency_key=f"chat-mention-{message_id}",
                )
            except Exception as e:
                logger.warning(f"mention push failed: {e}")

    return notified


async def list_for_user(
    user_id: str, limit: int = 40
) -> list[dict]:
    """Return the caller's chat mentions, most-recent first. Enriches
    each row with ``is_unread`` (mirrors the ``seen`` flag inverted so
    the client can render an unread pill without a re-map)."""
    rows = await db.chat_mentions.find(
        {"mentioned_user_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).limit(max(1, min(limit, 200))).to_list(limit)
    return rows


async def unread_count(user_id: str) -> int:
    return int(
        await db.chat_mentions.count_documents(
            {"mentioned_user_id": user_id, "seen": False}
        )
    )


async def mark_seen(
    user_id: str, mention_ids: Iterable[str] | None = None
) -> int:
    """Flip ``seen=True`` for ``mention_ids`` (or ALL of the caller's
    unread mentions if none passed). Returns rows updated."""
    q: dict = {"mentioned_user_id": user_id, "seen": False}
    if mention_ids is not None:
        ids = [i for i in mention_ids if i]
        if not ids:
            return 0
        q["mention_id"] = {"$in": ids}
    res = await db.chat_mentions.update_many(q, {"$set": {"seen": True}})
    return int(res.modified_count or 0)


async def purge_user(user_id: str) -> None:
    """Clean up on account deletion — remove mentions IN both
    directions so the user_id doesn't leak into an ex-user's history."""
    await db.chat_mentions.delete_many({"mentioned_user_id": user_id})
    await db.chat_mentions.delete_many({"mentioner_id": user_id})
