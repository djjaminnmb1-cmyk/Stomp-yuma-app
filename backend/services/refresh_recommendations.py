"""Nightly "refresh recommendations" scanner.

For every published dance in the library that carries a CopperKnob or
BootStepper reference, we periodically re-fetch the upstream metadata
and diff it against what we've stored. Any dance whose upstream data
has drifted (e.g. choreographer typo corrected, better BPM tag, new
count string) is flagged in ``dance_drift_flags`` so an admin can
review + accept the update in one tap.

Design goals
------------
* **Nice to providers**: we rate-limit to ~1 req/sec and cap the batch
  at ``MAX_PER_RUN`` per source per invocation. A full library sweep
  therefore happens over multiple nightly runs — that's fine, the
  drift signal is stable across days.
* **Idempotent**: flags are upserted keyed on
  ``(dance_id, source)``; re-checking a dance just refreshes the row.
* **Recover-on-fix**: if a subsequent run finds no drift on a
  previously-flagged pair, the flag is deleted rather than left
  stale.
* **Admin-scoped**: no user-facing surface — flags live entirely in
  admin land.

Collection schema
-----------------
``dance_drift_flags``:
    ``{dance_id, source, checked_at, differs_count, drift_summary,
       fields, seen}``
    * ``source``          "copperknob" | "bootstepper"
    * ``differs_count``   int (0 removes the row; >0 keeps it)
    * ``drift_summary``   short human string ("Choreographer spelling · BPM")
    * ``fields``          [{field, ours, theirs}] — first 5 for preview
    * ``seen``            admin has viewed / dismissed
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from core.database import db
from core.time_helpers import now_iso
from services import bootstepper as bs_svc
from services import copperknob as ck_svc

logger = logging.getLogger(__name__)

# How many dances to check per (source, run). Keeps upstream rate
# usage sane — a full library sweep completes over multiple nightly
# runs, which is fine because drift is a slow signal.
MAX_PER_RUN = 60

# Sleep between provider calls to stay well below any implicit
# per-second cap. 1.2s = ~50 calls/minute per provider max.
REQUEST_INTERVAL_SEC = 1.2


_INDEXES_READY = False


async def ensure_indexes() -> None:
    global _INDEXES_READY
    if _INDEXES_READY:
        return
    try:
        await db.dance_drift_flags.create_index(
            [("dance_id", 1), ("source", 1)],
            unique=True,
            name="uniq_drift_dance_source",
        )
        await db.dance_drift_flags.create_index(
            [("seen", 1), ("checked_at", -1)],
            name="by_seen_recent",
        )
        _INDEXES_READY = True
    except Exception as e:
        logger.warning(f"drift_flags index setup failed: {e}")


def _norm(s: Any) -> str:
    return (str(s or "")).strip().lower()


def _diff_fields(ours: dict, theirs: dict) -> list[dict]:
    """Return a list of ``{field, ours, theirs}`` for meaningfully
    different fields. Only compares the metadata fields we routinely
    edit — never touches step-sheet content (we're not licensed).

    "Meaningful" = string-normalised inequality, ignoring pure
    whitespace + case differences. Empty-vs-non-empty counts, because
    filling in an empty BPM is often exactly what the refresh flow
    is meant to surface.
    """
    checks = [
        ("name", ours.get("name") or "", theirs.get("title") or ""),
        ("choreographer",
         ours.get("choreographer") or "",
         theirs.get("choreographer") or ""),
        ("song", ours.get("song") or "", theirs.get("song") or ""),
        ("artist", ours.get("artist") or "", theirs.get("artist") or ""),
        ("count", ours.get("count") or "", theirs.get("count") or ""),
        # Difficulty maps to "level" upstream; treat missing → any as
        # informative but ignore Beginner→beginner casing.
        ("difficulty",
         ours.get("difficulty") or "",
         theirs.get("level") or ""),
    ]
    out: list[dict] = []
    for field, o, t in checks:
        if _norm(o) == _norm(t):
            continue
        out.append({
            "field": field,
            "ours": str(o)[:200],
            "theirs": str(t)[:200],
        })
    return out


def _summarise(fields: list[dict]) -> str:
    """Concise human string for the admin list row. Keeps to 3 items
    so the row stays single-line even on iPhone SE widths."""
    if not fields:
        return ""
    labels = {
        "name": "Title",
        "choreographer": "Choreographer",
        "song": "Song",
        "artist": "Artist",
        "count": "Count",
        "difficulty": "Difficulty",
    }
    top = [labels.get(f["field"], f["field"]) for f in fields[:3]]
    tail = f" +{len(fields) - 3}" if len(fields) > 3 else ""
    return " · ".join(top) + tail


async def _upsert_flag(
    dance_id: str,
    source: str,
    fields: list[dict],
) -> None:
    """Persist / refresh a flag row.

    When ``fields`` is empty (previously-flagged dance now aligns
    with upstream) we SOFT-CLEAR the row — ``differs_count=0`` and
    ``cleared_at`` timestamp. Never a hard delete: production
    deployment policy forbids scheduled background jobs from
    removing records. The read helpers below filter cleared rows
    out of the admin queue so the UX is identical.
    """
    if not fields:
        await db.dance_drift_flags.update_one(
            {"dance_id": dance_id, "source": source},
            {
                "$set": {
                    "differs_count": 0,
                    "drift_summary": "",
                    "fields": [],
                    "cleared_at": now_iso(),
                    "checked_at": now_iso(),
                    # Auto-mark as seen so a cleared drift doesn't
                    # stay on the admin's unseen badge.
                    "seen": True,
                },
            },
            # No upsert — no reason to create a "clean" row from
            # nothing. Only convert an EXISTING flag to cleared.
            upsert=False,
        )
        return
    await db.dance_drift_flags.update_one(
        {"dance_id": dance_id, "source": source},
        {
            "$set": {
                "differs_count": len(fields),
                "drift_summary": _summarise(fields),
                "fields": fields[:5],  # cap preview to 5
                "checked_at": now_iso(),
                # Clearing this out if a previously-cleared row
                # regains drift — otherwise a re-emerged drift
                # would look like a cleared row in the admin UI.
                "cleared_at": "",
                # Only mark unseen when a NEW flag pops up. If the row
                # already existed and admin already dismissed it, we
                # don't want to re-nag them for the SAME drift — but
                # we DO want to re-surface when the field set changes.
            },
            "$setOnInsert": {"seen": False},
        },
        upsert=True,
    )


async def _round_robin_pick(source: str, limit: int) -> list[dict]:
    """Pick ``limit`` dances to check for the given source, oldest
    ``checked_at`` first so we naturally rotate through the whole
    library across nights. Never-checked dances have no flag row and
    therefore no ``checked_at``; MongoDB sorts nulls first — perfect.
    """
    ref_field = "copperknob_ref" if source == "copperknob" else "bootstepper_ref"
    # Fetch dances that carry the ref and are published, joined with
    # last-checked timestamps from the flag collection.
    pipeline: list[dict] = [
        {"$match": {"is_published": True, ref_field: {"$ne": ""}}},
        {"$lookup": {
            "from": "dance_drift_flags",
            "let": {"did": "$id"},
            "pipeline": [
                {"$match": {"$expr": {"$and": [
                    {"$eq": ["$dance_id", "$$did"]},
                    {"$eq": ["$source", source]},
                ]}}},
                {"$project": {"_id": 0, "checked_at": 1, "seen": 1}},
            ],
            "as": "flag",
        }},
        {"$addFields": {
            "_checked_at": {
                "$ifNull": [{"$first": "$flag.checked_at"}, ""],
            },
        }},
        {"$sort": {"_checked_at": 1}},  # never-checked first
        {"$limit": max(1, min(limit, 500))},
        {"$project": {
            "_id": 0,
            "id": 1,
            "name": 1,
            "choreographer": 1,
            "song": 1,
            "artist": 1,
            "count": 1,
            "difficulty": 1,
            "copperknob_ref": 1,
            "bootstepper_ref": 1,
        }},
    ]
    return [d async for d in db.dances.aggregate(pipeline)]


async def _check_one(dance: dict, source: str) -> Optional[list[dict]]:
    """Fetch upstream metadata + diff. Returns the field list, or
    None on transport / upstream errors so the caller keeps going."""
    try:
        if source == "copperknob":
            ref = (dance.get("copperknob_ref") or "").strip()
            if not ref:
                return []
            theirs = await ck_svc.get_by_ref(ref)
        else:
            bs_id = (dance.get("bootstepper_ref") or "").strip()
            if not bs_id:
                return []
            theirs = await bs_svc.get_by_id(bs_id)
    except (ck_svc.CopperKnobError, bs_svc.BootStepperError) as e:
        status = getattr(e, "status", 0)
        # 404 upstream → the ref is dead; treat as no-drift so we
        # don't spam the queue. Anything else, skip this pass.
        if status == 404:
            return []
        logger.info("drift check upstream error (%s): %s", source, e)
        return None
    except Exception as e:  # noqa: BLE001
        logger.info("drift check crashed (%s): %s", source, e)
        return None
    return _diff_fields(dance, theirs)


async def scan_source(source: str, limit: int = MAX_PER_RUN) -> dict:
    """Run one round of drift checks for the given source. Returns a
    small summary dict for logging."""
    checks = 0
    flagged = 0
    cleared = 0
    dances = await _round_robin_pick(source, limit)
    for d in dances:
        fields = await _check_one(d, source)
        checks += 1
        if fields is None:
            # transient upstream error; skip this dance
            await asyncio.sleep(REQUEST_INTERVAL_SEC)
            continue
        # Was this pair previously flagged? If so and now clean, clear it.
        prev = await db.dance_drift_flags.find_one(
            {"dance_id": d["id"], "source": source}, {"_id": 0}
        )
        await _upsert_flag(d["id"], source, fields)
        if fields:
            flagged += 1
        elif prev:
            cleared += 1
        await asyncio.sleep(REQUEST_INTERVAL_SEC)
    return {
        "source": source,
        "checked": checks,
        "flagged": flagged,
        "cleared": cleared,
    }


async def run_nightly_scan() -> dict:
    """Entry-point invoked by the scheduler. Runs both sources in
    sequence. Any exception is caught + logged so a single bad night
    never breaks subsequent runs.
    """
    await ensure_indexes()
    total: dict = {"runs": []}
    for source in ("copperknob", "bootstepper"):
        try:
            summary = await scan_source(source, MAX_PER_RUN)
            total["runs"].append(summary)
            logger.info(
                "drift-scan %s: checked=%s flagged=%s cleared=%s",
                summary["source"],
                summary["checked"],
                summary["flagged"],
                summary["cleared"],
            )
        except Exception as e:  # noqa: BLE001
            logger.exception("drift-scan crashed for %s: %s", source, e)
    total["finished_at"] = now_iso()
    return total


# ---------------- Admin read helpers ----------------
async def list_flags(seen: Optional[bool] = None, limit: int = 200) -> list[dict]:
    """Return the current flag queue, joined with the dance's basic
    metadata so the admin list can render without extra round-trips.

    Filters out soft-cleared rows (``differs_count == 0``) — a
    cleared row is preserved for audit but never surfaces here.
    """
    query: dict = {"differs_count": {"$gt": 0}}
    if seen is not None:
        query["seen"] = bool(seen)
    rows = await db.dance_drift_flags.find(
        query, {"_id": 0}
    ).sort("checked_at", -1).limit(max(1, min(limit, 500))).to_list(limit)
    if not rows:
        return []
    dance_ids = list({r["dance_id"] for r in rows})
    names: dict[str, dict] = {}
    async for d in db.dances.find(
        {"id": {"$in": dance_ids}},
        {"_id": 0, "id": 1, "name": 1, "choreographer": 1, "difficulty": 1},
    ):
        names[d["id"]] = d
    out: list[dict] = []
    for r in rows:
        d = names.get(r["dance_id"]) or {}
        out.append({
            **r,
            "dance_name": d.get("name", "") or "",
            "dance_choreographer": d.get("choreographer", "") or "",
            "dance_difficulty": d.get("difficulty", "") or "",
            "dance_exists": bool(d),
        })
    return out


async def counts() -> dict:
    """Quick totals for the admin badge / dashboard.

    Soft-cleared rows (``differs_count == 0``) are excluded from
    every counter — they exist only for audit and must never
    inflate the admin nag badge.
    """
    unseen = await db.dance_drift_flags.count_documents(
        {"seen": False, "differs_count": {"$gt": 0}}
    )
    total = await db.dance_drift_flags.count_documents(
        {"differs_count": {"$gt": 0}}
    )
    return {"unseen": int(unseen), "total": int(total)}


async def mark_seen(
    dance_id: str, source: Optional[str] = None
) -> int:
    q: dict = {"dance_id": dance_id}
    if source:
        q["source"] = source
    res = await db.dance_drift_flags.update_many(q, {"$set": {"seen": True}})
    return int(res.modified_count or 0)


async def dismiss(dance_id: str, source: Optional[str] = None) -> int:
    """Permanently remove flag rows for the pair (admin says "not
    stale"). Won't come back unless a future scan detects new drift."""
    q: dict = {"dance_id": dance_id}
    if source:
        q["source"] = source
    res = await db.dance_drift_flags.delete_many(q)
    return int(res.deleted_count or 0)
