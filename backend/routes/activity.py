"""User activity endpoints.

Powers the "Recently Practiced" card on the Home tab. Combines two signals
per user:

- ``practice_sessions`` — bumped every time the user actively opens Practice
  Mode on a dance (metronome / song preview started).
- ``tracking`` — the user's completed / wishlist rows already have
  ``updated_at``.

We union the two by (user_id, dance_id), keep the most recent timestamp per
dance, and return the last ~10 with light dance metadata so the client can
render a horizontal card row without an extra fetch.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import get_current_user
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/practice-log/{dance_id}")
async def log_practice(dance_id: str, user: dict = Depends(get_current_user)):
    """Record that the caller just opened Practice Mode for ``dance_id``.

    Upsert-keyed by (user_id, dance_id) so we track the *last* open per
    dance plus a running counter, not one row per session (keeps the
    collection tiny).
    """
    # Confirm the dance exists so a bad client can't spam garbage IDs.
    dance = await db.dances.find_one({"id": dance_id}, {"_id": 0, "id": 1})
    if not dance:
        raise HTTPException(404, "Dance not found")

    now = now_iso()
    await db.practice_sessions.update_one(
        {"user_id": user["user_id"], "dance_id": dance_id},
        {
            "$set": {
                "user_id": user["user_id"],
                "dance_id": dance_id,
                "last_opened_at": now,
            },
            "$inc": {"count": 1},
        },
        upsert=True,
    )
    return {"ok": True, "last_opened_at": now}


@router.get("/recently-practiced")
async def recently_practiced(
    limit: int = 10, user: dict = Depends(get_current_user)
):
    """Return the caller's most recent practice / completion activity.

    Each row has:
      - ``dance`` — light metadata (id, name, choreographer, difficulty, bpm)
      - ``last_activity_at`` — max(last_opened_at, tracking.updated_at)
      - ``status`` — tracking status if any (completed / wishlist / none)
      - ``practice_count`` — number of Practice Mode opens
    """
    limit = max(1, min(50, int(limit or 10)))
    uid = user["user_id"]

    # Fetch both signals in parallel-ish (Motor cursors).
    sessions = await db.practice_sessions.find(
        {"user_id": uid}, {"_id": 0}
    ).sort("last_opened_at", -1).to_list(200)
    tracking_rows = await db.tracking.find(
        {"user_id": uid}, {"_id": 0}
    ).sort("updated_at", -1).to_list(500)

    # Merge on dance_id, taking the max timestamp between the two signals.
    merged: dict[str, dict] = {}
    for s in sessions:
        did = s["dance_id"]
        merged[did] = {
            "dance_id": did,
            "last_activity_at": s.get("last_opened_at", ""),
            "practice_count": int(s.get("count") or 0),
            "status": "",
        }
    for t in tracking_rows:
        did = t["dance_id"]
        row = merged.setdefault(
            did,
            {
                "dance_id": did,
                "last_activity_at": "",
                "practice_count": 0,
                "status": "",
            },
        )
        tr_ts = t.get("updated_at", "")
        # Compare as ISO-8601 strings — lexicographic order matches time order.
        if tr_ts and tr_ts > row["last_activity_at"]:
            row["last_activity_at"] = tr_ts
        row["status"] = t.get("status", "") or row["status"]

    # Sort by last activity DESC and take top N.
    ordered = sorted(
        merged.values(),
        key=lambda r: r["last_activity_at"] or "",
        reverse=True,
    )[:limit]

    if not ordered:
        return {"items": []}

    # Fetch dance metadata in one query. Drop draft dances so a private
    # instructor draft isn't exposed on the caller's home feed if it was
    # ever unpublished after they practiced it.
    dance_ids = [r["dance_id"] for r in ordered]
    dance_docs = await db.dances.find(
        {"id": {"$in": dance_ids}, "is_published": True},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "choreographer": 1,
            "difficulty": 1,
            "bpm": 1,
        },
    ).to_list(len(dance_ids) or 1)
    dance_by_id = {d["id"]: d for d in dance_docs}

    items = []
    for r in ordered:
        d = dance_by_id.get(r["dance_id"])
        if not d:  # dance was deleted or unpublished
            continue
        items.append(
            {
                "dance": d,
                "last_activity_at": r["last_activity_at"],
                "status": r["status"],
                "practice_count": r["practice_count"],
            }
        )

    return {"items": items}
