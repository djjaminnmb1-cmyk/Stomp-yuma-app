"""Instructor-only chat: post/list/delete messages.

Message visibility respects user blocks — if A has blocked B (or B has
blocked A), neither sees the other's messages in the list. Deletes and
posts are unaffected: a blocked user can still post to the room, they
just become invisible to whoever's blocked them.

@mention fan-out: chat posts are parsed for ``@name`` tokens; each
resolved user is written to ``chat_mentions`` and receives a push.
See ``services/chat_mentions.py`` for the parser + push logic.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import db
from core.security import get_current_user, require_instructor
from core.time_helpers import now_iso
from models.schemas import ChatMessageIn
from services.blocks import hidden_user_ids
from services.chat_mentions import (
    fan_out_mentions,
    list_for_user as list_mentions_for_user,
    mark_seen as mark_mentions_seen,
    unread_count as chat_mentions_unread_count,
)
from services.chat_notifications import fan_out_chat_post
from services.chat_reactions import (
    ensure_indexes as ensure_chat_reaction_indexes,  # noqa: F401 — kept for startup
    purge_message as purge_message_reactions,
    summarize_for_messages as summarize_reactions,
    toggle as toggle_chat_reaction,
)
from services.chat_reads import (
    mark_read as chat_mark_read,
    read_state_for_room as chat_read_state,
)

router = APIRouter()


@router.get("/chat/messages")
async def list_chat(
    instructor: dict = Depends(require_instructor), limit: int = 200
):
    """Return chat with blocked users' posts filtered out.

    We over-fetch a little when a block list exists so a viewer with
    many blocks doesn't end up with a suspiciously short room. Cap is
    still ``limit`` after filtering.
    """
    hidden = await hidden_user_ids(instructor["user_id"])
    lim = max(1, min(int(limit or 200), 500))

    if hidden:
        query = {"user_id": {"$nin": list(hidden)}}
        # Over-fetch by (blocked-count + 20%) so the returned page stays
        # near ``limit`` even if the room has a spammy blocked poster.
        fetch = min(500, lim + max(20, len(hidden) * 4))
    else:
        query = {}
        fetch = lim

    docs = (
        await db.instructor_messages.find(query, {"_id": 0})
        .sort("created_at", -1)
        .to_list(fetch)
    )
    docs = docs[:lim]
    docs = list(reversed(docs))  # oldest → newest

    # Reaction summary — one aggregate over the visible window so the
    # chat bubbles can render their emoji chips without a per-message
    # round-trip. Empty buckets are omitted so the payload stays lean.
    msg_ids = [d["id"] for d in docs if d.get("id")]
    if msg_ids:
        buckets = await summarize_reactions(msg_ids, instructor["user_id"])
        for d in docs:
            r = buckets.get(d.get("id") or "")
            if r:
                d["reactions"] = r
    return docs


# ---------------- Read receipts ----------------
@router.get("/chat/reads")
async def get_chat_reads(
    instructor: dict = Depends(require_instructor),
):
    """Return every instructor / admin's ``last_read_at`` timestamp so
    the client can render "seen by …" avatar rows.

    Piggybacks the same 6s poll the chat feed already runs. Users with
    no ``chat_reads`` row (never opened the room) return
    ``last_read_at=""`` so the client can show them as "hasn't caught
    up".
    """
    reads = await chat_read_state()
    return {"reads": reads, "count": len(reads)}


class MarkChatReadBody(BaseModel):
    at: Optional[str] = None  # ISO timestamp of the newest visible msg


@router.post("/chat/mark-read")
async def post_mark_chat_read(
    body: MarkChatReadBody,
    instructor: dict = Depends(require_instructor),
):
    """Bump the caller's chat ``last_read_at`` marker.

    Called by the chat screen when it mounts, whenever a new inbound
    message appears while the tab is focused, and on the "scroll to
    bottom" tap. Idempotent + monotonic — ``mark_read`` never rewinds
    the pointer, so a background poll can't clobber a fresher UI
    read.
    """
    persisted = await chat_mark_read(instructor["user_id"], at=body.at)
    return {"ok": True, "last_read_at": persisted}


@router.post("/chat/messages")
async def post_chat(
    inp: ChatMessageIn, instructor: dict = Depends(require_instructor)
):
    text = (inp.message or "").strip()
    if not text:
        raise HTTPException(400, "Empty message")
    doc = {
        "id": f"msg_{uuid.uuid4().hex[:10]}",
        "user_id": instructor["user_id"],
        "user_name": instructor.get("name", ""),
        "message": text[:2000],
        "created_at": now_iso(),
    }
    await db.instructor_messages.insert_one(doc)
    doc.pop("_id", None)
    # Fan-out @mentions — best-effort. Runs INLINE so a follower who's
    # actively in the app on a slow network still sees the ledger row
    # by the time they tap the push. If the resolver misfires the
    # helper swallows the error rather than blocking the send.
    mentioned: list[str] = []
    try:
        mentioned = await fan_out_mentions(
            text=doc["message"],
            mentioner_id=instructor["user_id"],
            mentioner_name=instructor.get("name", ""),
            message_id=doc["id"],
        )
        if mentioned:
            doc["mentioned_user_ids"] = mentioned
    except Exception:
        pass
    # Fan-out "someone posted" push to everyone else in the room who
    # hasn't opted out via ``notification_prefs.chat_alerts``. Users
    # already notified by the mention fan-out above are skipped so a
    # single ``@Erin nice one!`` never buzzes Erin twice.
    try:
        await fan_out_chat_post(
            message_id=doc["id"],
            message_text=doc["message"],
            poster_user_id=instructor["user_id"],
            poster_name=instructor.get("name", ""),
            already_notified=mentioned,
        )
    except Exception:
        # Never let a push flake break the POST — chat still returns
        # the fresh doc so the poster sees their message immediately.
        pass
    return doc


@router.delete("/chat/messages/{msg_id}")
async def delete_chat(
    msg_id: str, instructor: dict = Depends(require_instructor)
):
    doc = await db.instructor_messages.find_one({"id": msg_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if doc["user_id"] != instructor["user_id"] and not instructor.get("is_admin"):
        raise HTTPException(403, "Not allowed")
    await db.instructor_messages.delete_one({"id": msg_id})
    # Cascade — a deleted bubble shouldn't leave orphan reaction rows.
    await purge_message_reactions(msg_id)
    return {"ok": True}


# ---------------- Reactions ----------------
class ReactionBody(BaseModel):
    kind: str  # short emoji token, e.g. "👍" or "🎉"


@router.post("/chat/messages/{msg_id}/reactions")
async def post_react(
    msg_id: str,
    body: ReactionBody,
    instructor: dict = Depends(require_instructor),
):
    """Toggle an emoji reaction for the caller on this message.

    Idempotent under retry — a duplicate add just flips back to
    removed. Blocked users still can't be reacted-to (they don't show
    up in the caller's chat list at all, so ``msg_id`` would 404).
    """
    doc = await db.instructor_messages.find_one({"id": msg_id}, {"_id": 0, "user_id": 1})
    if not doc:
        raise HTTPException(404, "Not found")
    # Respect blocks — if the message author blocked the caller (or
    # vice versa), don't let a reaction sneak through as an
    # ambient signal that the caller is still there.
    hidden = await hidden_user_ids(instructor["user_id"])
    if doc.get("user_id") in hidden:
        raise HTTPException(404, "Not found")
    result = await toggle_chat_reaction(
        message_id=msg_id,
        kind=body.kind,
        user_id=instructor["user_id"],
        user_name=instructor.get("name", ""),
    )
    # Return the fresh summary for JUST this message so the client can
    # re-render its chip row in a single call.
    buckets = await summarize_reactions([msg_id], instructor["user_id"])
    return {**result, "reactions": buckets.get(msg_id, {"counts": {}, "mine": []})}


# ---------------- @mentions (recipient view) ----------------
@router.get("/chat/mentions/me")
async def get_my_mentions(
    limit: int = Query(default=40, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    """List the caller's chat mentions, most recent first.

    Available to ANY authenticated user — students / dancers who
    aren't in the chat room still receive mentions and can view
    them from the "My mentions" screen. The chat room itself
    remains gated behind ``require_instructor``.
    """
    rows = await list_mentions_for_user(user["user_id"], limit=limit)
    unread = await chat_mentions_unread_count(user["user_id"])
    return {
        "mentions": rows,
        "count": len(rows),
        "unread_count": unread,
    }


class MarkMentionsSeenBody(BaseModel):
    mention_ids: Optional[list[str]] = None


@router.post("/chat/mentions/mark-seen")
async def post_mark_mentions_seen(
    body: MarkMentionsSeenBody,
    user: dict = Depends(get_current_user),
):
    """Flip ``seen=True`` for the passed mention ids (or ALL of the
    caller's unread mentions if the list is None / empty)."""
    updated = await mark_mentions_seen(user["user_id"], body.mention_ids)
    return {"ok": True, "updated": int(updated)}
