"""Badge / achievement definitions and evaluation logic.

Badges are earned automatically after any activity that could push a user
past a threshold — completing a dance, marking a class attended, or
opening Practice Mode. We evaluate every criterion on each event (cheap:
a handful of `count_documents` calls) and upsert into ``db.user_badges``
any newly-earned rows so the caller can immediately celebrate them.

Design principles
-----------------
* **Deterministic, idempotent**: awarding is keyed by (user_id, badge_id)
  with unique index, so parallel writes never duplicate.
* **Streaks live on the user doc**: ``current_streak`` / ``longest_streak``
  / ``last_streak_date`` — updated by ``bump_streak``. Timezone is the
  server's UTC day boundary (kept simple; matches how everything else in
  the app treats dates).
* **Static catalog**: badge metadata (title, description, requirement)
  is defined in this module. Adding a new badge means dropping a row in
  the ``BADGES`` list and updating ``_progress_for`` — no schema change.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Iterable, List, Optional

from pymongo.errors import DuplicateKeyError

from core.database import db
from core.time_helpers import now_iso


@dataclass(frozen=True)
class BadgeDef:
    id: str
    title: str
    description: str
    icon: str            # Ionicons name
    color: str           # hex
    category: str        # "milestone" | "streak" | "class" | "practice" | "variety"
    requirement: int     # numeric threshold used by the progress function
    # Human-readable short line shown under the requirement (e.g. "10 dances")
    unit: str


# The catalog. Order is display order (front-end renders them top-down).
BADGES: List[BadgeDef] = [
    # ---------------- Completion milestones ----------------
    BadgeDef("first_steps", "First Steps",
             "Complete your first line dance.",
             "footsteps", "#F2A628", "milestone", 1, "dance"),
    BadgeDef("getting_groovy", "Getting Groovy",
             "Complete 10 dances — you're finding your rhythm.",
             "musical-notes", "#E8823E", "milestone", 10, "dances"),
    BadgeDef("line_dance_legend", "Line Dance Legend",
             "Complete 50 dances — a bona fide milestone.",
             "trophy", "#C4442A", "milestone", 50, "dances"),
    BadgeDef("century_club", "Century Club",
             "100 dances mastered. Absolute legend.",
             "ribbon", "#8B2E1E", "milestone", 100, "dances"),

    # ---------------- Streak ----------------
    BadgeDef("perfect_week", "Perfect Week",
             "7-day practice streak — showing up daily pays off.",
             "flame", "#D9502A", "streak", 7, "day streak"),
    BadgeDef("iron_boots", "Iron Boots",
             "30-day practice streak. Dedication level: elite.",
             "flame", "#8B1A1A", "streak", 30, "day streak"),

    # ---------------- Classes ----------------
    BadgeDef("class_regular", "Class Regular",
             "Attend 10 studio classes.",
             "calendar", "#5D7A62", "class", 10, "classes"),
    BadgeDef("class_devotee", "Class Devotee",
             "Attend 25 studio classes.",
             "school", "#3E5C40", "class", 25, "classes"),

    # ---------------- Practice ----------------
    BadgeDef("practice_warrior", "Practice Warrior",
             "Rack up 25 practice sessions in-app.",
             "fitness", "#1D3B87", "practice", 25, "practice sessions"),
    BadgeDef("practice_maestro", "Practice Maestro",
             "100 practice sessions — you're carving muscle memory.",
             "medal", "#132A5F", "practice", 100, "practice sessions"),

    # ---------------- Variety ----------------
    BadgeDef("well_rounded", "Well-Rounded",
             "Complete dances at every difficulty tier.",
             "sparkles", "#7A3EA3", "variety", 4, "difficulty tiers"),
    BadgeDef("wishlist_dreamer", "Wishlist Dreamer",
             "Add 10 dances to your wishlist.",
             "bookmark", "#A66F1F", "variety", 10, "wishlisted"),
]

BADGE_BY_ID: dict[str, BadgeDef] = {b.id: b for b in BADGES}


# ---------------- Progress evaluation ----------------
async def _progress_for(user_id: str, badge: BadgeDef) -> int:
    """Return the current numeric progress toward ``badge`` for this user.

    Kept as a single function (rather than a callback on each BadgeDef) so
    catalog changes stay in the tuple above and this function is the only
    place that touches Mongo.
    """
    if badge.category == "milestone":
        return await db.tracking.count_documents(
            {"user_id": user_id, "status": "completed"}
        )
    if badge.category == "class":
        return await db.attendance.count_documents({"user_id": user_id})
    if badge.category == "practice":
        # Sum of practice_sessions.count for this user
        cursor = db.practice_sessions.aggregate([
            {"$match": {"user_id": user_id}},
            {"$group": {"_id": None, "total": {"$sum": "$count"}}},
        ])
        rows = await cursor.to_list(1)
        return int(rows[0]["total"]) if rows else 0
    if badge.category == "streak":
        user = await db.users.find_one(
            {"user_id": user_id},
            {"_id": 0, "current_streak": 1, "longest_streak": 1},
        )
        # Award for hitting the threshold on either current or best streak.
        # (Doesn't retro-strip badges when the streak breaks.)
        return int(
            max(
                (user or {}).get("current_streak", 0) or 0,
                (user or {}).get("longest_streak", 0) or 0,
            )
        )
    if badge.category == "variety":
        if badge.id == "well_rounded":
            # Count DISTINCT difficulties among the user's completed dances.
            pipeline = [
                {"$match": {"user_id": user_id, "status": "completed"}},
                {"$lookup": {
                    "from": "dances",
                    "localField": "dance_id",
                    "foreignField": "id",
                    "as": "d",
                }},
                {"$unwind": "$d"},
                {"$group": {"_id": {"$toLower": "$d.difficulty"}}},
            ]
            rows = await db.tracking.aggregate(pipeline).to_list(20)
            allowed = {"beginner", "improver", "intermediate", "advanced"}
            distinct = {r["_id"] for r in rows if r["_id"] in allowed}
            return len(distinct)
        if badge.id == "wishlist_dreamer":
            return await db.tracking.count_documents(
                {"user_id": user_id, "status": "wishlist"}
            )
    return 0


async def evaluate_badges(user_id: str) -> List[dict]:
    """Return the list of badges NEWLY earned by ``user_id`` on this event.

    Awarded badges are persisted to ``db.user_badges`` and marked as unseen
    (``seen=False``) so the UI can decide whether to celebrate them.

    Safe to call on every write-side action — bounded to ~1 aggregate + a
    handful of counts, and no-ops for users past all thresholds.
    """
    now = now_iso()
    # Fetch already-earned ids so we skip the DB write for them.
    already = {
        d["badge_id"]
        async for d in db.user_badges.find(
            {"user_id": user_id}, {"_id": 0, "badge_id": 1}
        )
    }
    newly: List[dict] = []
    for b in BADGES:
        if b.id in already:
            continue
        prog = await _progress_for(user_id, b)
        if prog >= b.requirement:
            row = {
                "user_id": user_id,
                "badge_id": b.id,
                "earned_at": now,
                "seen": False,
                "requirement": b.requirement,
                "progress_at_earn": prog,
            }
            try:
                await db.user_badges.insert_one(row)
            except DuplicateKeyError:
                # Parallel writer already awarded this badge — safe to skip.
                continue
            newly.append(_serialize_badge(b, prog, row))
    return newly


def _serialize_badge(
    b: BadgeDef, progress: int, earned_row: Optional[dict] = None
) -> dict:
    return {
        "id": b.id,
        "title": b.title,
        "description": b.description,
        "icon": b.icon,
        "color": b.color,
        "category": b.category,
        "requirement": b.requirement,
        "unit": b.unit,
        "progress": progress,
        "earned": earned_row is not None,
        "earned_at": (earned_row or {}).get("earned_at", ""),
        "seen": bool((earned_row or {}).get("seen", False)),
    }


async def list_badges_for(user_id: str) -> List[dict]:
    """Return every badge in the catalog with the caller's current progress
    and earned/seen flags. Used by the Badge grid on the Achievements page.
    """
    earned_rows = {
        d["badge_id"]: d
        async for d in db.user_badges.find(
            {"user_id": user_id}, {"_id": 0}
        )
    }
    out: List[dict] = []
    for b in BADGES:
        prog = await _progress_for(user_id, b)
        row = earned_rows.get(b.id)
        out.append(_serialize_badge(b, prog, row))
    return out


async def mark_badges_seen(user_id: str, badge_ids: Optional[Iterable[str]] = None) -> int:
    """Flip ``seen=True`` on the caller's specified badges.

    If ``badge_ids`` is None or empty, marks ALL their earned badges as
    seen — used by the Achievements screen on open. Returns the number of
    rows modified.
    """
    q: dict = {"user_id": user_id, "seen": {"$ne": True}}
    if badge_ids:
        ids = [b for b in badge_ids if isinstance(b, str)]
        if not ids:
            return 0
        q["badge_id"] = {"$in": ids}
    res = await db.user_badges.update_many(q, {"$set": {"seen": True}})
    return int(res.modified_count or 0)


# ---------------- Streak logic ----------------
def _today_utc_date() -> date:
    return datetime.now(timezone.utc).date()


async def bump_streak(user_id: str) -> dict:
    """Update the user's daily streak based on the current UTC date.

    Returns ``{current, longest, last_streak_date}`` reflecting post-update
    state so the caller can echo it back to the client.

    Rules (UTC day boundary — kept simple):
    * If ``last_streak_date == today``  — no change.
    * If ``last_streak_date == today-1`` — increment ``current_streak``.
    * Otherwise                          — reset ``current_streak`` to 1.
    * ``longest_streak`` is monotonically non-decreasing.
    """
    today = _today_utc_date()
    doc = await db.users.find_one(
        {"user_id": user_id},
        {"_id": 0, "current_streak": 1, "longest_streak": 1, "last_streak_date": 1},
    )
    if doc is None:
        # User row missing entirely — nothing we can do
        return {"current": 0, "longest": 0, "last_streak_date": ""}

    last_raw = doc.get("last_streak_date") or ""
    try:
        last_dt = date.fromisoformat(last_raw) if last_raw else None
    except ValueError:
        last_dt = None

    current = int(doc.get("current_streak") or 0)
    longest = int(doc.get("longest_streak") or 0)

    if last_dt == today:
        # Already counted today. Nothing to write.
        return {
            "current": current,
            "longest": longest,
            "last_streak_date": today.isoformat(),
        }
    if last_dt and (today - last_dt).days == 1:
        current += 1
    else:
        current = 1

    longest = max(longest, current)

    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "current_streak": current,
            "longest_streak": longest,
            "last_streak_date": today.isoformat(),
        }},
    )
    return {
        "current": current,
        "longest": longest,
        "last_streak_date": today.isoformat(),
    }


async def get_streak(user_id: str) -> dict:
    doc = await db.users.find_one(
        {"user_id": user_id},
        {"_id": 0, "current_streak": 1, "longest_streak": 1, "last_streak_date": 1},
    )
    if doc is None:
        return {"current": 0, "longest": 0, "last_streak_date": ""}

    # Auto-expire a stale current streak on read — if the user hasn't
    # practiced today OR yesterday, their "current" should already read 0.
    # (We don't write on read; the next bump_streak will normalise it.)
    today = _today_utc_date()
    last_raw = doc.get("last_streak_date") or ""
    try:
        last_dt = date.fromisoformat(last_raw) if last_raw else None
    except ValueError:
        last_dt = None
    current = int(doc.get("current_streak") or 0)
    if last_dt and (today - last_dt).days > 1:
        current = 0

    return {
        "current": current,
        "longest": int(doc.get("longest_streak") or 0),
        "last_streak_date": last_raw,
    }


async def award_and_streak(user_id: str) -> dict:
    """Convenience wrapper for endpoints: bump the streak (side-effects the
    user doc), then evaluate badges. Returns a small payload the client can
    forward straight into a celebration overlay.
    """
    streak = await bump_streak(user_id)
    newly = await evaluate_badges(user_id)
    return {"streak": streak, "newly_earned_badges": newly}
