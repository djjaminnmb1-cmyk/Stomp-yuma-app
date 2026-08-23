"""Social graph + activity-feed persistence and helpers.

Two thin collections back the entire social feature:

* ``follows``
    ``{follower_id, followee_id, created_at}``
    Unique on ``(follower_id, followee_id)`` so re-follows are no-ops.

* ``activity_events``
    ``{event_id, user_id, type, ref, extra, created_at}``
    * ``type``   ∈ ``completion`` | ``badge`` | ``streak_milestone``
    * ``ref``    the id of the associated dance / badge (empty for streak)
    * ``extra``  free-form JSON kept small (e.g. ``{streak: 7}``)

    We derive the feed by finding all events authored by users the caller
    follows, ordered by ``created_at`` desc. Events older than
    ``FEED_WINDOW_DAYS`` are hidden from the feed so it always feels
    "fresh" — the underlying rows stay in the collection for the
    dancer's own profile timeline.

The write-side helpers (``record_completion_event`` etc.) are called
inline from ``routes/tracking.py``, ``services/badges.py``, so no batch
job is needed to keep the feed live.
"""
from __future__ import annotations

import uuid
from typing import Iterable, Optional

from core.database import db
from core.time_helpers import now_iso

# Feed window — events older than this stop appearing in the live feed.
FEED_WINDOW_DAYS = 30

# Streak values that fire a milestone event. Chosen to reward growth
# without spamming — 7 & 30 already have badges; 14, 60, 100 are quiet
# in-between motivators.
STREAK_MILESTONES = {3, 7, 14, 30, 60, 100, 365}

# ---------------- Reactions ----------------
# Which reaction kinds are valid. Kept intentionally small so the picker
# stays a single-row bottom sheet. Emoji is cosmetic — the backend only
# stores the ``kind`` slug.
REACTION_KINDS: tuple[str, ...] = ("high_five", "clap", "yeehaw", "heart")
REACTION_EMOJI: dict[str, str] = {
    "high_five": "🙌",
    "clap": "👏",
    "yeehaw": "🤠",
    "heart": "❤️",
}
REACTION_LABEL: dict[str, str] = {
    "high_five": "High five",
    "clap": "Applause",
    "yeehaw": "Yeehaw",
    "heart": "Love it",
}

# ---------------- Feed reports ----------------
# Reasons the client may pick when flagging a feed item. Kept
# intentionally short so the sheet fits without scrolling.
REPORT_REASONS: tuple[str, ...] = (
    "harassment",
    "hate_speech",
    "spam",
    "impersonation",
    "sexual_content",
    "other",
)
REPORT_LABEL: dict[str, str] = {
    "harassment": "Harassment / bullying",
    "hate_speech": "Hate speech or slurs",
    "spam": "Spam or scam",
    "impersonation": "Impersonation",
    "sexual_content": "Sexual or explicit content",
    "other": "Something else",
}


async def report_event(
    reporter_id: str,
    event_id: str,
    reason: str,
    note: str = "",
) -> dict:
    """Persist a moderation report against a feed event.

    * Enforces one report per (reporter, event) — a second report from the
      same user just updates the reason/note instead of stacking.
    * Returns ``{"ok": True, "created": bool}``.
    * Silently no-ops on invalid ``reason`` — caller is expected to
      validate first, but we double-check here so a rogue client can't
      pollute the collection.
    """
    if reason not in REPORT_REASONS:
        return {"ok": False, "error": "invalid_reason"}
    ev = await db.activity_events.find_one(
        {"event_id": event_id}, {"_id": 0, "event_id": 1, "user_id": 1}
    )
    if not ev:
        return {"ok": False, "error": "event_not_found"}
    if ev.get("user_id") == reporter_id:
        return {"ok": False, "error": "self_report"}
    trimmed_note = (note or "").strip()[:600]
    now = now_iso()
    result = await db.feed_reports.update_one(
        {"reporter_id": reporter_id, "event_id": event_id},
        {
            "$set": {
                "reporter_id": reporter_id,
                "event_id": event_id,
                "reason": reason,
                "note": trimmed_note,
                "reported_user_id": ev.get("user_id", ""),
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now, "status": "open"},
        },
        upsert=True,
    )
    return {"ok": True, "created": result.upserted_id is not None}


async def add_reaction(user_id: str, event_id: str, kind: str) -> bool:
    """Idempotent: insert a reaction row. Returns True when a new row was
    written. Silently no-ops on duplicate-key or invalid ``kind``.
    """
    if kind not in REACTION_KINDS:
        return False
    exists = await db.activity_events.find_one(
        {"event_id": event_id}, {"_id": 1}
    )
    if not exists:
        return False
    try:
        res = await db.feed_reactions.update_one(
            {"user_id": user_id, "event_id": event_id, "kind": kind},
            {
                "$setOnInsert": {
                    "user_id": user_id,
                    "event_id": event_id,
                    "kind": kind,
                    "created_at": now_iso(),
                }
            },
            upsert=True,
        )
        # A new row was written only if MongoDB actually performed the
        # upsert (upserted_id is set) or inserted (matched_count == 0).
        return bool(getattr(res, "upserted_id", None))
    except Exception:
        return False


async def remove_reaction(user_id: str, event_id: str, kind: str) -> bool:
    """Delete a specific reaction. Returns True when a row was removed."""
    if kind not in REACTION_KINDS:
        return False
    res = await db.feed_reactions.delete_one(
        {"user_id": user_id, "event_id": event_id, "kind": kind}
    )
    return int(res.deleted_count or 0) > 0


async def get_reactions_bulk(
    event_ids: list[str], viewer_id: Optional[str] = None
) -> dict[str, dict]:
    """For a list of event ids, return
    ``{event_id: {"counts": {kind: n}, "mine": [kind, ...]}}``.

    A single aggregate pass over ``feed_reactions`` — cheap on the small
    per-user counts we expect.
    """
    if not event_ids:
        return {}
    out: dict[str, dict] = {
        eid: {"counts": {}, "mine": []} for eid in event_ids
    }
    # Aggregate counts per (event_id, kind)
    pipeline = [
        {"$match": {"event_id": {"$in": event_ids}}},
        {
            "$group": {
                "_id": {"event_id": "$event_id", "kind": "$kind"},
                "n": {"$sum": 1},
            }
        },
    ]
    async for row in db.feed_reactions.aggregate(pipeline):
        eid = row["_id"]["event_id"]
        kind = row["_id"]["kind"]
        out.setdefault(eid, {"counts": {}, "mine": []})
        out[eid]["counts"][kind] = int(row.get("n") or 0)
    # Fetch the viewer's own reactions in a single find
    if viewer_id:
        async for r in db.feed_reactions.find(
            {"event_id": {"$in": event_ids}, "user_id": viewer_id},
            {"_id": 0, "event_id": 1, "kind": 1},
        ):
            eid = r["event_id"]
            out.setdefault(eid, {"counts": {}, "mine": []})
            out[eid]["mine"].append(r["kind"])
    return out


# ---------------- Follow-graph helpers ----------------
async def is_following(follower_id: str, followee_id: str) -> bool:
    if follower_id == followee_id:
        return False
    doc = await db.follows.find_one(
        {"follower_id": follower_id, "followee_id": followee_id},
        {"_id": 1},
    )
    return doc is not None


async def follow(follower_id: str, followee_id: str) -> bool:
    """Insert a follow row. No-op if the row already exists. Returns True
    when a new row was created."""
    if follower_id == followee_id:
        # Can't follow yourself — silently ignored so the client doesn't
        # need to guard the button.
        return False
    now = now_iso()
    try:
        await db.follows.insert_one({
            "follower_id": follower_id,
            "followee_id": followee_id,
            "created_at": now,
        })
        return True
    except Exception:
        # Duplicate-key race — someone (or the same client) already
        # inserted this pair.
        return False


async def unfollow(follower_id: str, followee_id: str) -> bool:
    res = await db.follows.delete_one(
        {"follower_id": follower_id, "followee_id": followee_id}
    )
    return int(res.deleted_count or 0) > 0


async def following_ids(user_id: str) -> list[str]:
    return await db.follows.distinct("followee_id", {"follower_id": user_id})


async def follower_ids(user_id: str) -> list[str]:
    return await db.follows.distinct("follower_id", {"followee_id": user_id})


async def follow_counts(user_id: str) -> dict:
    """Return ``{following: N, followers: M}`` for a user."""
    return {
        "following": await db.follows.count_documents({"follower_id": user_id}),
        "followers": await db.follows.count_documents({"followee_id": user_id}),
    }


# ---------------- Event authoring helpers ----------------
async def _insert_event(
    user_id: str,
    event_type: str,
    ref: str = "",
    extra: Optional[dict] = None,
) -> None:
    """Persist a feed-worthy event. Best-effort — swallows errors so a
    failed insert never blocks the underlying user-facing action."""
    try:
        await db.activity_events.insert_one({
            "event_id": f"evt_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "type": event_type,
            "ref": ref or "",
            "extra": extra or {},
            "created_at": now_iso(),
        })
    except Exception:
        pass


async def record_completion_event(user_id: str, dance_id: str) -> None:
    """Called when a user marks a dance completed for the FIRST time.

    We de-dupe on (user_id, dance_id, type) so re-toggling completed →
    completed doesn't fire a second event.
    """
    existing = await db.activity_events.find_one(
        {"user_id": user_id, "type": "completion", "ref": dance_id},
        {"_id": 1},
    )
    if existing:
        return
    await _insert_event(user_id, "completion", ref=dance_id)


async def record_badge_event(user_id: str, badge_id: str) -> None:
    await _insert_event(user_id, "badge", ref=badge_id)


async def record_streak_milestone(user_id: str, days: int) -> None:
    if days not in STREAK_MILESTONES:
        return
    # De-dupe within 24h so a bump on the same day (e.g. multiple
    # practice-log calls) doesn't create multiple identical events.
    already_today = await db.activity_events.find_one(
        {
            "user_id": user_id,
            "type": "streak_milestone",
            "extra.days": days,
            "created_at": {"$gte": now_iso()[:10]},  # today's date prefix
        },
        {"_id": 1},
    )
    if already_today:
        return
    await _insert_event(user_id, "streak_milestone", extra={"days": days})


# ---------------- Public user profile assembly ----------------
async def get_public_user(
    user_id: str, viewer_id: Optional[str] = None
) -> Optional[dict]:
    """Return a lightweight, privacy-respecting profile.

    Fields:
        user_id, name, picture, is_admin, is_instructor,
        current_streak, longest_streak,
        show_in_activity_feed, show_on_leaderboard,
        counts: {completed, following, followers, badges},
        is_following (from viewer's perspective, or False if no viewer)
    """
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        return None

    counts = {
        "completed": await db.tracking.count_documents(
            {"user_id": user_id, "status": "completed"}
        ),
        "badges": await db.user_badges.count_documents({"user_id": user_id}),
        **await follow_counts(user_id),
    }

    return {
        "user_id": u["user_id"],
        "name": u.get("name", "") or "",
        "picture": u.get("picture", "") or "",
        "is_admin": bool(u.get("is_admin")),
        "is_instructor": bool(u.get("is_admin"))
        or bool(u.get("is_instructor")),
        "current_streak": int(u.get("current_streak") or 0),
        "longest_streak": int(u.get("longest_streak") or 0),
        "show_in_activity_feed": bool(u.get("show_in_activity_feed", True)),
        "show_on_leaderboard": bool(u.get("show_on_leaderboard", False)),
        "counts": counts,
        "is_following": (
            await is_following(viewer_id, user_id) if viewer_id else False
        ),
        "is_self": bool(viewer_id and viewer_id == user_id),
    }


async def search_users(
    q: str, viewer_id: Optional[str], limit: int = 20
) -> list[dict]:
    """Case-insensitive substring search over user.name. Returns lightweight
    rows suitable for a "Find Dancers" picker.

    Users with ``show_in_activity_feed: False`` are STILL returned — the
    privacy toggle only hides their activity, not their existence.
    """
    q = (q or "").strip()
    filt: dict = {}
    if q:
        # Escape regex special chars but keep the substring semantics.
        import re
        safe = re.escape(q)
        filt["name"] = {"$regex": safe, "$options": "i"}
    cur = db.users.find(
        filt,
        {"_id": 0, "user_id": 1, "name": 1, "picture": 1,
         "current_streak": 1, "is_admin": 1, "is_instructor": 1},
    ).limit(int(limit))
    rows = await cur.to_list(int(limit))
    # Enrich with is_following flag if we have a viewer
    following = set()
    if viewer_id:
        following = set(await following_ids(viewer_id))
    out = []
    for r in rows:
        if viewer_id and r["user_id"] == viewer_id:
            continue  # never suggest yourself
        out.append({
            "user_id": r["user_id"],
            "name": r.get("name", ""),
            "picture": r.get("picture", ""),
            "current_streak": int(r.get("current_streak") or 0),
            "is_instructor": bool(r.get("is_admin")) or bool(r.get("is_instructor")),
            "is_following": r["user_id"] in following,
        })
    return out


# ---------------- Feed assembly ----------------
async def _hydrate_events(
    raw_events: list[dict],
    include_self: bool = True,
    viewer_id: Optional[str] = None,
) -> list[dict]:
    """Enrich a list of raw activity_events rows with user / dance /
    badge metadata so the client renders in one pass."""
    if not raw_events:
        return []

    # Collect the ids to look up
    user_ids = {e["user_id"] for e in raw_events}
    dance_ids = {e["ref"] for e in raw_events if e["type"] == "completion"}
    badge_ids = {e["ref"] for e in raw_events if e["type"] == "badge"}

    users = {}
    async for u in db.users.find(
        {"user_id": {"$in": list(user_ids)}},
        {"_id": 0, "user_id": 1, "name": 1, "picture": 1,
         "is_admin": 1, "is_instructor": 1},
    ):
        users[u["user_id"]] = {
            "user_id": u["user_id"],
            "name": u.get("name", ""),
            "picture": u.get("picture", ""),
            "is_instructor": bool(u.get("is_admin"))
            or bool(u.get("is_instructor")),
        }

    dances = {}
    if dance_ids:
        async for d in db.dances.find(
            {"id": {"$in": list(dance_ids)}},
            {"_id": 0, "id": 1, "name": 1, "choreographer": 1,
             "difficulty": 1, "bpm": 1},
        ):
            dances[d["id"]] = d

    from services.badges import BADGE_BY_ID

    # Bulk-fetch reaction counts + viewer's own reactions in one pass so
    # every card renders its reaction bar without an extra request.
    event_ids = [e.get("event_id") for e in raw_events if e.get("event_id")]
    reactions_by_event = await get_reactions_bulk(event_ids, viewer_id)

    out: list[dict] = []
    for e in raw_events:
        u = users.get(e["user_id"])
        if not u:
            continue  # user was deleted
        row = {
            "id": e.get("event_id") or "",
            "type": e["type"],
            "user": u,
            "created_at": e.get("created_at", ""),
            "reactions": reactions_by_event.get(
                e.get("event_id") or "", {"counts": {}, "mine": []}
            ),
        }
        if e["type"] == "completion":
            d = dances.get(e["ref"])
            if not d:
                continue  # dance deleted
            row["dance"] = d
        elif e["type"] == "badge":
            bdef = BADGE_BY_ID.get(e["ref"])
            if not bdef:
                continue
            row["badge"] = {
                "id": bdef.id,
                "title": bdef.title,
                "description": bdef.description,
                "icon": bdef.icon,
                "color": bdef.color,
            }
        elif e["type"] == "streak_milestone":
            row["days"] = int((e.get("extra") or {}).get("days") or 0)
        out.append(row)
    return out


async def get_feed(
    viewer_id: str,
    limit: int = 30,
    include_self: bool = True,
) -> list[dict]:
    """Return the caller's activity feed — events from users they follow
    (and optionally themselves), most-recent first, capped to
    ``FEED_WINDOW_DAYS``.
    """
    from datetime import datetime, timedelta, timezone as _tz
    followees = await following_ids(viewer_id)
    if include_self:
        followees.append(viewer_id)
    if not followees:
        return []

    # Filter out users who've opted out of the activity feed
    opted_out = set()
    async for u in db.users.find(
        {
            "user_id": {"$in": followees},
            "show_in_activity_feed": False,
        },
        {"_id": 0, "user_id": 1},
    ):
        opted_out.add(u["user_id"])
    visible = [uid for uid in followees if uid not in opted_out]

    # Viewers ALWAYS see their own events (opt-out is about hiding from
    # OTHER people; you still see your own in your feed).
    if include_self and viewer_id in opted_out:
        visible.append(viewer_id)

    if not visible:
        return []

    since = (
        datetime.now(_tz.utc) - timedelta(days=FEED_WINDOW_DAYS)
    ).isoformat().replace("+00:00", "Z")

    raw = await db.activity_events.find(
        {"user_id": {"$in": visible}, "created_at": {"$gte": since}},
        {"_id": 0},
    ).sort("created_at", -1).limit(int(limit)).to_list(int(limit))

    return await _hydrate_events(raw, viewer_id=viewer_id)


async def purge_user(user_id: str) -> None:
    """Called from account-deletion. Cleans up every social row keyed on
    this user in either direction."""
    await db.follows.delete_many({"follower_id": user_id})
    await db.follows.delete_many({"followee_id": user_id})
    await db.activity_events.delete_many({"user_id": user_id})
    await db.feed_reactions.delete_many({"user_id": user_id})
    # Reports authored BY the deleted user, plus reports ABOUT the
    # deleted user — the latter avoids orphaned moderation-queue rows.
    await db.feed_reports.delete_many({"reporter_id": user_id})
    await db.feed_reports.delete_many({"reported_user_id": user_id})
