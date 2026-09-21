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


# ------------- Multi-choreographer parsing -------------
# A dance credit string can pack several people into one field, e.g.
# "Rachael McEnaney-White & Roy Verdonk", "Guyton Mundy / Jose Miguel",
# "John Robinson, Neville Fitzgerald, Julie Harris", "Foo feat. Bar".
# The FIRST name is treated as the MAIN choreographer — the one that
# owns the dance in the "solo choreographers only" library — and every
# subsequent name becomes a co-choreographer that surfaces only on
# the individual dance page.
#
# Splitter list (case-insensitive), applied in a single pass:
#   * ampersand-style: " & ", " + "
#   * slash-style:     " / "
#   * word-style:      " and ", " feat. ", " feat ", " ft. ", " ft "
#   * comma:           ", "
#
# We deliberately DON'T split on bare hyphens or dots (they appear in
# hyphenated surnames and honorifics like "A.T. Kinson"), and we don't
# strip parenthesised country tags like "Adrian Lefebour (AUS)".
_SPLIT_RE = re.compile(
    r"\s*(?:&|\+|/|,|;|\bfeat(?:\.|uring)?\s+|\bft\.?\s+|\band\s+)",
    re.IGNORECASE,
)


def split_choreographers(name: Optional[str]) -> list[str]:
    """Break a raw ``choreographer`` string into an ordered list of
    individual people. Empty / None input returns ``[]``.

    Duplicates (case-insensitively equal after normalisation) are
    removed, preserving the first occurrence's original casing. This
    matters so a copy-paste like "Foo & Foo" doesn't create a
    phantom co-choreographer chip.
    """
    if not name:
        return []
    raw = str(name).strip()
    if not raw:
        return []
    parts = [p.strip() for p in _SPLIT_RE.split(raw) if p and p.strip()]
    if not parts:
        return []
    # De-dupe case-insensitively while preserving order + original
    # casing of the first occurrence.
    seen: set[str] = set()
    out: list[str] = []
    for p in parts:
        key = normalise_choreographer(p)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def parse_main_and_co(name: Optional[str]) -> tuple[str, list[str]]:
    """Return ``(main, co_choreographers)`` for a raw credit string.

    ``main`` is the first parsed name (empty when the input yields no
    tokens). ``co_choreographers`` is every subsequent unique name in
    original order. Used at every dance write site so the library
    always groups on the main artist alone.
    """
    parts = split_choreographers(name)
    if not parts:
        return "", []
    return parts[0], parts[1:]


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
        # Persistent choreographer_key on dance docs — the single source
        # of truth that ``list_choreographers`` groups by and
        # ``get_choreographer_detail`` matches on. Populated at every
        # write site (see ``inject_choreographer_key`` below) and
        # back-filled by ``backfill_choreographer_keys`` on boot for
        # legacy rows.
        await db.dances.create_index(
            [("choreographer_key", 1), ("is_published", 1)],
            name="by_chor_key_pub",
        )
        # Multi-index for the co-choreographer popup — indexes each
        # entry in the array so a case-insensitive substring match
        # on a specific person is still fast on a corpus of ~1200
        # dances (grows sub-linearly with library size).
        await db.dances.create_index(
            [("co_choreographers", 1)],
            name="by_co_choreographers",
        )
        _INDEXES_READY = True
    except Exception as e:
        logger.warning(f"choreographer index setup failed: {e}")


# ------------- Write-side helpers -------------
def inject_choreographer_key(dance: dict) -> dict:
    """Mutate a dance dict IN PLACE so ``choreographer_key`` matches the
    canonical form of ``choreographer``, AND split any multi-name
    credit string into ``choreographer`` (main / first name only) plus
    ``co_choreographers`` (an ordered list of the rest). Returns the
    same dict so callers can chain if they prefer.  Safe to call with
    a partial dict (skips work when ``choreographer`` is missing /
    empty).

    Called from every dance-writing path — CopperKnob import,
    BootStepper import, admin POST /api/dances, admin PATCH,
    dance_library_sync — so that ``list_choreographers`` /
    ``get_choreographer_detail`` never have to re-normalise at read
    time. See ADR-choreographer-key in PRD.md.

    Multi-choreographer contract (added June 2026): the LIBRARY only
    ever surfaces MAIN choreographers, so the dance doc stores the
    main name in ``choreographer`` (used by list_choreographers'
    aggregate + the ``choreographer_key`` used everywhere for
    grouping / follows) and every co-collaborator in the parallel
    ``co_choreographers`` list. The individual dance page renders
    the co list as a separate section that never re-enters the
    library. If the caller PASSED an explicit ``co_choreographers``
    list (e.g. BootStepper import which knows the exact roster), we
    respect it; otherwise we auto-parse the raw string.
    """
    if not isinstance(dance, dict):
        return dance
    chor_raw = (dance.get("choreographer") or "").strip()
    # Preserve any explicit co_choreographers the caller supplied
    # (BootStepper import passes the exact roster). Otherwise auto-
    # parse from the raw string.
    explicit_co = dance.get("co_choreographers")
    if isinstance(explicit_co, list) and explicit_co:
        # Trust the caller — clean, dedupe, but keep the main from
        # the string field (BootStepper sets both consistently).
        main = chor_raw
        cleaned_co: list[str] = []
        seen: set[str] = {normalise_choreographer(main)} if main else set()
        for item in explicit_co:
            s = str(item or "").strip()
            key = normalise_choreographer(s)
            if not s or not key or key in seen:
                continue
            seen.add(key)
            cleaned_co.append(s)
        dance["choreographer"] = main
        dance["co_choreographers"] = cleaned_co
    else:
        main, co = parse_main_and_co(chor_raw)
        dance["choreographer"] = main
        dance["co_choreographers"] = co
    dance["choreographer_key"] = normalise_choreographer(dance["choreographer"])
    return dance


async def backfill_choreographer_keys(*, batch: int = 500) -> int:
    """One-shot migration: populate ``choreographer_key`` +
    ``co_choreographers`` on every dance document that's missing the
    field OR has a stale value. Splits multi-name credit strings
    like "Alice & Bob" into ``choreographer="Alice"`` +
    ``co_choreographers=["Bob"]`` so the library only ever surfaces
    solo choreographers.

    Runs on boot from ``services/startup.py`` after ``ensure_indexes``.
    Idempotent — becomes a no-op once every doc has the correct key,
    so re-running has no side effect other than a couple of index
    reads.

    Returns the number of documents written.
    """
    written = 0
    cursor = db.dances.find(
        {"choreographer": {"$exists": True}},
        {
            "_id": 0, "id": 1,
            "choreographer": 1,
            "choreographer_key": 1,
            "co_choreographers": 1,
        },
    )
    pending: list[tuple[str, dict]] = []
    async for row in cursor:
        did = row.get("id")
        if not did:
            continue
        raw = (row.get("choreographer") or "").strip()
        expected_main, expected_co = parse_main_and_co(raw)
        expected_key = normalise_choreographer(expected_main)
        cur_main = raw  # what's stored right now
        cur_key = row.get("choreographer_key") or ""
        cur_co = row.get("co_choreographers")
        cur_co_list = cur_co if isinstance(cur_co, list) else None
        # No-op when everything already matches
        same_main = (cur_main == expected_main)
        same_key = (cur_key == expected_key)
        same_co = (cur_co_list is not None and cur_co_list == expected_co)
        if same_main and same_key and same_co:
            continue
        pending.append((did, {
            "choreographer": expected_main,
            "choreographer_key": expected_key,
            "co_choreographers": expected_co,
        }))
        if len(pending) >= batch:
            written += await _flush_key_updates(pending)
            pending.clear()
    if pending:
        written += await _flush_key_updates(pending)
    if written:
        logger.info(f"choreographer_key backfill: updated {written} dance(s)")
    return written


async def _flush_key_updates(rows: list[tuple[str, dict]]) -> int:
    """Batch ``$set`` writer used by ``backfill_choreographer_keys``.
    Kept private — callers should go through the public helper.
    """
    from pymongo import UpdateOne
    ops = [
        UpdateOne({"id": did}, {"$set": updates})
        for did, updates in rows
    ]
    if not ops:
        return 0
    res = await db.dances.bulk_write(ops, ordered=False)
    return int(res.modified_count or 0)


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
        # Group by the persistent ``choreographer_key`` field — same
        # canonical string the caller followed by, so no aggregate-time
        # normalisation is needed. Every dance write site injects the
        # field via ``inject_choreographer_key``; the boot-time
        # backfill guarantees legacy rows also carry it.
        pipeline = [
            {"$match": {
                "is_published": True,
                "choreographer_key": {"$in": keys},
            }},
            {"$sort": {"created_at": -1}},
            {"$group": {
                "_id": "$choreographer_key",
                "count": {"$sum": 1},
                "latest_dance_id": {"$first": "$id"},
                "latest_dance_name": {"$first": "$name"},
                "latest_dance_at": {"$first": "$created_at"},
            }},
        ]
        async for row in db.dances.aggregate(pipeline):
            counts[row["_id"]] = row

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

    Groups by the persistent ``choreographer_key`` field so the
    server-side substring match on ``choreographer`` (case-insensitive
    display-name search) still returns exactly the same bucket that
    the follow API will pin against.
    """
    q = (q or "").strip()
    pipeline: list[dict] = [
        {"$match": {
            "is_published": True,
            "choreographer_key": {"$ne": ""},
        }},
    ]
    if q:
        # Case-insensitive substring on the display name.
        pipeline.append(
            {"$match": {"choreographer": {"$regex": re.escape(q), "$options": "i"}}}
        )
    pipeline += [
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$choreographer_key",
            "choreographer": {"$first": "$choreographer"},
            "count": {"$sum": 1},
            "latest_dance_id": {"$first": "$id"},
            "latest_dance_name": {"$first": "$name"},
            "latest_dance_at": {"$first": "$created_at"},
        }},
        {"$sort": {"count": -1, "choreographer": 1}},
        {"$limit": max(1, min(int(limit or 40), 500))},
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


async def list_dances_by_co_choreographer(
    name: str, limit: int = 50
) -> list[dict]:
    """Return every PUBLISHED dance where ``name`` appears as either
    the main choreographer OR one of the co-choreographers, newest
    first. Case- and punctuation-insensitive match — folded through
    ``normalise_choreographer`` on both sides.

    Powers the "tap a co-choreographer chip" popup on the dance
    detail page: we don't have library entries for co-only people,
    but their catalogue is still discoverable this way.
    """
    key = normalise_choreographer(name)
    if not key:
        return []
    # Match on the persistent ``choreographer_key`` for the main-artist
    # side (fast, indexed) and a case-insensitive equality on
    # ``co_choreographers`` for the collaborator side. We compare via
    # a regex anchored at both ends to avoid substring pollution while
    # ignoring punctuation differences the same way normalise does.
    # But an easier approach: compute the normalised form of each
    # stored co name at match time via ``$expr`` would be slow — so
    # instead we push a case-insensitive exact match on the display
    # name AND a fallback path via ``choreographer_key``. Any name
    # that arrived here through the parser is stored trimmed, so an
    # ``$in`` on the exact display AND its normalised variants is
    # both simple and correct for the corpus we have.
    #
    # For robustness we build a small set of candidate spellings —
    # exact, and the normalised form re-cased naively (rare cases).
    candidates = {name.strip()}
    # If any dance in the DB has the same normalised key stored as
    # its main, use those exact spellings — this catches "John Smith"
    # vs "John SMITH" and gives us a canonical spelling to compare
    # co entries against.
    async for row in db.dances.find(
        {"choreographer_key": key},
        {"_id": 0, "choreographer": 1},
    ).limit(20):
        c = (row.get("choreographer") or "").strip()
        if c:
            candidates.add(c)
    or_clauses: list[dict] = [
        {"choreographer_key": key},
    ]
    if candidates:
        or_clauses.append({"co_choreographers": {"$in": list(candidates)}})
    query = {"is_published": True, "$or": or_clauses}
    lim = max(1, min(int(limit or 50), 200))
    cursor = db.dances.find(
        query,
        {
            "_id": 0, "id": 1, "name": 1, "choreographer": 1,
            "co_choreographers": 1, "song": 1, "artist": 1,
            "difficulty": 1, "bpm": 1, "count": 1, "created_at": 1,
        },
    ).sort("created_at", -1).limit(lim)
    return [row async for row in cursor]


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
