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

    Capped server-side at 500 so a paranoid client can't ask for the
    whole world in one shot, but the default (40) is enough for the
    Discover screen's initial render — clients that want more (like
    the choreographers/index screen, which now passes ``limit=500``
    to surface the full library) get the higher ceiling.
    """
    lim = max(1, min(500, int(limit or 40)))
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

    Matches on the persistent ``choreographer_key`` field (indexed) —
    same value both the follow API and every dance write site use, so
    a name with punctuation (``A.T. Kinson``, ``Adrian Lefebour
    (AUS)``, etc.) never falls through the cracks.
    """
    display = unquote(name or "").strip()
    key = normalise_choreographer(display)
    if not key:
        raise HTTPException(400, "Choreographer name required.")

    cursor = db.dances.find(
        {"is_published": True, "choreographer_key": key},
        {
            "_id": 0, "id": 1, "name": 1, "choreographer": 1,
            "song": 1, "artist": 1, "difficulty": 1, "bpm": 1,
            "count": 1, "created_at": 1,
        },
    ).sort("created_at", -1)
    dances = await cursor.to_list(length=500)

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
    # Fast indexed lookup on the persistent ``choreographer_key`` — no
    # per-request aggregate needed.
    key = normalise_choreographer(display)
    if not key:
        raise HTTPException(400, "Choreographer name required.")
    hit = await db.dances.find_one(
        {"choreographer_key": key}, {"_id": 0, "id": 1}
    )
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
