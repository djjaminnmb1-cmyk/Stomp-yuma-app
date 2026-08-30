"""Merged external-search: one query → CopperKnob + BootStepper in
parallel, de-duplicated on the fly, sorted by relevance signal.

Why
---
Users hitting "Search externally" from the Library empty-state
shouldn't have to know or care about the difference between the two
directories. A single search pulls both, merges records that clearly
represent the same dance (e.g. same choreographer + same title), and
returns a single unified list where each row carries the union of
its provider metadata + a canonical ``sources`` array.

The de-dupe rules are deliberately conservative — a false-merge
would hide a legitimate second variant of a dance. When in doubt we
keep both.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from core.security import get_current_user
from services import bootstepper as bs_svc
from services import copperknob as ck_svc
from services import dance_dedupe

logger = logging.getLogger(__name__)
router = APIRouter()


def _key_for_merge(item: dict) -> str:
    """Cheap key used to bucket results that likely represent the
    same dance. Combines normalised title + normalised choreographer
    surname (last word only — copes with "Bev Vinge" vs "Beverley
    Vinge" style variants).

    Deliberately narrow: if either component is empty we return an
    empty key which means "don't merge with anything else".
    """
    title = dance_dedupe._normalise(item.get("title") or "")
    chor = dance_dedupe._normalise(item.get("choreographer") or "")
    if not title or not chor:
        return ""
    chor_last = chor.split(" ")[-1] if chor else ""
    return f"{title}::{chor_last}"


async def _annotate_ck_batch(items: list[dict]) -> list[dict]:
    """Attach ``existing_dance`` to a whole batch of CopperKnob rows
    via the shared cross-provider dedupe service (same signals as
    the write-side import flow uses)."""
    return await _annotate_batch(items, source="copperknob")


async def _annotate_bs_batch(items: list[dict]) -> list[dict]:
    return await _annotate_batch(items, source="bootstepper")


async def _annotate_batch(items: list[dict], *, source: str) -> list[dict]:
    out: list[dict] = []
    for it in items:
        match = await dance_dedupe.find_duplicate(it, source=source)
        annotated = {**it}
        if match:
            annotated["existing_dance"] = {
                "id": match["id"],
                "name": match.get("name", ""),
                "difficulty": match.get("difficulty", ""),
                "has_copperknob_ref": bool(match.get("copperknob_ref")),
                "has_bootstepper_ref": bool(match.get("bootstepper_ref")),
            }
        out.append(annotated)
    return out


def _merge_records(ck: dict, bs: dict) -> dict:
    """Fold a CopperKnob + BootStepper row that share a merge-key
    into a single unified card the client renders once.

    We keep the FIRST non-empty value for every metadata field
    (order: CopperKnob then BootStepper — arbitrary but stable).
    Provider-specific fields are namespaced under their prefix.
    ``existing_dance`` from either wins (they agree by definition
    at this point).
    """
    def pick(a: Any, b: Any) -> Any:
        s = str(a or "").strip()
        return s if s else str(b or "").strip()

    return {
        # Canonical fields (populated from whichever provider had them).
        "title": pick(ck.get("title"), bs.get("title")),
        "choreographer": pick(ck.get("choreographer"), bs.get("choreographer")),
        "choreographer_country": pick(
            ck.get("choreographer_country"), bs.get("choreographer_country")
        ),
        "count": pick(ck.get("count"), bs.get("count")),
        "wall": pick(ck.get("wall"), bs.get("wall")),
        "level": pick(ck.get("level"), bs.get("level")),
        "music": pick(ck.get("music"), bs.get("music")),
        "song": pick(ck.get("song"), bs.get("song")),
        "artist": pick(ck.get("artist"), bs.get("artist")),
        # Provider references — each side keeps its own so downstream
        # imports know which endpoint to hit.
        "copperknob": {
            "ref": ck.get("ref") or ck.get("id") or "",
            "url": ck.get("url") or "",
        },
        "bootstepper": {
            "id": bs.get("id") or bs.get("ref") or "",
            "url": bs.get("url") or "",
        },
        "sources": ["copperknob", "bootstepper"],
        "existing_dance": ck.get("existing_dance") or bs.get("existing_dance"),
    }


def _wrap_single(item: dict, source: str) -> dict:
    """Wrap a single-provider row into the unified shape."""
    ref = (item.get("ref") or item.get("id") or "").strip()
    return {
        "title": item.get("title", ""),
        "choreographer": item.get("choreographer", ""),
        "choreographer_country": item.get("choreographer_country", ""),
        "count": item.get("count", ""),
        "wall": item.get("wall", ""),
        "level": item.get("level", ""),
        "music": item.get("music", ""),
        "song": item.get("song", ""),
        "artist": item.get("artist", ""),
        "copperknob": (
            {"ref": ref, "url": item.get("url", "")}
            if source == "copperknob"
            else {"ref": "", "url": ""}
        ),
        "bootstepper": (
            {"id": ref, "url": item.get("url", "")}
            if source == "bootstepper"
            else {"id": "", "url": ""}
        ),
        "sources": [source],
        "existing_dance": item.get("existing_dance"),
    }


def _rank_key(row: dict, query: str) -> tuple:
    """Sort key: results that appear on BOTH providers first, then
    ones whose title exactly starts with the query, then everything
    else alphabetically. Sort is stable so ties preserve insertion
    order (which happens to be CopperKnob → BootStepper)."""
    q = (query or "").strip().lower()
    both = 0 if len(row.get("sources") or []) > 1 else 1
    title_l = (row.get("title") or "").lower()
    starts_with = 0 if q and title_l.startswith(q) else 1
    return (both, starts_with, title_l)


@router.get("/external-search")
async def merged_external_search(
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(30, ge=1, le=60),
    _user: dict = Depends(get_current_user),
):
    """Run one query against CopperKnob and BootStepper in parallel,
    then merge + de-dupe.

    Never fails the whole call because one provider is down — a
    failure from CopperKnob is degraded to an empty list and its
    error is reported in the ``providers`` block so the UI can
    surface a "CopperKnob is unavailable, showing BootStepper only"
    banner. Same the other way.
    """
    query = q.strip()
    if len(query) < 2:
        raise HTTPException(400, "Search query must be at least 2 characters")

    async def _ck() -> tuple[list[dict], str | None]:
        try:
            payload = await ck_svc.search(query, "all")
            return payload.get("data", []), None
        except ck_svc.CopperKnobError as e:
            logger.info("Merged search: CK failure — %s", e)
            return [], str(e)

    async def _bs() -> tuple[list[dict], str | None]:
        try:
            payload = await bs_svc.search(query, limit)
            return payload.get("data", []), None
        except bs_svc.BootStepperError as e:
            logger.info("Merged search: BS failure — %s", e)
            return [], str(e)

    (ck_raw, ck_err), (bs_raw, bs_err) = await asyncio.gather(_ck(), _bs())
    ck_items = await _annotate_ck_batch(ck_raw)
    bs_items = await _annotate_bs_batch(bs_raw)

    # ---- Merge on the (title, choreographer surname) key ----
    bs_by_key: dict[str, dict] = {}
    for it in bs_items:
        k = _key_for_merge(it)
        if k:
            bs_by_key.setdefault(k, it)

    merged: list[dict] = []
    consumed_bs_keys: set[str] = set()
    for ck in ck_items:
        k = _key_for_merge(ck)
        if k and k in bs_by_key:
            merged.append(_merge_records(ck, bs_by_key[k]))
            consumed_bs_keys.add(k)
        else:
            merged.append(_wrap_single(ck, "copperknob"))
    for bs in bs_items:
        k = _key_for_merge(bs)
        if k in consumed_bs_keys:
            continue
        merged.append(_wrap_single(bs, "bootstepper"))

    merged.sort(key=lambda r: _rank_key(r, query))
    merged = merged[:limit]

    return {
        "query": query,
        "results": len(merged),
        "providers": {
            "copperknob": {
                "count": len(ck_items),
                "error": ck_err,
            },
            "bootstepper": {
                "count": len(bs_items),
                "error": bs_err,
            },
        },
        "data": merged,
    }
