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
from core.diagnostics import client_diagnostics
from core.security import get_current_user
from core.time_helpers import now_iso
from services.social import (
    REACTION_EMOJI,
    REACTION_KINDS,
    LEGACY_REACTION_KINDS,
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
    list_reactors,
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
    """Toggle-remove a reaction. Idempotent. Accepts legacy kinds too so
    users can still retire an old ``clap`` chip after the pack refresh."""
    if kind not in REACTION_KINDS and kind not in LEGACY_REACTION_KINDS:
        raise HTTPException(400, "Unknown reaction kind.")
    removed = await remove_reaction(user["user_id"], event_id, kind)
    bulk = await get_reactions_bulk([event_id], viewer_id=user["user_id"])
    return {
        "ok": True,
        "removed": removed,
        "reactions": bulk.get(event_id, {"counts": {}, "mine": []}),
    }


@router.get("/feed/{event_id}/reactors")
async def get_feed_reactors(
    event_id: str,
    kind: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    """Return the users who reacted to a feed event (optionally filtered
    to a single ``kind``). Powers the long-press "who reacted?" sheet.
    """
    if kind is not None:
        if kind not in REACTION_KINDS and kind not in LEGACY_REACTION_KINDS:
            raise HTTPException(400, "Unknown reaction kind.")
    reactors = await list_reactors(
        event_id, kind=kind, limit=limit, viewer_id=user["user_id"]
    )
    return {
        "event_id": event_id,
        "kind": kind,
        "reactors": reactors,
        "count": len(reactors),
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
    diag: dict = Depends(client_diagnostics),
):
    """Flag a feed event for moderation review.

    * One report per (reporter, event) — re-submitting updates the
      reason/note. Prevents runaway rows from misclicks.
    * Users cannot report their own posts (400).
    * Captures client diagnostics (OTA update id, channel, app
      version) so an admin can identify the bundle the reporter was
      on when they hit the flag.
    """
    if body.reason not in REPORT_REASONS:
        raise HTTPException(400, "Unknown reason.")
    result = await report_event(
        reporter_id=user["user_id"],
        event_id=event_id,
        reason=body.reason,
        note=body.note or "",
        diagnostics=diag,
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
    if status and status != "all":
        filt["status"] = status
    rows = await db.feed_reports.find(
        filt, {"_id": 0}
    ).sort("created_at", -1).limit(lim).to_list(lim)
    if not rows:
        return {"reports": []}
    user_ids: set[str] = set()
    event_ids: set[str] = set()
    for r in rows:
        if r.get("reporter_id"):
            user_ids.add(r["reporter_id"])
        if r.get("reported_user_id"):
            user_ids.add(r["reported_user_id"])
        if r.get("event_id"):
            event_ids.add(r["event_id"])
    names: dict[str, str] = {}
    if user_ids:
        async for u in db.users.find(
            {"user_id": {"$in": list(user_ids)}},
            {"_id": 0, "user_id": 1, "name": 1},
        ):
            names[u["user_id"]] = u.get("name", "") or ""
    # Hydrate each report with a small snippet of the target activity
    # event so admins can decide without opening the app.
    events_by_id: dict[str, dict] = {}
    if event_ids:
        async for e in db.activity_events.find(
            {"event_id": {"$in": list(event_ids)}},
            {"_id": 0},
        ):
            events_by_id[e["event_id"]] = e
    for r in rows:
        r["reporter_name"] = names.get(r.get("reporter_id", ""), "")
        r["reported_user_name"] = names.get(r.get("reported_user_id", ""), "")
        r["report_id"] = (
            f"{r.get('reporter_id', '')}:{r.get('event_id', '')}"
        )
        ev = events_by_id.get(r.get("event_id", ""))
        r["event_exists"] = ev is not None
        if ev:
            r["event_snippet"] = _event_snippet(ev)
    return {"reports": rows}


def _event_snippet(ev: dict) -> str:
    """One-line human summary of a flagged activity_event so the
    moderation card can read at a glance."""
    t = ev.get("type", "")
    ref = ev.get("ref", "")
    if t == "completion":
        return f"Completed a dance ({ref[:6]}…)" if ref else "Completed a dance"
    if t == "badge":
        return f"Earned a badge ({ref})" if ref else "Earned a badge"
    if t == "streak_milestone":
        days = (ev.get("extra") or {}).get("days") or ""
        return f"Hit a {days}-day streak" if days else "Streak milestone"
    return t or "activity"


class UpdateFeedReportBody(BaseModel):
    status: str  # "open" | "resolved" | "actioned" | "dismissed"
    resolution_note: str = ""


REPORT_STATUSES = {"open", "resolved", "actioned", "dismissed"}


@router.patch("/admin/feed/reports/{report_id}")
async def update_feed_report(
    report_id: str,
    body: UpdateFeedReportBody,
    user: dict = Depends(get_current_user),
):
    """Set the status of a report (admin-only).

    ``report_id`` here is the unique tuple key stored as
    ``{reporter_id, event_id}`` joined with a colon, since the collection
    has a composite unique index rather than a synthetic id. This keeps
    the URL stable across restarts.
    """
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin only.")
    if body.status not in REPORT_STATUSES:
        raise HTTPException(400, "Unknown status.")
    try:
        reporter_id, event_id = report_id.split(":", 1)
    except ValueError:
        raise HTTPException(400, "Malformed report id.")
    res = await db.feed_reports.update_one(
        {"reporter_id": reporter_id, "event_id": event_id},
        {
            "$set": {
                "status": body.status,
                "resolution_note": (body.resolution_note or "").strip()[:600],
                "resolved_by": user["user_id"],
                "resolved_at": now_iso(),
            }
        },
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Report not found.")
    return {"ok": True}


@router.delete("/admin/feed/events/{event_id}")
async def admin_delete_feed_event(
    event_id: str, user: dict = Depends(get_current_user)
):
    """Moderator delete of a flagged activity_event.

    Removes the underlying event AND its reactions so the post
    disappears from every dancer's feed. Any pending reports about it
    stay in the queue with ``event_exists=false`` so the audit trail
    survives — admins can then flip them to ``actioned`` from the UI.
    """
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin only.")
    del_res = await db.activity_events.delete_one({"event_id": event_id})
    await db.feed_reactions.delete_many({"event_id": event_id})
    if del_res.deleted_count == 0:
        raise HTTPException(404, "Post already gone.")
    return {"ok": True}
