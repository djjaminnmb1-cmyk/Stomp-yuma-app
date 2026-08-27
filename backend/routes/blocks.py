"""Block/unblock routes for user-level moderation.

Blocking is mutual — see ``services/blocks.py`` for the invariants.
These routes are the thin HTTP surface; the interesting logic lives in
the service module so chat / feed / reactor lists can share the same
"who is hidden from me?" query.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from core.database import db
from core.security import get_current_user
from services import blocks as blocks_svc

router = APIRouter()


class BlockBody(BaseModel):
    user_id: Optional[str] = None
    email: Optional[EmailStr] = None


async def _resolve_target(user_id: Optional[str], email: Optional[str]) -> dict:
    """Look up the user to block by ``user_id`` OR ``email``.

    Returning ``None`` here would push a NoneType downstream, so we
    raise a helpful 4xx instead. Either identifier is fine — the client
    can pass whichever it has on hand.
    """
    if not user_id and not email:
        raise HTTPException(400, "Provide user_id or email")
    q = {"user_id": user_id} if user_id else {"email": (email or "").lower()}
    target = await db.users.find_one(
        q, {"_id": 0, "user_id": 1, "email": 1, "name": 1}
    )
    if not target:
        raise HTTPException(404, "User not found")
    return target


@router.post("/blocks")
async def create_block(
    body: BlockBody, user: dict = Depends(get_current_user)
):
    target = await _resolve_target(body.user_id, body.email)
    if target["user_id"] == user["user_id"]:
        raise HTTPException(400, "You can't block yourself")

    res = await blocks_svc.block_user(
        blocker_id=user["user_id"],
        blocked_id=target["user_id"],
        blocked_email=target.get("email", ""),
        blocked_name=target.get("name", ""),
    )
    if not res.get("ok"):
        raise HTTPException(400, res.get("reason") or "Block failed")
    return {
        "ok": True,
        "blocked_id": target["user_id"],
        "blocked_email": target.get("email", ""),
        "blocked_name": target.get("name", ""),
    }


@router.get("/blocks")
async def list_blocks(user: dict = Depends(get_current_user)):
    """List everyone I've blocked, most-recent first, hydrated with the
    current display name / picture from the users table.
    """
    rows = await blocks_svc.list_blocks(user["user_id"])
    return {"blocks": rows, "count": len(rows)}


@router.delete("/blocks/{blocked_user_id}")
async def delete_block(
    blocked_user_id: str, user: dict = Depends(get_current_user)
):
    removed = await blocks_svc.unblock_user(user["user_id"], blocked_user_id)
    if not removed:
        # Idempotent — treat "already unblocked" as success so the UI
        # doesn't have to differentiate.
        return {"ok": True, "already": True}
    return {"ok": True, "unblocked_id": blocked_user_id}
