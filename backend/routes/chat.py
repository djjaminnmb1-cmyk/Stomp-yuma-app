"""Instructor-only chat: post/list/delete messages."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_instructor
from core.time_helpers import now_iso
from models.schemas import ChatMessageIn

router = APIRouter()


@router.get("/chat/messages")
async def list_chat(
    instructor: dict = Depends(require_instructor), limit: int = 200
):
    docs = (
        await db.instructor_messages.find({}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(max(1, min(limit, 500)))
    )
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
