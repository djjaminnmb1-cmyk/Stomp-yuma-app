"""User tracking: mark dances as completed/wishlist, retrieve own list."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import get_current_user
from core.time_helpers import now_iso
from models.schemas import TrackingIn

router = APIRouter()


@router.get("/tracking/me")
async def my_tracking(user: dict = Depends(get_current_user)):
    docs = await db.tracking.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).to_list(2000)
    return [
        {
            "dance_id": d["dance_id"],
            "status": d.get("status", "wishlist"),
            "rating": d.get("rating", 0),
            "notes": d.get("notes", ""),
            "updated_at": d.get("updated_at", ""),
        }
        for d in docs
    ]


@router.post("/tracking/{dance_id}")
async def upsert_tracking(
    dance_id: str, inp: TrackingIn, user: dict = Depends(get_current_user)
):
    if inp.status not in ("completed", "wishlist"):
        raise HTTPException(400, "Invalid status")
    dance = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not dance:
        raise HTTPException(404, "Dance not found")
    payload = {
        "user_id": user["user_id"],
        "dance_id": dance_id,
        "status": inp.status,
        "rating": max(0, min(5, int(inp.rating or 0))),
        "notes": inp.notes or "",
        "updated_at": now_iso(),
    }
    await db.tracking.update_one(
        {"user_id": user["user_id"], "dance_id": dance_id},
        {"$set": payload},
        upsert=True,
    )
    return {
        "dance_id": dance_id,
        "status": payload["status"],
        "rating": payload["rating"],
        "notes": payload["notes"],
        "updated_at": payload["updated_at"],
    }


@router.delete("/tracking/{dance_id}")
async def delete_tracking(dance_id: str, user: dict = Depends(get_current_user)):
    await db.tracking.delete_one(
        {"user_id": user["user_id"], "dance_id": dance_id}
    )
    return {"ok": True}
