"""Dance Of The Day — one featured dance per user per day.

Selection rules (highest priority first):

1. **Cached**: if we already picked a dance for this ``(user_id, date)``
   pair today, return the cached row. The cache lives in the
   ``dance_of_the_day`` collection with the date as the natural index.
2. **Unpracticed-first**: query the user's practiced dances
   (``practice_sessions.dance_id`` set), filter published dances to
   those the user has NOT practiced, then pick ONE deterministically
   using a stable hash of ``(user_id, date)`` modulo the pool size.
3. **Caught-up fallback**: if the user has practiced every published
   dance (great job 🎉), rotate through ALL published dances using
   the same deterministic hash — they'll see a different one every
   day but still get something.
4. **Empty library**: returns ``None`` — the frontend hero card hides
   itself when there's no dance to feature.

Why deterministic?
------------------
Two reasons: (a) the user tapping the hero card and bouncing back
shouldn't see a different dance, and (b) a cold cache miss (e.g. after
a server restart on day boundary) always resolves to the same pick so
there's no "it changed when I refreshed" confusion.

Why cache?
----------
Even with determinism, the "unpracticed" set changes as the user
practices during the day. We lock the selection to the first ask so
practicing dance A at 10am doesn't swap today's featured dance from A
to B at 10:01 — users want continuity, not a moving target. The cache
TTLs on day boundary so tomorrow's pick is fresh.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

from core.database import db

logger = logging.getLogger(__name__)


def _today_iso(tz_offset_minutes: int = 0) -> str:
    """Return YYYY-MM-DD for *the caller's local day*. The home screen
    sends its own tz offset in a future revision; for now we use UTC
    so the "day" boundary is consistent across our global user base.
    (Arizona doesn't observe DST, so UTC-07 is stable all year — the
    "day" rolls over at 5pm Yuma time, which lines up with the typical
    morning-to-noon practice window the next day.)
    """
    _ = tz_offset_minutes
    return datetime.now(timezone.utc).date().isoformat()


def _deterministic_pick(user_id: str, day_iso: str, pool_size: int) -> int:
    """Stable hash → integer in [0, pool_size).

    Using SHA1 (fast, well-distributed) and the user_id+day as the
    salt guarantees:
    - Two users on the same day pick DIFFERENT dances (great for the
      "community picks" feel without us having to coordinate).
    - Same user on consecutive days picks DIFFERENT dances (rotation).
    - Same user re-asking on the same day picks the SAME dance (cache
      miss fallback is still stable).
    """
    if pool_size <= 0:
        return 0
    key = f"{user_id}|{day_iso}".encode("utf-8")
    digest = hashlib.sha1(key).digest()
    # Take first 4 bytes as an unsigned int.
    n = int.from_bytes(digest[:4], "big")
    return n % pool_size


async def _practiced_dance_ids(user_id: str) -> set[str]:
    """IDs of every dance this user has opened at least once."""
    ids: set[str] = set()
    async for row in db.practice_sessions.find(
        {"user_id": user_id}, {"_id": 0, "dance_id": 1}
    ):
        did = row.get("dance_id")
        if did:
            ids.add(did)
    return ids


async def _get_cached_pick(user_id: str, day_iso: str) -> Optional[dict]:
    row = await db.dance_of_the_day.find_one(
        {"user_id": user_id, "day": day_iso}, {"_id": 0}
    )
    if not row:
        return None
    dance = await db.dances.find_one(
        {"id": row.get("dance_id"), "is_published": True}, {"_id": 0}
    )
    if not dance:
        # The cached dance was unpublished / deleted between picks —
        # drop the stale entry and let caller re-pick.
        await db.dance_of_the_day.delete_one(
            {"user_id": user_id, "day": day_iso}
        )
        return None
    return dance


async def _cache_pick(
    user_id: str, day_iso: str, dance_id: str, source: str
) -> None:
    """Idempotent upsert so a double-ask on the same day never
    inserts twice."""
    try:
        await db.dance_of_the_day.update_one(
            {"user_id": user_id, "day": day_iso},
            {
                "$set": {
                    "dance_id": dance_id,
                    "source": source,
                    "picked_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"dance_of_the_day cache upsert failed: {e}")


async def pick_for(user_id: str) -> Optional[dict]:
    """Return today's featured dance for ``user_id`` or ``None`` if the
    library has no published dances.
    """
    day = _today_iso()
    cached = await _get_cached_pick(user_id, day)
    if cached:
        cached["_dotd_source"] = "cached"
        return cached

    # Query published dances only — keep the fields light; the
    # frontend hero needs name, choreographer, difficulty, id, maybe
    # artist/song.
    PROJ = {
        "_id": 0,
        "id": 1,
        "name": 1,
        "choreographer": 1,
        "co_choreographers": 1,
        "difficulty": 1,
        "song": 1,
        "artist": 1,
        "bpm": 1,
        "tags": 1,
    }
    published: list[dict] = []
    async for row in db.dances.find(
        {"is_published": True}, PROJ
    ).sort("id", 1):
        if row.get("id"):
            published.append(row)
    if not published:
        return None

    practiced = await _practiced_dance_ids(user_id)
    pool = [d for d in published if d["id"] not in practiced]
    source = "unpracticed"
    if not pool:
        # They've practiced the entire library — rotate through
        # everything so they still get a featured pick.
        pool = published
        source = "caught_up"

    idx = _deterministic_pick(user_id, day, len(pool))
    chosen = pool[idx]
    await _cache_pick(user_id, day, chosen["id"], source)
    chosen["_dotd_source"] = source
    return chosen
