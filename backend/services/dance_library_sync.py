"""One-shot library verification + auto-sync against CopperKnob +
BootStepper. Also the entry-point for the monthly recurring check.

Strategy
--------
For every published dance:

1. **Search** both external providers by ``"<title> <choreographer>"``.
2. **Fuzzy match** each candidate to the local dance using a weighted
   score:
        title similarity      × 0.55
      + choreographer         × 0.35
      + count/wall match      × 0.10
   Only candidates with combined score ≥ 70/100 are considered.
3. Bucket the best match by confidence:

     * **≥ 85** (AUTO_APPLY_THRESHOLD)  → back-fill ref AND overwrite
                                           local fields where upstream
                                           has a non-empty different
                                           value. Every write is
                                           logged to ``dance_sync_log``.
     * **70–84** (REVIEW_THRESHOLD)     → back-fill ref only, flag on
                                           the Refresh Recommendations
                                           queue for manual review.
     * **< 70**                          → skip. Log ``unmatched`` in
                                           the sync log so admins can
                                           see coverage.

4. CopperKnob and BootStepper are processed **independently** — a
   dance can accept a match from one provider while remaining
   unmatched on the other.

The engine is idempotent: running it twice in a row is a no-op because
the second pass finds no drift.

Fields we sync
--------------
* ``name``           ← upstream ``title``
* ``choreographer``  ← upstream ``choreographer``
* ``song``           ← upstream ``song``
* ``artist``         ← upstream ``artist``
* ``count``          ← upstream ``count`` (as ``"<count>, <wall> wall"``)
* ``difficulty``     ← normalised upstream ``level``

**Never** overwritten: ``step_sheet``, ``step_sheet_image``, ``bpm``
(neither API exposes bpm reliably), ``description``, ``tags``,
``youtube_url``. ``bpm`` is left alone as the user's initial import
values are considered authoritative until we get a better source.

Audit trail
-----------
Every mutation writes a row to ``dance_sync_log``::

    {sync_id, dance_id, source, action, changed_fields,
     confidence, upstream_ref, ran_at}

* ``action``          "auto_applied" | "flagged_for_review" | "unmatched"
* ``changed_fields``  list of ``{field, old, new}`` — empty on
                      unmatched / no-change rows so admins can still
                      see coverage.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid
from difflib import SequenceMatcher
from typing import Optional

from core.database import db
from core.time_helpers import now_iso
from services import bootstepper as bs_svc
from services import copperknob as ck_svc

logger = logging.getLogger(__name__)

AUTO_APPLY_THRESHOLD = 0.85
REVIEW_THRESHOLD = 0.70
# Even at high composite score, auto-apply requires the RAW title
# similarity to clear this bar — this stops us from silently rewriting
# a dance's identity when the composite got carried by a strong
# choreographer / walls match despite a fuzzy title. "The Galway Girl"
# (Maggie Gallagher) vs "2 Galway Girls" (Maggie Gallagher) is
# ~0.855 composite but the titles are 0.75 similar — clearly a
# DIFFERENT dance.
AUTO_APPLY_TITLE_MIN = 0.85
# Title-specific stricter threshold — see _demote_low_confidence_name_changes.
NAME_AUTO_APPLY_THRESHOLD = 0.95

# Cap concurrent upstream calls per source. Slightly higher than the
# nightly drift-scan's serial 1 req/sec so a full sweep completes in
# ~15-20 min for a 1000-dance library, while still leaving upstream
# room to breathe.
CONCURRENCY_PER_SOURCE = 3

# Fields we sync (local key → upstream key on the normalised shape).
# NOTE: ``count`` intentionally re-formats to include wall — that's how
# our library stores it (``"32 count, 4 wall"``).
_METADATA_FIELDS = (
    "name",           # from title
    "choreographer",
    "song",
    "artist",
    "count",
    "difficulty",     # from level
)


# ---------------- Similarity helpers ----------------
_STRIP_RE = re.compile(r"[^a-z0-9]+")
# Choreographer noise-suffix stripper: "(USA)", "(CAN)", "- 1976",
# "aka Jane Doe" etc. Applied BEFORE fuzzy matching so we don't get
# false-diffs from purely-cosmetic upstream additions.
_CHOR_SUFFIX_RE = re.compile(
    r"\s*(?:[\(\[].+?[\)\]]|-\s*\d{4}.*|,\s*aka.*|\s*aka .+)$",
    re.IGNORECASE,
)
# Title noise-suffix stripper: language tags like ``(zh)``, ``(fr)`` and
# parenthetical annotations ``(P)`` that upstream sometimes appends.
# Also handles the case where upstream adds an ideogram translation.
_TITLE_SUFFIX_RE = re.compile(
    r"\s*(?:\((?:[a-z]{2,3}|P)\)|\([^\)]{0,60}\))\s*$",
    re.IGNORECASE,
)


def _norm(s: object) -> str:
    """Case-folded, punctuation-stripped, single-spaced form for
    fuzzy comparisons. Keeps international letters (``é``, ``ñ``) by
    treating them as ordinary word chars post-lower()."""
    if not s:
        return ""
    return _STRIP_RE.sub(" ", str(s).lower()).strip()


def _clean_title(name: str) -> str:
    """Strip cosmetic parenthetical suffixes from a title so
    ``"Mamma Maria"`` and ``"Mamma Maria (zh)"`` resolve to the
    same canonical form. Used for diff-suppression only — the fuzzy
    matcher still sees the full string so a real rename
    (``"Watermelon Crawl" → "Watermelon Sugar"``) still moves the
    confidence score."""
    if not name:
        return ""
    cleaned = name
    for _ in range(2):
        new = _TITLE_SUFFIX_RE.sub("", cleaned).strip()
        if new == cleaned:
            break
        cleaned = new
    return cleaned


def _clean_chor(name: str) -> str:
    """Strip cosmetic suffixes from a choreographer name so
    "Sue Lipscomb" and "Sue Lipscomb (USA)" resolve to the same
    canonical form. Used for BOTH fuzzy matching AND diff-suppression."""
    if not name:
        return ""
    cleaned = name
    # Loop-strip so "Bill Bader (CAN) - 1985" collapses cleanly.
    for _ in range(3):
        new = _CHOR_SUFFIX_RE.sub("", cleaned).strip()
        if new == cleaned:
            break
        cleaned = new
    return cleaned


def _titlecase_difficulty(s: str) -> str:
    """Upstream ``level`` is sometimes lowercased ("improver") — write
    our stored form as Title Case to match the rest of the library
    ("Improver", "Absolute Beginner")."""
    if not s:
        return s
    return " ".join(w[:1].upper() + w[1:].lower() for w in s.split())


def _ratio(a: str, b: str) -> float:
    """0-1 similarity via difflib. Fast enough for the ~10 candidates
    we compare per dance. Symmetric."""
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def _walls_from_count(count_str: str) -> Optional[str]:
    """Extract the walls token from a local ``count`` string
    (e.g. ``"32 count, 4 wall"`` → ``"4"``). Missing → None."""
    if not count_str:
        return None
    m = re.search(r"(\d+)\s*wall", str(count_str).lower())
    return m.group(1) if m else None


def _confidence(local: dict, upstream: dict) -> tuple[float, float]:
    """Weighted-average similarity in ``[0, 1]`` — used as the match
    threshold and the eventual confidence sort key.

    Weights: title 0.55, choreographer 0.35, walls exact match 0.10.
    Choreographer comparison strips cosmetic country / year suffixes
    so "Sue Lipscomb" and "Sue Lipscomb (USA)" score 1.0 instead of ~0.85.

    Returns ``(composite, title_ratio)`` so callers can apply title-
    specific safety thresholds (see ``AUTO_APPLY_TITLE_MIN``).
    """
    title = _ratio(local.get("name") or "", upstream.get("title") or "")
    chor = _ratio(
        _clean_chor(local.get("choreographer") or ""),
        _clean_chor(upstream.get("choreographer") or ""),
    )
    walls_local = _walls_from_count(local.get("count"))
    walls_upstream = str(upstream.get("wall") or "").strip()
    walls = (
        1.0 if walls_local and walls_upstream and walls_local == walls_upstream
        else (
            0.5 if walls_local and walls_upstream else 0.0
        )
    )
    composite = round(title * 0.55 + chor * 0.35 + walls * 0.10, 3)
    return composite, round(title, 3)


# ---------------- Field-diff helpers ----------------
def _format_count(upstream: dict) -> str:
    """Rebuild our library's ``count`` shape from upstream's split
    values so the diff engine has a like-for-like comparison."""
    count = str(upstream.get("count") or "").strip()
    wall = str(upstream.get("wall") or "").strip()
    if count and wall:
        return f"{count} count, {wall} wall"
    if count:
        return f"{count} count"
    return ""


def _upstream_field(field: str, upstream: dict) -> str:
    if field == "name":
        return (upstream.get("title") or "").strip()
    if field == "difficulty":
        # Normalize case so "improver" doesn't overwrite "Improver".
        return _titlecase_difficulty((upstream.get("level") or "").strip())
    if field == "count":
        return _format_count(upstream)
    return str(upstream.get(field) or "").strip()


def _count_number(count_str: str) -> Optional[str]:
    """Extract the leading numeric count from a count string
    (``"32 count, 4 wall"`` → ``"32"``, ``"32"`` → ``"32"``,
    ``"32 count"`` → ``"32"``). Missing → None."""
    if not count_str:
        return None
    m = re.match(r"\s*(\d+)", str(count_str))
    return m.group(1) if m else None


def _diff(local: dict, upstream: dict) -> list[dict]:
    """Return ``[{field, old, new}]`` for fields where upstream has a
    NON-EMPTY value that DIFFERS from local (case-insensitively). Never
    proposes emptying a field — a missing upstream value keeps the
    local one intact.

    Choreographer diff is suppressed when the ONLY difference is a
    cosmetic country / year suffix — see ``_clean_chor``.
    Title diff is suppressed when the ONLY difference is a language
    tag or parenthetical annotation — see ``_clean_title``.
    Count diff is suppressed when the count NUMBER matches and the
    only difference is that upstream is missing wall data (upstream
    APIs occasionally return counts without wall). ``64 count, 2 wall``
    vs upstream ``64 count`` is treated as identical.
    """
    out: list[dict] = []
    for f in _METADATA_FIELDS:
        theirs = _upstream_field(f, upstream)
        if not theirs:
            continue
        ours = str(local.get(f) or "").strip()
        if _norm(ours) == _norm(theirs):
            continue
        # Choreographer: skip cosmetic-suffix-only diffs.
        if f == "choreographer" and _norm(_clean_chor(ours)) == _norm(
            _clean_chor(theirs)
        ):
            continue
        # Title: skip language-tag / parenthetical-only diffs.
        if f == "name" and _norm(_clean_title(ours)) == _norm(
            _clean_title(theirs)
        ):
            continue
        # Count: skip diffs where count number matches AND upstream is
        # missing wall data (never DELETE our wall info to match a
        # less-detailed upstream). A missing upstream wall is data
        # we don't have from them — not a correction they're pushing.
        if f == "count":
            ours_num = _count_number(ours)
            theirs_num = _count_number(theirs)
            theirs_wall = _walls_from_count(theirs)
            if (
                ours_num
                and theirs_num
                and ours_num == theirs_num
                and not theirs_wall
            ):
                continue
        out.append({"field": f, "old": ours, "new": theirs})
    return out


def _demote_low_confidence_name_changes(
    diff: list[dict],
    confidence: float,
    title_ratio: float,
) -> tuple[list[dict], list[dict]]:
    """Split a diff into (auto_applicable, review_only) based on per-
    field confidence rules.

    IDENTITY fields (``name`` and ``choreographer``) auto-apply ONLY
    when the match is essentially certain:

      * composite ``confidence >= NAME_AUTO_APPLY_THRESHOLD`` (0.95), AND
      * raw title-similarity ``title_ratio >= AUTO_APPLY_TITLE_MIN`` (0.85).

    All other fields (song, artist, count, difficulty) use the looser
    ``AUTO_APPLY_THRESHOLD`` (0.85) that gates the whole write path.

    Rationale (SEC-003): a compromised or wrong upstream response could
    silently rewrite the dance's identity if we auto-applied identity
    fields at the same 0.85 threshold used for metadata polish. Requiring
    a 0.95 + title-floor double gate for identity fields caps the blast
    radius: the worst-case is a misspelled song title or difficulty
    label, never a mis-attributed dance.

    Previously we only demoted ``name``. Extended to ``choreographer``
    after the June 2026 security audit — see /app/memory/PRD.md.
    """
    identity_confidence_ok = (
        confidence >= NAME_AUTO_APPLY_THRESHOLD
        and title_ratio >= AUTO_APPLY_TITLE_MIN
    )
    if identity_confidence_ok:
        return diff, []
    identity_fields = {"name", "choreographer"}
    apply_now = [d for d in diff if d["field"] not in identity_fields]
    defer = [d for d in diff if d["field"] in identity_fields]
    return apply_now, defer


# ---------------- Provider abstractions ----------------
class _Provider:
    """Uniform (search + get_by_ref) interface over the two source
    services so the caller doesn't repeat the if/else dance."""

    def __init__(self, name: str) -> None:
        self.name = name

    async def search(self, q: str) -> list[dict]:
        raise NotImplementedError

    async def fetch(self, ref: str) -> dict | None:
        raise NotImplementedError

    def ref_field(self) -> str:
        raise NotImplementedError

    def url_field(self) -> str:
        raise NotImplementedError


class CopperKnobProvider(_Provider):
    def __init__(self) -> None:
        super().__init__("copperknob")

    async def search(self, q: str) -> list[dict]:
        try:
            res = await ck_svc.search(q, type_="all")
        except ck_svc.CopperKnobError:
            return []
        # CopperKnob wraps the array under ``data`` (``results`` is a
        # numeric total).
        return list(res.get("data") or [])[:10]

    async def fetch(self, ref: str) -> dict | None:
        try:
            return await ck_svc.get_by_ref(ref)
        except ck_svc.CopperKnobError:
            return None

    def ref_field(self) -> str:
        return "copperknob_ref"

    def url_field(self) -> str:
        return "copperknob_url"


class BootStepperProvider(_Provider):
    def __init__(self) -> None:
        super().__init__("bootstepper")

    async def search(self, q: str) -> list[dict]:
        try:
            res = await bs_svc.search(q, limit=10)
        except bs_svc.BootStepperError:
            return []
        return list(res.get("data") or [])[:10]

    async def fetch(self, ref: str) -> dict | None:
        try:
            return await bs_svc.get_by_id(ref)
        except bs_svc.BootStepperError:
            return None

    def ref_field(self) -> str:
        return "bootstepper_ref"

    def url_field(self) -> str:
        return "bootstepper_url"


# ---------------- Sync per-dance ----------------
async def _sync_dance_source(
    dance: dict,
    provider: _Provider,
    dry_run: bool = False,
) -> dict:
    """Process ONE (dance, provider) pair. Returns a compact result
    dict for the caller's aggregate."""
    q = f"{dance.get('name') or ''} {dance.get('choreographer') or ''}".strip()
    if not q:
        return {"action": "unmatched", "reason": "empty_query"}

    candidates = await provider.search(q)
    if not candidates:
        return {"action": "unmatched", "reason": "no_candidates"}

    # Rank by combined score; pick the best.
    scored = []
    for c in candidates:
        composite, title_ratio = _confidence(dance, c)
        scored.append((composite, title_ratio, c))
    scored.sort(key=lambda x: x[0], reverse=True)
    best_conf, best_title_ratio, best = scored[0]

    if best_conf < REVIEW_THRESHOLD:
        return {
            "action": "unmatched",
            "reason": "low_confidence",
            "best_conf": best_conf,
        }

    # We have at least a review-worthy match. Fetch full metadata via
    # get_by_ref for the definitive field values (search sometimes
    # returns truncated / stale fields).
    ref = str(best.get("ref") or best.get("id") or "").strip()
    if ref:
        detail = await provider.fetch(ref)
        if detail:
            best = detail

    diff = _diff(dance, best)
    # Split name changes below 0.95 confidence into a "review-only"
    # bucket so we don't accidentally rename "The Galway Girl" to
    # something upstream returned for a similar-titled dance.
    diff_apply, diff_defer = _demote_low_confidence_name_changes(
        diff, best_conf, best_title_ratio
    )
    action = (
        "auto_applied"
        if best_conf >= AUTO_APPLY_THRESHOLD
        else "flagged_for_review"
    )

    # Do the writes (unless dry-run).
    if not dry_run:
        set_ops: dict = {
            provider.ref_field(): ref or "",
            provider.url_field(): (best.get("url") or "").strip(),
        }
        if action == "auto_applied" and diff_apply:
            for row in diff_apply:
                set_ops[row["field"]] = row["new"]
            set_ops["updated_at"] = now_iso()
        # If the sync updated the ``choreographer`` field, re-derive the
        # persistent key AND re-split the multi-choreographer credit
        # string so ``co_choreographers`` stays in sync. Only fires
        # when the field actually changed — no wasted writes.
        if "choreographer" in set_ops:
            from services.choreographer_follows import (
                normalise_choreographer,
                parse_main_and_co,
            )
            raw = set_ops.get("choreographer") or ""
            main, co = parse_main_and_co(raw)
            set_ops["choreographer"] = main
            set_ops["co_choreographers"] = co
            set_ops["choreographer_key"] = normalise_choreographer(main)
        await db.dances.update_one({"id": dance["id"]}, {"$set": set_ops})
        # Persist audit log — records what was applied AND what was
        # deferred / flagged so admins have a full history of every
        # sync decision. ``flagged_for_review`` rows keep the proposed
        # diff in ``proposed_fields`` (never written to the dance).
        await db.dance_sync_log.insert_one({
            "sync_id": f"sync_{uuid.uuid4().hex[:12]}",
            "dance_id": dance["id"],
            "source": provider.name,
            "action": action,
            "changed_fields": diff_apply if action == "auto_applied" else [],
            "deferred_fields": diff_defer if action == "auto_applied" else [],
            "proposed_fields": diff if action == "flagged_for_review" else [],
            "confidence": best_conf,
            "title_ratio": best_title_ratio,
            "upstream_ref": ref,
            "upstream_url": (best.get("url") or "").strip(),
            "ran_at": now_iso(),
        })

    # Push anything the admin should still eyeball into the same
    # queue the nightly drift scanner uses:
    #   - action == flagged_for_review  → all diff rows
    #   - action == auto_applied but a NAME change got deferred
    review_fields = (
        diff if action == "flagged_for_review"
        else diff_defer
    )
    if not dry_run and review_fields:
        await db.dance_drift_flags.update_one(
            {"dance_id": dance["id"], "source": provider.name},
            {
                "$set": {
                    "differs_count": len(review_fields),
                    "drift_summary": ", ".join(
                        r["field"] for r in review_fields[:3]
                    ),
                    "fields": [
                        {"field": r["field"], "ours": r["old"], "theirs": r["new"]}
                        for r in review_fields[:5]
                    ],
                    "checked_at": now_iso(),
                    "confidence": best_conf,
                },
                "$setOnInsert": {"seen": False},
            },
            upsert=True,
        )

    return {
        "action": action,
        "confidence": best_conf,
        "changed_fields": diff_apply if action == "auto_applied" else [],
        "deferred_fields": diff_defer if action == "auto_applied" else [],
        "ref": ref,
    }


# ---------------- Orchestration ----------------
async def sync_library(dry_run: bool = False) -> dict:
    """Run BOTH providers over the full published library, honouring
    per-source concurrency. Returns a summary dict."""
    started_at = time.time()

    dances = await db.dances.find(
        {"is_published": True},
        {"_id": 0, "id": 1, "name": 1, "choreographer": 1, "song": 1,
         "artist": 1, "count": 1, "difficulty": 1, "copperknob_ref": 1,
         "bootstepper_ref": 1},
    ).to_list(length=10000)
    total = len(dances)

    counters = {
        "copperknob": {"auto_applied": 0, "flagged": 0, "unmatched": 0, "processed": 0},
        "bootstepper": {"auto_applied": 0, "flagged": 0, "unmatched": 0, "processed": 0},
    }

    # Per-source semaphores keep upstream load bounded (~3 in-flight
    # per provider). Runs both sources in parallel.
    async def run_source(prov: _Provider) -> None:
        sema = asyncio.Semaphore(CONCURRENCY_PER_SOURCE)

        async def _one(d: dict) -> None:
            async with sema:
                try:
                    result = await _sync_dance_source(d, prov, dry_run=dry_run)
                except Exception as e:  # noqa: BLE001
                    logger.warning("sync failed for %s @ %s: %s", d.get("id"), prov.name, e)
                    result = {"action": "unmatched", "reason": "exception"}
                bucket = counters[prov.name]
                bucket["processed"] += 1
                action = result.get("action")
                if action == "auto_applied":
                    bucket["auto_applied"] += 1
                elif action == "flagged_for_review":
                    bucket["flagged"] += 1
                else:
                    bucket["unmatched"] += 1
                # Progress heartbeat every 25 dances
                if bucket["processed"] % 25 == 0:
                    await db.dance_sync_status.update_one(
                        {"_id": "full_sync"},
                        {"$set": {prov.name: bucket, "updated_at": now_iso()}},
                        upsert=True,
                    )

        await asyncio.gather(*[_one(d) for d in dances])

    await db.dance_sync_status.update_one(
        {"_id": "full_sync"},
        {
            "$set": {
                "state": "running",
                "started_at": started_at,
                "total": total,
                "copperknob": counters["copperknob"],
                "bootstepper": counters["bootstepper"],
            }
        },
        upsert=True,
    )

    await asyncio.gather(
        run_source(CopperKnobProvider()),
        run_source(BootStepperProvider()),
    )

    elapsed = time.time() - started_at
    summary = {
        "state": "done",
        "finished_at": now_iso(),
        "elapsed_sec": int(elapsed),
        "total": total,
        "copperknob": counters["copperknob"],
        "bootstepper": counters["bootstepper"],
        "dry_run": bool(dry_run),
    }
    await db.dance_sync_status.update_one(
        {"_id": "full_sync"}, {"$set": summary}, upsert=True
    )
    logger.info(
        "sync_library complete in %.1fm — %s",
        elapsed / 60,
        summary,
    )
    return summary


async def ensure_indexes() -> None:
    """Idempotent index setup — called from services/startup.py."""
    try:
        await db.dance_sync_log.create_index(
            [("dance_id", 1), ("source", 1), ("ran_at", -1)],
            name="by_dance_source_recent",
        )
        await db.dance_sync_log.create_index(
            [("ran_at", -1)], name="recent_syncs"
        )
    except Exception as e:
        logger.warning(f"dance_sync_log index setup failed: {e}")
