"""Follow-a-choreographer endpoints.

Contract summary
----------------
* ``GET /api/choreographers?q=...``      → discover choreographers
                                            (with follow flag + counts)
* ``GET /api/choreographers/me/follows`` → my followed choreographers
* ``POST /api/choreographers/{name}/follow``    → follow (idempotent)
* ``DELETE /api/choreographers/{name}/follow``  → unfollow (idempotent)
* ``GET /api/choreographers/{name}``     → detail + dances by that
                                            choreographer

The follow rows are keyed by NAME (there's no separate "choreographer
account"), so the URL path takes the raw display name — the server
normalises it before hitting the collection.  See
``services/choreographer_follows.py`` for the key rules.
"""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Query

from core.database import db
from core.security import get_current_user
from services.choreographer_follows import (
    follow,
    follow_counts,
    is_following,
    list_choreographers,
    my_follows,
    normalise_choreographer,
    unfollow,
)

router = APIRouter()


# ---------------- Discovery ----------------
@router.get("/choreographers")
async def get_choreographers(
    q: Optional[str] = Query(default=""),
    limit: Optional[int] = Query(default=40),
    user: dict = Depends(get_current_user),
):
    """List the top-N choreographers in the library, hydrated with the
    caller's follow state. Optional ``q`` substring-filters by name.
    """
    lim = max(1, min(200, int(limit or 40)))
    rows = await list_choreographers(q or "", user["user_id"], lim)
    return {"choreographers": rows, "count": len(rows)}


# ---------------- My follows ----------------
@router.get("/choreographers/me/follows")
async def get_my_choreographer_follows(
    user: dict = Depends(get_current_user),
):
    rows = await my_follows(user["user_id"])
    counts = await follow_counts(user["user_id"])
    return {"choreographers": rows, "counts": counts}


# ---------------- Detail ----------------
@router.get("/choreographers/{name:path}")
async def get_choreographer_detail(
    name: str, user: dict = Depends(get_current_user)
):
    """Detail card for a single choreographer: canonical display name,
    follower count in *this app*, my follow state, and every PUBLISHED
    dance we have by that person (newest first).

    Uses ``{name:path}`` so slashes / dots aren't rejected — a few
    choreographers include suffixes like "Jr." or use "aka" separators.
    """
    display = unquote(name or "").strip()
    key = normalise_choreographer(display)
    if not key:
        raise HTTPException(400, "Choreographer name required.")

    # Aggregate to fetch dances + count in a single round-trip
    pipeline = [
        {"$match": {"is_published": True, "choreographer": {"$ne": ""}}},
        {"$addFields": {
            "_key": {"$toLower": {"$trim": {"input": "$choreographer"}}},
        }},
        {"$match": {"_key": key}},
        {"$sort": {"created_at": -1}},
        {"$project": {
            "_id": 0,
            "id": 1,
            "name": 1,
            "choreographer": 1,
            "song": 1,
            "artist": 1,
            "difficulty": 1,
            "bpm": 1,
            "count": 1,
            "created_at": 1,
        }},
    ]
    dances = [d async for d in db.dances.aggregate(pipeline)]

    canonical_name = dances[0]["choreographer"] if dances else display
    followers = await db.choreographer_follows.count_documents(
        {"choreographer_key": key}
    )
    return {
        "choreographer": canonical_name,
        "choreographer_key": key,
        "dance_count": len(dances),
        "follower_count": int(followers),
        "is_following": await is_following(user["user_id"], display),
        "dances": dances,
    }


# ---------------- Follow / Unfollow ----------------
@router.post("/choreographers/{name:path}/follow")
async def post_follow_choreographer(
    name: str, user: dict = Depends(get_current_user)
):
    display = unquote(name or "").strip()
    if not display:
        raise HTTPException(400, "Choreographer name required.")

    # Reject if there's no dance in the library at all — prevents
    # someone from creating orphan follow rows for arbitrary strings.
    key = normalise_choreographer(display)
    exists_pipeline = [
        {"$match": {"choreographer": {"$ne": ""}}},
        {"$addFields": {
            "_key": {"$toLower": {"$trim": {"input": "$choreographer"}}},
        }},
        {"$match": {"_key": key}},
        {"$limit": 1},
        {"$project": {"_id": 0, "id": 1}},
    ]
    hit = [d async for d in db.dances.aggregate(exists_pipeline)]
    if not hit:
        raise HTTPException(
            404, "That choreographer doesn't have any dances in the library."
        )

    created, _ = await follow(user["user_id"], display)
    follower_count = await db.choreographer_follows.count_documents(
        {"choreographer_key": key}
    )
    return {
        "ok": True,
        "created": created,
        "is_following": True,
        "follower_count": int(follower_count),
    }


@router.delete("/choreographers/{name:path}/follow")
async def delete_follow_choreographer(
    name: str, user: dict = Depends(get_current_user)
):
    display = unquote(name or "").strip()
    if not display:
        raise HTTPException(400, "Choreographer name required.")
    removed, key = await unfollow(user["user_id"], display)
    follower_count = await db.choreographer_follows.count_documents(
        {"choreographer_key": key}
    )
    return {
        "ok": True,
        "removed": removed,
        "is_following": False,
        "follower_count": int(follower_count),
    }
