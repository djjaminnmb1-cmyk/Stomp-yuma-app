"""Bulk import from CopperKnob + BootStepper.

Why
---
Adding 20 dances one-by-one after a "widen the search" moment is
painful. This route lets an admin/editor POST an array of
``{source, ref}`` entries and receive per-item results in a single
round-trip. Duplicate detection is applied to every entry so the
same call also acts as a preview: the admin gets back a clear list
of which ones were newly-imported vs. skipped vs. errored.

Draft-first behaviour is preserved — every newly-created row is
``is_published=false`` unless the caller opts in per-entry OR
passes ``publish_all=true`` at the top level. This mirrors the
single-item flow.

Never overwrites CopperKnob or BootStepper data on existing rows.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from core.database import db
from core.security import require_admin_or_editor
from core.serialize import youtube_search_url
from core.time_helpers import now_iso
from services import bootstepper as bs_svc
from services import copperknob as ck_svc
from services import dance_dedupe

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------- Difficulty / count helpers ----------------
# Duplicated intentionally from the per-provider routes so this
# module is self-contained. Both providers use the same enum on our
# side ("Absolute Beginner" ... "Advanced").

def _difficulty_from_level(level: str) -> str:
    if not level:
        return "Improver"
    s = level.lower().strip()
    if "absolute beginner" in s:
        return "Absolute Beginner"
    if "high improver" in s or ("improver" in s and "high" in s):
        return "High Improver"
    if "improver" in s:
        return "Improver"
    if "beginner" in s:
        return "Beginner"
    if "intermediate" in s:
        return "Intermediate"
    if "advanced" in s:
        return "Advanced"
    return "Improver"


def _count_string(item: dict) -> str:
    c = str(item.get("count") or "").strip()
    w = str(item.get("wall") or "").strip()
    parts: list[str] = []
    if c and c != "0":
        parts.append(f"{c} count")
    if w and w != "0":
        parts.append(f"{w} wall")
    return ", ".join(parts)


# ---------------- Doc builder ----------------


def _doc_from_external(
    item: dict,
    *,
    source: str,
    is_published: bool,
    user: dict,
) -> dict:
    """Build a full ``dances`` document from a normalised external
    item. Called once per entry after dedupe has decided we should
    actually insert. Never fills the OTHER provider's ref/URL — so a
    BS-source import leaves ``copperknob_ref`` empty (and vice
    versa), preserving the "one ref, one provider" contract.
    """
    ref = (item.get("id") or item.get("ref") or "").strip()
    if source == "copperknob":
        ref = ref.upper()
    name = (item.get("title") or "").strip()
    chor = (item.get("choreographer") or "").strip()
    country = (item.get("choreographer_country") or "").strip()
    song = (item.get("song") or "").strip()
    artist = (item.get("artist") or "").strip()

    doc: dict = {
        "id": f"dance_{uuid.uuid4().hex[:10]}",
        "name": name,
        "choreographer": chor,
        "choreographer_country": country,
        "song": song,
        "artist": artist,
        "difficulty": _difficulty_from_level(item.get("level", "")),
        "bpm": None,
        "count": _count_string(item),
        "youtube_url": youtube_search_url(f"{name} {chor} line dance"),
        "step_sheet": "",
        "step_sheet_image": "",
        "description": "",
        "tags": [],
        "copperknob_url": (
            item.get("url", "") if source == "copperknob" else ""
        ),
        "bootstepper_url": (
            item.get("url", "") if source == "bootstepper" else ""
        ),
        "copperknob_ref": ref if source == "copperknob" else "",
        "bootstepper_ref": ref if source == "bootstepper" else "",
        "is_published": bool(is_published),
        "created_by": user["user_id"],
        "created_by_name": user.get("name", ""),
        "created_at": now_iso(),
        "imported_from": {
            "source": source,
            "ref": ref,
            "url": item.get("url", ""),
            "at": now_iso(),
            "by": user["user_id"],
            "batch": True,
        },
    }
    return doc


# ---------------- Request/response models ----------------


class BulkImportEntry(BaseModel):
    """One line in the batch. ``ref`` is CopperKnob's ref string or
    BootStepper's opaque id — both work in the same field."""

    source: str = Field(..., description="Either 'copperknob' or 'bootstepper'")
    ref: str = Field(..., min_length=1)
    is_published: Optional[bool] = None

    @field_validator("source")
    @classmethod
    def _valid_source(cls, v: str) -> str:
        v = (v or "").lower().strip()
        if v not in ("copperknob", "bootstepper"):
            raise ValueError("source must be 'copperknob' or 'bootstepper'")
        return v


class BulkImportBody(BaseModel):
    entries: list[BulkImportEntry] = Field(..., min_length=1, max_length=50)
    publish_all: bool = False
    """When ``True`` every newly-created row is is_published=True
    unless the entry explicitly overrides. Kept off by default so a
    tap-happy batch doesn't push half-reviewed metadata live."""


# ---------------- Endpoint ----------------


@router.post("/dances/bulk-from-external")
async def bulk_import(
    body: BulkImportBody,
    user: dict = Depends(require_admin_or_editor),
):
    """Import many external dances in one call.

    Returns per-entry results:
      - ``imported`` — created a new listing (``dance_id`` filled)
      - ``skipped_duplicate`` — matched an existing dance
        (``existing_dance_id`` filled)
      - ``error`` — external fetch failed or metadata was invalid
        (``error`` filled)

    Order of the results array mirrors the order of ``entries`` so
    the client can render them in-place.
    """
    results: list[dict] = []
    imported_count = 0
    skipped_count = 0
    error_count = 0

    for entry in body.entries:
        result: dict = {
            "source": entry.source,
            "ref": entry.ref,
            "status": "error",
        }

        # 1) Fetch the external record — never abort the whole batch
        #    on a single fetch failure.
        try:
            if entry.source == "copperknob":
                item = await ck_svc.get_by_ref(entry.ref)
            else:
                item = await bs_svc.get_by_id(entry.ref)
        except (ck_svc.CopperKnobError, bs_svc.BootStepperError) as e:
            result["status"] = "error"
            result["error"] = str(e)
            error_count += 1
            results.append(result)
            continue

        # 2) Duplicate check (cross-provider).
        try:
            dup = await dance_dedupe.find_duplicate(item, source=entry.source)
        except Exception as e:  # noqa: BLE001 — defensive
            logger.exception("Bulk dedupe crash on %s/%s: %s", entry.source, entry.ref, e)
            result["status"] = "error"
            result["error"] = "Internal dedupe failure"
            error_count += 1
            results.append(result)
            continue

        if dup:
            result["status"] = "skipped_duplicate"
            result["existing_dance_id"] = dup["id"]
            result["existing_dance_name"] = dup.get("name", "")
            result["has_copperknob_ref"] = bool(dup.get("copperknob_ref"))
            result["has_bootstepper_ref"] = bool(dup.get("bootstepper_ref"))
            skipped_count += 1
            results.append(result)
            continue

        # 3) Insert. Validate that we at least got a title.
        if not (item.get("title") or "").strip():
            result["status"] = "error"
            result["error"] = "External record has no title"
            error_count += 1
            results.append(result)
            continue

        publish = (
            entry.is_published
            if entry.is_published is not None
            else body.publish_all
        )
        doc = _doc_from_external(
            item,
            source=entry.source,
            is_published=publish,
            user=user,
        )
        try:
            await db.dances.insert_one(doc)
        except Exception as e:  # noqa: BLE001
            logger.exception("Bulk insert failed on %s/%s: %s", entry.source, entry.ref, e)
            result["status"] = "error"
            result["error"] = "Insert failed"
            error_count += 1
            results.append(result)
            continue

        result["status"] = "imported"
        result["dance_id"] = doc["id"]
        result["dance_name"] = doc["name"]
        result["is_published"] = bool(publish)
        imported_count += 1
        results.append(result)

    return {
        "imported": imported_count,
        "skipped_duplicates": skipped_count,
        "errors": error_count,
        "total": len(body.entries),
        "results": results,
    }


# ---------------- Preview (dry-run) ----------------


class BulkPreviewBody(BaseModel):
    entries: list[BulkImportEntry] = Field(..., min_length=1, max_length=50)


@router.post("/dances/bulk-preview-external")
async def bulk_preview(
    body: BulkPreviewBody,
    _user: dict = Depends(require_admin_or_editor),
):
    """Dry-run of :func:`bulk_import` — resolves + dedupes without
    inserting anything. Used by the frontend batch screen to render
    a "20 selected, 3 already in library, 17 new" summary before the
    admin commits.
    """
    resolved: list[dict] = []
    would_import = 0
    already = 0
    fetch_errors = 0

    for entry in body.entries:
        try:
            if entry.source == "copperknob":
                item = await ck_svc.get_by_ref(entry.ref)
            else:
                item = await bs_svc.get_by_id(entry.ref)
        except (ck_svc.CopperKnobError, bs_svc.BootStepperError) as e:
            fetch_errors += 1
            resolved.append(
                {
                    "source": entry.source,
                    "ref": entry.ref,
                    "status": "error",
                    "error": str(e),
                }
            )
            continue

        dup = await dance_dedupe.find_duplicate(item, source=entry.source)
        if dup:
            already += 1
            resolved.append(
                {
                    "source": entry.source,
                    "ref": entry.ref,
                    "status": "skipped_duplicate",
                    "existing_dance_id": dup["id"],
                    "existing_dance_name": dup.get("name", ""),
                    "title": item.get("title", ""),
                    "choreographer": item.get("choreographer", ""),
                }
            )
        else:
            would_import += 1
            resolved.append(
                {
                    "source": entry.source,
                    "ref": entry.ref,
                    "status": "ready",
                    "title": item.get("title", ""),
                    "choreographer": item.get("choreographer", ""),
                    "level": item.get("level", ""),
                    "count": item.get("count", ""),
                    "wall": item.get("wall", ""),
                }
            )

    return {
        "total": len(body.entries),
        "ready_to_import": would_import,
        "already_in_library": already,
        "errors": fetch_errors,
        "resolved": resolved,
    }
