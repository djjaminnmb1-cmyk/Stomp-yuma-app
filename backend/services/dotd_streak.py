"""DOTD (Dance Of The Day) consecutive-practice streak.

Dancers earn a "Daily Devotee" badge for opening today's featured
dance three days in a row (from the hero card specifically), and a
"Weekly Devotee" badge at seven days. The streak lives on the user
document as ``dotd_streak_current`` / ``dotd_streak_longest`` and is
re-evaluated against the badge catalogue every time an open is logged
— so the badge celebration can land in the same request that bumped
the counter.

Where the counter changes
-------------------------
* **Open today's DOTD from the hero** → ``record_open()`` sets
  ``dotd_streak_current`` to ``prev + 1`` if yesterday is in the
  ``dotd_opens`` ledger, otherwise ``1`` (fresh start).
* **Skip a day** (no ``dotd_opens`` row for yesterday nor today) →
  the next open resets to ``1``. We don't actively zero the counter
  on quiet days; the next open is enough to reconcile.
* **Longest** is a watermark: ``max(longest, current)`` on every bump.

What counts
-----------
Only an open fired from the DOTD hero card itself (``POST /api/
dance-of-the-day/open``) is credited. Opening the dance via the
library, search, or chat deep-link does NOT bump the counter. We
double-check the submitted ``dance_id`` matches today's featured
dance for THIS user before accepting the open — a stale client that
pushes yesterday's cached pick gets a 400.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from core.database import db
from core.time_helpers import now_iso
from services.badges import evaluate_badges
from services.dance_of_the_day import pick_for

logger = logging.getLogger(__name__)

_INDEXES_READY = False


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _yesterday_iso() -> str:
    return (
        datetime.now(timezone.utc).date() - timedelta(days=1)
    ).isoformat()


async def ensure_indexes() -> None:
    global _INDEXES_READY
    if _INDEXES_READY:
        return
    try:
        await db.dotd_opens.create_index(
            [("user_id", 1), ("day", 1)],
            unique=True,
            name="uniq_user_day",
        )
        _INDEXES_READY = True
    except Exception as e:
        logger.warning(f"dotd_opens index setup failed: {e}")


async def _get_user_streak(user_id: str) -> dict:
    u = await db.users.find_one(
        {"user_id": user_id},
        {
            "_id": 0,
            "dotd_streak_current": 1,
            "dotd_streak_longest": 1,
            "dotd_last_open_day": 1,
        },
    ) or {}
    return {
        "current": int(u.get("dotd_streak_current") or 0),
        "longest": int(u.get("dotd_streak_longest") or 0),
        "last_day": u.get("dotd_last_open_day"),
    }


async def get_streak(user_id: str) -> dict:
    """Public read — the hero card asks for this on mount so it can
    render "🔥 Day N" even when the dancer hasn't tapped yet today.

    Returns ``{current, longest, today_done}``:

    * ``current`` is the streak as it stands RIGHT NOW. A dancer who
      hit 5 days in a row and skipped yesterday is still shown as
      ``current=5`` because we haven't logged the reset-to-1 yet; the
      next open will reconcile. (Prevents cosmetic "Oh no my streak
      broke" scares when the user has done nothing wrong.)
    * ``today_done`` is True iff ``dotd_last_open_day == today`` —
      the hero uses this to render the flame as "solid" vs "dotted".
    """
    s = await _get_user_streak(user_id)
    today_done = s["last_day"] == _today_iso()
    return {
        "current": s["current"],
        "longest": s["longest"],
        "today_done": today_done,
    }


async def record_open(user_id: str, dance_id: str) -> dict:
    """Credit the dancer for opening today's featured dance from the
    hero. Returns ``{streak, today_done, newly_earned, dance_matches}``.

    Behavior:
    * Validates the submitted ``dance_id`` matches today's DOTD pick
      for this user. On mismatch, returns ``dance_matches=False`` and
      does NOT change the streak — the client probably cached a stale
      pick overnight.
    * Idempotent within a single day: a second open on the same day
      updates the ledger timestamp but does NOT re-bump the streak.
    * Awards badges via ``evaluate_badges`` after bumping, so a hero
      celebration can display in the same response.
    """
    if not dance_id:
        return {
            "streak": await get_streak(user_id),
            "newly_earned": [],
            "dance_matches": False,
        }

    today = _today_iso()
    yesterday = _yesterday_iso()

    # Verify this is TODAY's featured dance for the user. ``pick_for``
    # is cached per (user, day) so this is cheap on repeat asks.
    featured = await pick_for(user_id)
    featured_id = (featured or {}).get("id") if featured else None
    if not featured_id or featured_id != dance_id:
        return {
            "streak": await get_streak(user_id),
            "newly_earned": [],
            "dance_matches": False,
        }

    # Upsert the per-day ledger row. Unique index on (user_id, day)
    # means a second open on the same day is a no-op bump.
    try:
        res = await db.dotd_opens.update_one(
            {"user_id": user_id, "day": today},
            {
                "$set": {
                    "dance_id": dance_id,
                    "last_open_at": now_iso(),
                },
                "$setOnInsert": {"first_open_at": now_iso()},
                "$inc": {"opens": 1},
            },
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"dotd_opens upsert failed: {e}")
        return {
            "streak": await get_streak(user_id),
            "newly_earned": [],
            "dance_matches": True,
        }

    first_open_today = bool(res.upserted_id is not None)
    newly_earned: list[dict] = []

    if first_open_today:
        # Streak bump: contiguous day → +1, otherwise reset to 1.
        prev = await _get_user_streak(user_id)
        new_current = prev["current"] + 1 if prev["last_day"] == yesterday else 1
        new_longest = max(prev["longest"], new_current)
        await db.users.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "dotd_streak_current": new_current,
                    "dotd_streak_longest": new_longest,
                    "dotd_last_open_day": today,
                }
            },
        )
        # Evaluate badges — new counter is already on the user doc, so
        # the ``dotd_streak`` category in ``_progress_for`` picks it up.
        try:
            newly_earned = await evaluate_badges(user_id)
        except Exception:
            logger.exception("evaluate_badges after DOTD open failed")

    return {
        "streak": await get_streak(user_id),
        "newly_earned": newly_earned,
        "dance_matches": True,
    }


async def purge_user(user_id: str) -> None:
    """Account-deletion cleanup."""
    await db.dotd_opens.delete_many({"user_id": user_id})
    await db.users.update_one(
        {"user_id": user_id},
        {
            "$unset": {
                "dotd_streak_current": "",
                "dotd_streak_longest": "",
                "dotd_last_open_day": "",
            }
        },
    )
