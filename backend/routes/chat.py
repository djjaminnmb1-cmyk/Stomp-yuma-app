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
    return list(reversed(docs))  # oldest → newest


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
    try:
        notified = await fan_out_mentions(
            text=doc["message"],
            mentioner_id=instructor["user_id"],
            mentioner_name=instructor.get("name", ""),
            message_id=doc["id"],
        )
        if notified:
            doc["mentioned_user_ids"] = notified
    except Exception:
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
    return {"ok": True}


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
