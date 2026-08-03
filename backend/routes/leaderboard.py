"""Boot Scoot Board — user completion leaderboard with privacy opt-in.

Users must explicitly opt-in via PATCH /users/me/leaderboard before their
name and completion count are exposed. The caller themselves is always
included via a ``me`` block so their personal rank + total are visible
privately, even when opted out.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from core.database import db
from core.rate_limit import client_ip, throttle_check
from core.security import get_current_user
from core.serialize import user_to_out
from models.schemas import LeaderboardOptInBody

router = APIRouter()


@router.patch("/users/me/leaderboard")
async def toggle_leaderboard_visibility(
    body: LeaderboardOptInBody, user: dict = Depends(get_current_user)
):
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"show_on_leaderboard": bool(body.show_on_leaderboard)}},
    )
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"ok": True, "user": user_to_out(fresh or user)}


@router.get("/leaderboard")
async def leaderboard(
    request: Request,
    range: str = "all",       # "all" | "week" | "month"
    limit: int = 20,
    authorization: Optional[str] = Header(None),
):
    """Return a ranked list of users by number of completed dances.

    Privacy model — only users who set ``show_on_leaderboard=true`` are shown
    to other users. The caller themselves is always included in the response
    (even if opted out) via a ``me`` block, so their personal rank + total are
    still visible privately.
    """
    if range not in ("all", "week", "month"):
        raise HTTPException(400, "range must be one of all|week|month")
    limit = max(1, min(50, int(limit or 20)))

    # Per-IP throttle. Aggregation is bounded (500-row cap) but there's no
    # sense running Mongo aggregations on demand for a caller hammering the
    # endpoint — 60 requests per minute per IP is well above legitimate use
    # (the client only calls once per screen open).
    ip = client_ip(request)
    allowed, retry = throttle_check(
        f"leaderboard:{ip}", max_hits=60, window_sec=60
    )
    if not allowed:
        raise HTTPException(
            429, f"Too many requests — please wait {int(retry)}s."
        )

    # Optional date cutoff.
    now = datetime.now(timezone.utc)
    since_iso: Optional[str] = None
    if range == "week":
        since_iso = (now - timedelta(days=7)).isoformat()
    elif range == "month":
        since_iso = (now - timedelta(days=30)).isoformat()
    else:
        # All-time is scoped to the current season, if one was started by an
        # admin. Falls back to "since the beginning of time" if no season
        # pointer is set (default behavior).
        season = await db.leaderboard_state.find_one(
            {"key": "season"}, {"_id": 0, "started_at": 1}
        )
        started_at = (season or {}).get("started_at")
        if started_at:
            since_iso = started_at

    match: dict = {"status": "completed"}
    if since_iso:
        match["updated_at"] = {"$gte": since_iso}

    pipeline: list = [
        {"$match": match},
        # Newest completion per (user, dance) — tracking is upsert-keyed by
        # (user_id, dance_id) so this is already effectively one doc per pair.
        {
            "$group": {
                "_id": "$user_id",
                "count": {"$sum": 1},
                "last_completed_at": {"$max": "$updated_at"},
            }
        },
        {"$sort": {"count": -1, "last_completed_at": -1}},
        # Fetch a generous window (before applying the visibility filter) so
        # opted-out users don't shrink the visible board below the requested
        # limit. Cap total scan though to avoid runaway aggregations.
        {"$limit": 500},
    ]

    rows = await db.tracking.aggregate(pipeline).to_list(500)

    # Resolve current caller (if any) so we can highlight "You" and their
    # personal rank even when they haven't opted in.
    viewer_id: Optional[str] = None
    if authorization:
        try:
            viewer = await get_current_user(authorization)
            viewer_id = viewer["user_id"]
        except HTTPException:
            viewer_id = None

    # Fetch relevant user profile fields in one query.
    user_ids = [r["_id"] for r in rows if r.get("_id")]
    users_docs = await db.users.find(
        {"user_id": {"$in": user_ids}},
        {
            "_id": 0,
            "user_id": 1,
            "name": 1,
            "picture": 1,
            "show_on_leaderboard": 1,
            "leaderboard_hidden_by_admin": 1,
            "is_instructor": 1,
            "is_admin": 1,
        },
    ).to_list(len(user_ids) or 1)
    users_by_id = {u["user_id"]: u for u in users_docs}

    # Build the ranked visible list (opted-in only). We compute the *absolute*
    # rank across everyone first, then strip out opted-out rows, keeping the
    # original rank so numbering stays intuitive (rank 4 can be missing if the
    # 4th-most-active dancer opted out — this is a fair trade-off).
    ranked: list = []
    for idx, r in enumerate(rows, start=1):
        uid = r["_id"]
        u = users_by_id.get(uid)
        if not u:
            continue  # user was deleted; skip silently
        ranked.append(
            {
                "rank": idx,
                "user_id": uid,
                "name": u.get("name", "Dancer"),
                "picture": u.get("picture", "") or "",
                "count": int(r["count"]),
                "last_completed_at": r.get("last_completed_at", ""),
                "is_instructor": bool(u.get("is_instructor") or u.get("is_admin")),
                "opted_in": bool(u.get("show_on_leaderboard")),
                # Admin override — never shows on the public board even if
                # the user opted in. The user themselves still sees their
                # rank in the private ``me`` block.
                "hidden_by_admin": bool(u.get("leaderboard_hidden_by_admin")),
            }
        )

    visible = [row for row in ranked if row["opted_in"] and not row["hidden_by_admin"]][:limit]

    # Compute caller's personal block so they can see their rank even if
    # opted out (private to the caller). Rank is absolute among all completers.
    # We also drop `user_id` from public entries (SEC hardening) and instead
    # tag entries with a boolean `is_you` so the client can highlight the
    # caller without receiving other users' internal ids.
    me_block = None
    if viewer_id:
        for row in ranked:
            if row["user_id"] == viewer_id:
                me_block = {
                    "rank": row["rank"],
                    "count": row["count"],
                    "opted_in": row["opted_in"],
                    "in_top": any(v["user_id"] == viewer_id for v in visible),
                }
                break
        if me_block is None:
            # Caller has zero completions in this window.
            me_block = {"rank": None, "count": 0, "opted_in": False, "in_top": False}
            v = await db.users.find_one(
                {"user_id": viewer_id}, {"_id": 0, "show_on_leaderboard": 1}
            )
            if v:
                me_block["opted_in"] = bool(v.get("show_on_leaderboard"))

    public_entries = [
        {
            "rank": e["rank"],
            "name": e["name"],
            "picture": e["picture"],
            "count": e["count"],
            "last_completed_at": e["last_completed_at"],
            "is_instructor": e["is_instructor"],
            "is_you": bool(viewer_id) and e["user_id"] == viewer_id,
        }
        for e in visible
    ]

    return {
        "range": range,
        "limit": limit,
        "total_visible": len(visible),
        "total_dancers": len(ranked),
        "entries": public_entries,
        "me": me_block,
    }
