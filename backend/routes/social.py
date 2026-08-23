"""Social endpoints: follow-graph, user search / profile, activity feed.

Contract summary
----------------
* ``GET /api/follows/me``            → my following / followers lists
* ``POST /api/follows/{user_id}``    → follow that user (idempotent)
* ``DELETE /api/follows/{user_id}``  → unfollow (idempotent)
* ``GET /api/users/search?q=...``    → find dancers (name substring)
* ``GET /api/users/{user_id}``       → public profile + follow state
* ``GET /api/feed?limit=N``          → activity feed from followed users
* ``PATCH /api/auth/me/activity-opt-in``
                                    → toggle ``show_in_activity_feed``

The feed itself is derived from the ``activity_events`` collection —
see ``services/social.py`` for the write-side helpers that are called
inline from tracking / badge / streak flows.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import db
from core.security import get_current_user
from services.social import (
    REACTION_EMOJI,
    REACTION_KINDS,
    REACTION_LABEL,
    REPORT_LABEL,
    REPORT_REASONS,
    add_reaction,
    follow,
    follow_counts,
    following_ids,
    follower_ids,
    get_feed,
    get_public_user,
    get_reactions_bulk,
    is_following,
    remove_reaction,
    report_event,
    search_users,
    unfollow,
)

router = APIRouter()


# ---------------- Follow graph ----------------
@router.get("/follows/me")
async def my_follow_lists(user: dict = Depends(get_current_user)):
    """Return light rows for my following + followers lists.

    Response shape:
        {
          "following": [{user_id, name, picture, current_streak, is_instructor}],
          "followers": [{ ... same shape ... , is_following (from viewer's POV)}],
          "counts": {following, followers}
        }
    """
    me = user["user_id"]
    fing = await following_ids(me)
    fers = await follower_ids(me)

    all_ids = list(set(fing) | set(fers))
    users_by_id: dict[str, dict] = {}
    if all_ids:
        async for u in db.users.find(
            {"user_id": {"$in": all_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "picture": 1,
             "current_streak": 1, "is_admin": 1, "is_instructor": 1},
        ):
            users_by_id[u["user_id"]] = {
                "user_id": u["user_id"],
                "name": u.get("name", ""),
                "picture": u.get("picture", ""),
                "current_streak": int(u.get("current_streak") or 0),
                "is_instructor": bool(u.get("is_admin"))
                or bool(u.get("is_instructor")),
            }

    following_set = set(fing)
    following_rows = [users_by_id[uid] for uid in fing if uid in users_by_id]
    # Follower rows also carry "is_following" so the client can render a
    # Follow-Back button inline.
    follower_rows = []
    for uid in fers:
        row = users_by_id.get(uid)
        if not row:
            continue
        follower_rows.append({**row, "is_following": uid in following_set})

    return {
        "following": following_rows,
        "followers": follower_rows,
        "counts": {"following": len(fing), "followers": len(fers)},
    }


@router.post("/follows/{other_user_id}")
async def post_follow(
    other_user_id: str, user: dict = Depends(get_current_user)
):
    if other_user_id == user["user_id"]:
        raise HTTPException(400, "You cannot follow yourself.")
    exists = await db.users.find_one({"user_id": other_user_id}, {"_id": 1})
    if not exists:
        raise HTTPException(404, "User not found.")
    created = await follow(user["user_id"], other_user_id)
    counts = await follow_counts(other_user_id)
    return {
        "ok": True,
        "created": created,
        "is_following": True,
        "target_followers": counts["followers"],
    }


@router.delete("/follows/{other_user_id}")
async def delete_follow(
    other_user_id: str, user: dict = Depends(get_current_user)
):
    if other_user_id == user["user_id"]:
        raise HTTPException(400, "You cannot unfollow yourself.")
    removed = await unfollow(user["user_id"], other_user_id)
    counts = await follow_counts(other_user_id)
    return {
        "ok": True,
        "removed": removed,
        "is_following": False,
        "target_followers": counts["followers"],
    }


# ---------------- User search & public profile ----------------
@router.get("/users/search")
async def get_users_search(
    q: Optional[str] = Query(default=""),
    limit: Optional[int] = Query(default=20),
    user: dict = Depends(get_current_user),
):
    """Case-insensitive substring search on user.name for the "Find Dancers"
    picker. Empty ``q`` returns the top-N recently-seen users so the sheet
    isn't empty on first open."""
    lim = max(1, min(50, int(limit or 20)))
    rows = await search_users(q or "", user["user_id"], lim)
    return {"users": rows}


@router.get("/users/{other_user_id}")
async def get_public_profile(
    other_user_id: str, user: dict = Depends(get_current_user)
):
    """Public profile of another dancer — used by ``/app/users/[id].tsx``."""
    prof = await get_public_user(other_user_id, viewer_id=user["user_id"])
    if not prof:
        raise HTTPException(404, "User not found.")
    return prof


# ---------------- Activity feed ----------------
@router.get("/feed")
async def get_activity_feed(
    limit: Optional[int] = Query(default=30),
    include_self: Optional[bool] = Query(default=True),
    user: dict = Depends(get_current_user),
):
    """Return the caller's activity feed — hydrated events from users they
    follow (and themselves by default), most recent first.
    """
    lim = max(1, min(100, int(limit or 30)))
    events = await get_feed(
        user["user_id"], limit=lim, include_self=bool(include_self)
    )
    return {"events": events, "count": len(events)}


# ---------------- Activity opt-in toggle ----------------
class ActivityOptInBody(BaseModel):
    show_in_activity_feed: bool


@router.patch("/auth/me/activity-opt-in")
async def set_activity_opt_in(
    body: ActivityOptInBody, user: dict = Depends(get_current_user)
):
    """Flip ``show_in_activity_feed`` on the caller's user doc. Separate
    from ``show_on_leaderboard`` so users can appear on the leaderboard
    while hiding their real-time activity, and vice versa.
    """
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"show_in_activity_feed": bool(body.show_in_activity_feed)}},
    )
    return {
        "ok": True,
        "show_in_activity_feed": bool(body.show_in_activity_feed),
    }


# ---------------- Feed reactions ----------------
@router.get("/feed/reaction-kinds")
async def list_reaction_kinds(user: dict = Depends(get_current_user)):
    """Public catalog of reaction kinds for the client picker.

    Kept as a server-side source of truth so we can add / retire kinds
    without shipping a new client build.
    """
    return {
        "kinds": [
            {
                "kind": k,
                "emoji": REACTION_EMOJI[k],
                "label": REACTION_LABEL[k],
            }
            for k in REACTION_KINDS
        ]
    }


@router.post("/feed/{event_id}/reactions/{kind}")
async def post_feed_reaction(
    event_id: str,
    kind: str,
    user: dict = Depends(get_current_user),
):
    """Toggle-add a reaction. Idempotent — reposting the same kind is a
    no-op and always returns the current counts + the caller's own set.
    """
    if kind not in REACTION_KINDS:
        raise HTTPException(400, "Unknown reaction kind.")
    created = await add_reaction(user["user_id"], event_id, kind)
    bulk = await get_reactions_bulk([event_id], viewer_id=user["user_id"])
    return {
        "ok": True,
        "created": created,
        "reactions": bulk.get(event_id, {"counts": {}, "mine": []}),
    }


@router.delete("/feed/{event_id}/reactions/{kind}")
async def delete_feed_reaction(
    event_id: str,
    kind: str,
    user: dict = Depends(get_current_user),
):
    """Toggle-remove a reaction. Idempotent."""
    if kind not in REACTION_KINDS:
        raise HTTPException(400, "Unknown reaction kind.")
    removed = await remove_reaction(user["user_id"], event_id, kind)
    bulk = await get_reactions_bulk([event_id], viewer_id=user["user_id"])
    return {
        "ok": True,
        "removed": removed,
        "reactions": bulk.get(event_id, {"counts": {}, "mine": []}),
    }


# ---------------- Feed reports (moderation) ----------------
class FeedReportBody(BaseModel):
    reason: str
    note: str = ""


@router.get("/feed/report-reasons")
async def list_report_reasons(user: dict = Depends(get_current_user)):
    """Public list of reason slugs the client can use in the picker."""
    return {
        "reasons": [
            {"reason": r, "label": REPORT_LABEL[r]} for r in REPORT_REASONS
        ]
    }


@router.post("/feed/{event_id}/report")
async def post_feed_report(
    event_id: str,
    body: FeedReportBody,
    user: dict = Depends(get_current_user),
):
    """Flag a feed event for moderation review.

    * One report per (reporter, event) — re-submitting updates the
      reason/note. Prevents runaway rows from misclicks.
    * Users cannot report their own posts (400).
    """
    if body.reason not in REPORT_REASONS:
        raise HTTPException(400, "Unknown reason.")
    result = await report_event(
        reporter_id=user["user_id"],
        event_id=event_id,
        reason=body.reason,
        note=body.note or "",
    )
    if not result.get("ok"):
        if result.get("error") == "event_not_found":
            raise HTTPException(404, "That post no longer exists.")
        if result.get("error") == "self_report":
            raise HTTPException(400, "You can't report your own post.")
        raise HTTPException(400, "Couldn't submit report.")
    return {"ok": True, "created": bool(result.get("created"))}


@router.get("/admin/feed/reports")
async def list_feed_reports(
    limit: Optional[int] = Query(default=50),
    status: Optional[str] = Query(default="open"),
    user: dict = Depends(get_current_user),
):
    """Admin-only moderation queue.

    Returns the newest reports first, hydrated with the reporter's name
    and the target event's owner name so admins have context without
    another round-trip.
    """
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin only.")
    lim = max(1, min(200, int(limit or 50)))
    filt: dict = {}
    if status:
        filt["status"] = status
    rows = await db.feed_reports.find(
        filt, {"_id": 0}
    ).sort("created_at", -1).limit(lim).to_list(lim)
    if not rows:
        return {"reports": []}
    user_ids: set[str] = set()
    for r in rows:
        if r.get("reporter_id"):
            user_ids.add(r["reporter_id"])
        if r.get("reported_user_id"):
            user_ids.add(r["reported_user_id"])
    names: dict[str, str] = {}
    if user_ids:
        async for u in db.users.find(
            {"user_id": {"$in": list(user_ids)}},
            {"_id": 0, "user_id": 1, "name": 1},
        ):
            names[u["user_id"]] = u.get("name", "") or ""
    for r in rows:
        r["reporter_name"] = names.get(r.get("reporter_id", ""), "")
        r["reported_user_name"] = names.get(r.get("reported_user_id", ""), "")
    return {"reports": rows}
