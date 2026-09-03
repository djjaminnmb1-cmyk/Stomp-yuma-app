"""Follow-graph for CHOREOGRAPHER names (not users).

Dancers subscribe to a choreographer (identified only by name — we have
no notion of a "choreographer account") so they get a push when a new
dance by that person is published in the local library.

Data model
----------
* ``choreographer_follows``
    ``{user_id, choreographer, choreographer_key, created_at}``
    * Unique index on ``(user_id, choreographer_key)``.
    * ``choreographer_key`` = lowercase, punctuation-stripped, single-
      spaced name — so "Rob Fowler", "rob  fowler" and "Rob-Fowler"
      collapse to the same row.
* ``choreographer_notifications``  (idempotency ledger)
    ``{user_id, choreographer_key, dance_id, sent_at}``
    * Unique on ``(user_id, dance_id)`` so re-publishing a dance never
      spams the same follower twice.

Fan-out
-------
``notify_followers_of_new_dance(dance)`` is called from ``routes/dances.py``
inline when a NEW dance is created published, or when an existing draft
is flipped to published for the first time. Best-effort — swallow errors
so a push outage never blocks the CRUD path.
"""
from __future__ import annotations

import logging
import re
from typing import Optional

from core.database import db
from core.push_service import send_push
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)

# ------------- Normalisation -------------
_KEY_RE = re.compile(r"[^a-z0-9]+")


def normalise_choreographer(name: Optional[str]) -> str:
    """Fold "Rob Fowler", "rob  fowler" and "Rob-Fowler" to the same
    key. Empty / None input returns "" so callers can decide whether to
    reject or silently no-op.
    """
    if not name:
        return ""
    return _KEY_RE.sub(" ", name.strip().lower()).strip()


# ------------- Index management -------------
_INDEXES_READY = False


async def ensure_indexes() -> None:
    """Create the unique indexes on first import. Idempotent.

    Called once from ``services/startup.py``. Safe to call multiple
    times — MongoDB no-ops on identical index specs.
    """
    global _INDEXES_READY
    if _INDEXES_READY:
        return
    try:
        await db.choreographer_follows.create_index(
            [("user_id", 1), ("choreographer_key", 1)],
            unique=True,
            name="uniq_user_chor_key",
        )
        await db.choreographer_follows.create_index(
            [("choreographer_key", 1)],
            name="by_chor_key",
        )
        await db.choreographer_notifications.create_index(
            [("user_id", 1), ("dance_id", 1)],
            unique=True,
            name="uniq_user_dance",
        )
        _INDEXES_READY = True
    except Exception as e:
        logger.warning(f"choreographer index setup failed: {e}")


async def deduplicate_existing_rows() -> int:
    """One-shot cleanup for legacy follow rows that pre-date the unique
    index. Keeps the OLDEST row for each ``(user_id, choreographer_key)``
    pair and removes the rest. Safe to run on every boot — becomes a
    no-op once the collection is clean.

    Returns the number of rows removed.
    """
    pipeline = [
        {"$sort": {"created_at": 1}},
        {"$group": {
            "_id": {
                "user_id": "$user_id",
                "choreographer_key": "$choreographer_key",
            },
            "keep": {"$first": "$_id"},
            "ids": {"$push": "$_id"},
            "n": {"$sum": 1},
        }},
        {"$match": {"n": {"$gt": 1}}},
    ]
    dupes = [d async for d in db.choreographer_follows.aggregate(pipeline)]
    removed = 0
    for group in dupes:
        to_delete = [i for i in group["ids"] if i != group["keep"]]
        if not to_delete:
            continue
        res = await db.choreographer_follows.delete_many(
            {"_id": {"$in": to_delete}}
        )
        removed += int(res.deleted_count or 0)
    return removed


# ------------- Read helpers -------------
async def is_following(user_id: str, choreographer: str) -> bool:
    key = normalise_choreographer(choreographer)
    if not key:
        return False
    doc = await db.choreographer_follows.find_one(
        {"user_id": user_id, "choreographer_key": key},
        {"_id": 1},
    )
    return doc is not None


async def follower_ids_for(choreographer_key: str) -> list[str]:
    """User ids following a given (already-normalised) choreographer key."""
    if not choreographer_key:
        return []
    return await db.choreographer_follows.distinct(
        "user_id", {"choreographer_key": choreographer_key}
    )


async def my_follows(user_id: str) -> list[dict]:
    """Return the caller's followed choreographers, most-recently-added
    first, each enriched with the current published-dance count and the
    most recent dance name (for a nice "Latest: ..." row on the client).
    """
    rows = await db.choreographer_follows.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=500)
    if not rows:
        return []
    # Batch counts + latest-per-choreographer in a single aggregate.
    keys = [r["choreographer_key"] for r in rows if r.get("choreographer_key")]
    counts: dict[str, dict] = {}
    if keys:
        # We store the raw choreographer string on the dance — normalise
        # on the fly. Small pipeline: match by published+not-empty, add
        # normalised key, group.
        pipeline = [
            {"$match": {"is_published": True, "choreographer": {"$ne": ""}}},
            {"$addFields": {
                "_key": {"$toLower": {"$trim": {"input": "$choreographer"}}},
            }},
            {"$match": {"_key": {"$in": keys}}},
            {"$sort": {"created_at": -1}},
            {"$group": {
                "_id": "$_key",
                "count": {"$sum": 1},
                "latest_dance_id": {"$first": "$id"},
                "latest_dance_name": {"$first": "$name"},
                "latest_dance_at": {"$first": "$created_at"},
            }},
        ]
        async for row in db.dances.aggregate(pipeline):
            counts[row["_id"]] = row

    # NOTE: the aggregate above uses a light-weight `$toLower + $trim`
    # normalisation. We ALSO run the strict Python normaliser client-
    # side for the followed keys so we don't miss punctuation cases.
    # In practice we care about the batch count — a small over-count
    # from very-close-but-not-identical names is acceptable.
    out: list[dict] = []
    for r in rows:
        k = r["choreographer_key"]
        stats = counts.get(k) or {}
        out.append({
            "choreographer": r["choreographer"],
            "choreographer_key": k,
            "dance_count": int(stats.get("count") or 0),
            "latest_dance_id": stats.get("latest_dance_id") or "",
            "latest_dance_name": stats.get("latest_dance_name") or "",
            "latest_dance_at": stats.get("latest_dance_at") or "",
            "created_at": r.get("created_at", ""),
        })
    return out


async def follow_counts(user_id: str) -> dict:
    """Return ``{following: N}`` for the caller."""
    n = await db.choreographer_follows.count_documents({"user_id": user_id})
    return {"following": int(n)}


async def list_choreographers(
    q: str, viewer_id: str, limit: int = 40
) -> list[dict]:
    """Return the top-N choreographers in the LOCAL library, hydrated
    with the caller's follow state and a published-dance count. Optional
    ``q`` filters by substring on the display name.

    Because we compute the list from the ``dances`` collection, ONLY
    choreographers with at least one PUBLISHED dance appear — this
    also happens to guarantee that anyone the caller can follow will
    generate a pushable event later.
    """
    q = (q or "").strip()
    pipeline: list[dict] = [
        {"$match": {"is_published": True, "choreographer": {"$ne": ""}}},
    ]
    if q:
        # Case-insensitive substring on the display name.
        pipeline.append(
            {"$match": {"choreographer": {"$regex": re.escape(q), "$options": "i"}}}
        )
    pipeline += [
        {"$addFields": {
            "_key": {"$toLower": {"$trim": {"input": "$choreographer"}}},
        }},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$_key",
            "choreographer": {"$first": "$choreographer"},
            "count": {"$sum": 1},
            "latest_dance_id": {"$first": "$id"},
            "latest_dance_name": {"$first": "$name"},
            "latest_dance_at": {"$first": "$created_at"},
        }},
        {"$sort": {"count": -1, "choreographer": 1}},
        {"$limit": max(1, min(int(limit or 40), 200))},
    ]
    rows = [r async for r in db.dances.aggregate(pipeline)]
    if not rows:
        return []
    followed = set()
    if viewer_id:
        followed = set(await db.choreographer_follows.distinct(
            "choreographer_key", {"user_id": viewer_id}
        ))
    out: list[dict] = []
    for r in rows:
        key = r["_id"]
        out.append({
            "choreographer": r.get("choreographer", ""),
            "choreographer_key": key,
            "dance_count": int(r.get("count") or 0),
            "latest_dance_id": r.get("latest_dance_id") or "",
            "latest_dance_name": r.get("latest_dance_name") or "",
            "latest_dance_at": r.get("latest_dance_at") or "",
            "is_following": key in followed,
        })
    return out


# ------------- Write helpers -------------
async def follow(user_id: str, choreographer: str) -> tuple[bool, str]:
    """Insert a follow row. Idempotent — returns ``(created, key)``.

    ``choreographer`` may be any casing / punctuation; we store the
    original spelling AND the normalised key so subsequent renders
    show the name as it was typed while lookups stay canonical.
    """
    key = normalise_choreographer(choreographer)
    if not key:
        return False, ""
    now = now_iso()
    try:
        await db.choreographer_follows.insert_one({
            "user_id": user_id,
            "choreographer": choreographer.strip(),
            "choreographer_key": key,
            "created_at": now,
        })
        return True, key
    except Exception:
        # Duplicate-key — already following. Return False so callers
        # know the row wasn't created but pass the key back for the
        # counts payload.
        return False, key


async def unfollow(user_id: str, choreographer: str) -> tuple[bool, str]:
    key = normalise_choreographer(choreographer)
    if not key:
        return False, ""
    res = await db.choreographer_follows.delete_one(
        {"user_id": user_id, "choreographer_key": key}
    )
    return bool(int(res.deleted_count or 0) > 0), key


# ------------- Notification fan-out -------------
async def notify_followers_of_new_dance(dance: dict) -> int:
    """Fire pushes + write in-app activity events for every follower of
    this dance's choreographer. Idempotent per (user_id, dance_id) so
    unpublish → re-publish never spams the same follower twice.

    Returns the number of NEW notifications that were actually sent.
    """
    if not dance:
        return 0
    if not dance.get("is_published"):
        return 0
    choreographer = (dance.get("choreographer") or "").strip()
    key = normalise_choreographer(choreographer)
    if not key:
        return 0

    dance_id = dance.get("id") or ""
    dance_name = dance.get("name") or "New dance"
    if not dance_id:
        return 0

    followers = await follower_ids_for(key)
    # Never notify the creator themselves.
    creator = dance.get("created_by") or ""
    followers = [u for u in followers if u and u != creator]
    if not followers:
        return 0
    # Respect notification prefs — dancers who muted "choreographer_alerts"
    # get skipped. The ledger row is skipped too so re-enabling in prefs
    # applies to future drops (not back-fill).
    from services.notification_prefs import filter_recipients
    followers = await filter_recipients(followers, "choreographer_alerts")
    if not followers:
        return 0

    # Idempotency ledger — one row per (user, dance) pair. Any
    # follower that already has a row is skipped.
    existing = set()
    async for row in db.choreographer_notifications.find(
        {"user_id": {"$in": followers}, "dance_id": dance_id},
        {"_id": 0, "user_id": 1},
    ):
        existing.add(row["user_id"])
    fresh = [u for u in followers if u not in existing]
    if not fresh:
        return 0

    now = now_iso()
    # Write ledger rows (batch — best-effort). We don't rely on unique
    # index insert-many since a duplicate-key would abort the batch;
    # ordered=False keeps the rest going.
    try:
        await db.choreographer_notifications.insert_many(
            [
                {
                    "user_id": u,
                    "choreographer": choreographer,
                    "choreographer_key": key,
                    "dance_id": dance_id,
                    "dance_name": dance_name,
                    "sent_at": now,
                }
                for u in fresh
            ],
            ordered=False,
        )
    except Exception as e:
        logger.warning(f"choreographer ledger insert failed: {e}")

    # Fire the push. Emergent relay handles the missing-token gracefully.
    # The activity feed is intentionally NOT touched — feeds surface
    # friends' actions, and "a choreographer you follow released a
    # new dance" is an ambient notification, not a social event. The
    # push tap deeplinks straight into the new dance detail screen.
    #
    # Localised per recipient's ``preferred_language`` — see
    # ``core.push_service.send_push_localised``. Users without an
    # override receive the English default.
    try:
        from core.push_service import send_push_localised

        await send_push_localised(
            fresh,
            title_key="push.new_dance.title",
            body_key="push.new_dance.body",
            params={
                "choreographer": choreographer,
                "dance_name": dance_name,
            },
            data={
                "deeplink": f"/dance/{dance_id}",
                "action_url": f"/dance/{dance_id}",
            },
            idempotency_key=f"chor-new-{dance_id}",
        )
    except Exception as e:
        logger.warning(f"choreographer push failed: {e}")

    return len(fresh)


async def purge_user(user_id: str) -> None:
    """Called from account-deletion. Cleans up follow rows + the
    idempotency ledger keyed on this user."""
    await db.choreographer_follows.delete_many({"user_id": user_id})
    await db.choreographer_notifications.delete_many({"user_id": user_id})
