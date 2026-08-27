"""Instructor-only chat: post/list/delete messages.

Message visibility respects user blocks — if A has blocked B (or B has
blocked A), neither sees the other's messages in the list. Deletes and
posts are unaffected: a blocked user can still post to the room, they
just become invisible to whoever's blocked them.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_instructor
from core.time_helpers import now_iso
from models.schemas import ChatMessageIn
from services.blocks import hidden_user_ids

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
