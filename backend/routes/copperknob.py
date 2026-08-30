"""CopperKnob integration — server-side proxy + admin import flows.

The heavy lifting lives in ``services/copperknob.py``. This module is
just the HTTP surface + all the "does this stepsheet already exist in
our library?" logic. Nothing here ever exposes the CopperKnob API key
— all client requests are proxied through us.

Ownership language
------------------
Our Dance Library is a **curated informational directory**. Importing
a CopperKnob record does NOT transfer ownership of the choreography or
stepsheet to SGY. We store metadata + a reference to the original
CopperKnob page; the full stepsheet stays on CopperKnob. Every response
that includes CopperKnob data carries an ``attribution`` field with
the required attribution copy for the UI to render.

Routes
------
Read (all authenticated users):
  - ``GET  /api/copperknob/search?q=&type=``
  - ``GET  /api/copperknob/popular``
  - ``GET  /api/copperknob/stepsheets/{ref}``

Write (admin / step-sheet editor only, server-side enforced):
  - ``POST /api/dances/from-copperknob``
  - ``POST /api/dances/{dance_id}/link-copperknob``
  - ``GET  /api/dances/{dance_id}/copperknob-compare``
"""
from __future__ import annotations

import logging
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.database import db
from core.security import (
    get_current_user,
    require_admin_or_editor,
)
from core.serialize import dance_to_out, youtube_search_url
from core.time_helpers import now_iso
from services import copperknob as ck_svc
from services import dance_dedupe

logger = logging.getLogger(__name__)
router = APIRouter()


# CopperKnob's stepsheet URL always contains the ref uppercase between
# ``/stepsheets/`` and the next slash — cheap and stable enough to use
# as a de-duplication signal for pre-existing dances whose only link
# was the copperknob_url (no copperknob_ref stored yet).
_CK_REF_IN_URL = re.compile(r"/stepsheets/([A-Z0-9]+)", re.IGNORECASE)


ATTRIBUTION = {
    "provider": "CopperKnob",
    "text": "Dance information provided by CopperKnob",
    "link_label": "View on CopperKnob",
    "home_url": "https://www.copperknob.co.uk",
}


def _extract_ref_from_url(url: str) -> str:
    """Pull a CopperKnob ref out of any stepsheet URL. Empty when
    nothing looks like one."""
    if not url:
        return ""
    m = _CK_REF_IN_URL.search(url)
    return (m.group(1) if m else "").upper()


async def _match_existing_dance(ck_item: dict) -> Optional[dict]:
    """Cross-provider duplicate detection — delegates to the shared
    ``services.dance_dedupe`` module so a dance already added under
    the BootStepper provider is also flagged here (and vice versa).
    Kept as a thin wrapper so ``_annotate_matches`` and the write
    paths below don't need to know the internal signal ordering.
    """
    return await dance_dedupe.find_duplicate(ck_item, source="copperknob")


async def _annotate_matches(items: list[dict]) -> list[dict]:
    """For every CopperKnob item, attach ``existing_dance`` (id + name
    + provider-ref flags) when we already have this dance listed. Used
    so the UI can show "Already in Library" — and, when useful, hint
    that the match already carries a BootStepper ref too.
    """
    out: list[dict] = []
    for it in items:
        match = await _match_existing_dance(it)
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


def _ck_error_response(e: ck_svc.CopperKnobError):
    """Convert a service-layer error into a proper FastAPI exception
    without leaking any details from Apple / CopperKnob upstream."""
    return HTTPException(e.status, str(e))


# ---------------- Regular-user reads ----------------


@router.get("/copperknob/search")
async def search_copperknob(
    q: str = Query(..., min_length=2, description="Search query"),
    type: str = Query("all", description="all / title / music / choreographer"),
    _user: dict = Depends(get_current_user),
):
    """Search CopperKnob. Any authenticated dancer may call — no admin
    check here since browsing is a read-only external lookup."""
    try:
        payload = await ck_svc.search(q, type)
    except ck_svc.CopperKnobError as e:
        raise _ck_error_response(e)
    payload["data"] = await _annotate_matches(payload["data"])
    payload["attribution"] = ATTRIBUTION
    return payload


@router.get("/copperknob/popular")
async def popular_copperknob(_user: dict = Depends(get_current_user)):
    """Top 99 CopperKnob stepsheets, annotated for duplicates."""
    try:
        payload = await ck_svc.most_popular()
    except ck_svc.CopperKnobError as e:
        raise _ck_error_response(e)
    payload["data"] = await _annotate_matches(payload["data"])
    payload["attribution"] = ATTRIBUTION
    return payload


@router.get("/copperknob/stepsheets/{ref}")
async def get_stepsheet(ref: str, _user: dict = Depends(get_current_user)):
    """Fetch a single CopperKnob stepsheet by reference + our match
    status. Used by both the regular-user "view metadata" flow and the
    admin import screen."""
    try:
        item = await ck_svc.get_by_ref(ref)
    except ck_svc.CopperKnobError as e:
        raise _ck_error_response(e)
    match = await _match_existing_dance(item)
    return {
        "data": item,
        "existing_dance": (
            {"id": match["id"], "name": match.get("name", "")}
            if match
            else None
        ),
        "attribution": ATTRIBUTION,
    }


# ---------------- Admin write flows ----------------


class FromCopperKnobBody(BaseModel):
    """Admin import payload. All optional overrides mirror our own
    ``DanceIn`` fields — anything the admin left blank falls back to
    the CopperKnob value the ref resolves to.

    ``publish`` defaults to ``False`` so a distracted admin can't
    accidentally push half-reviewed metadata to end users; they must
    explicitly toggle Publish in the review screen.
    """

    ref: str = Field(..., min_length=1, description="CopperKnob reference ID")
    name: Optional[str] = None
    choreographer: Optional[str] = None
    choreographer_country: Optional[str] = ""
    song: Optional[str] = None
    artist: Optional[str] = None
    difficulty: Optional[str] = None
    bpm: Optional[int] = None
    count: Optional[str] = None
    description: Optional[str] = ""
    tags: Optional[list[str]] = []
    is_published: Optional[bool] = False


def _difficulty_from_level(level: str) -> str:
    """Map CopperKnob's level strings onto our own difficulty
    vocabulary. Anything we can't confidently map lands on
    "Improver" — the safe middle bucket — with the admin free to
    override in the review screen.
    """
    if not level:
        return "Improver"
    s = level.lower()
    if "absolute beginner" in s:
        return "Absolute Beginner"
    if "beginner" in s:
        return "Beginner"
    if "improver" in s and "high" in s:
        return "High Improver"
    if "improver" in s:
        return "Improver"
    if "advanced" in s:
        return "Advanced"
    if "intermediate" in s:
        return "Intermediate"
    return "Improver"


def _count_string(ck_item: dict) -> str:
    """Compose our "32 count, 4 wall" string from CopperKnob's split
    fields. Empty when neither is present."""
    c = str(ck_item.get("count") or "").strip()
    w = str(ck_item.get("wall") or "").strip()
    parts = []
    if c:
        parts.append(f"{c} count")
    if w:
        parts.append(f"{w} wall")
    return ", ".join(parts)


@router.post("/dances/from-copperknob")
async def create_dance_from_copperknob(
    body: FromCopperKnobBody,
    user: dict = Depends(require_admin_or_editor),
):
    """Create a new library listing pre-filled from a CopperKnob ref.

    Refuses if a matching dance already exists (client should catch
    this earlier via the search-annotated ``existing_dance`` field but
    we belt-and-suspenders it here too — the request could race with
    another admin importing the same ref).
    """
    try:
        ck_item = await ck_svc.get_by_ref(body.ref)
    except ck_svc.CopperKnobError as e:
        raise _ck_error_response(e)

    dup = await _match_existing_dance(ck_item)
    if dup:
        raise HTTPException(
            409,
            dance_dedupe.duplicate_response_payload(dup),
        )

    name = (body.name or ck_item.get("title") or "").strip()
    if not name:
        raise HTTPException(400, "Missing dance name")
    chor = (body.choreographer or ck_item.get("choreographer") or "").strip()
    song = (body.song or ck_item.get("song") or "").strip()
    artist = (body.artist or ck_item.get("artist") or "").strip()

    doc = {
        "id": f"dance_{uuid.uuid4().hex[:10]}",
        "name": name,
        "choreographer": chor,
        "choreographer_country": body.choreographer_country or "",
        "song": song,
        "artist": artist,
        "difficulty": body.difficulty or _difficulty_from_level(ck_item.get("level", "")),
        "bpm": body.bpm,
        "count": body.count or _count_string(ck_item),
        "youtube_url": youtube_search_url(f"{name} {chor} line dance"),
        # We DO NOT copy CopperKnob's stepsheet content — the API
        # doesn't return it anyway, and their Terms forbid mirroring.
        # step_sheet + step_sheet_image stay empty. Users tap the
        # CopperKnob link to see the actual instructions.
        "step_sheet": "",
        "step_sheet_image": "",
        "description": body.description or "",
        "tags": list(body.tags or []),
        # The two direct-URL fields the existing UI already understands.
        "copperknob_url": ck_item.get("url", ""),
        "bootstepper_url": "",
        # The new stable ref — powers duplicate-detection + refresh.
        "copperknob_ref": ck_item.get("ref", "").upper(),
        "is_published": bool(body.is_published),
        "created_by": user["user_id"],
        "created_by_name": user.get("name", ""),
        "created_at": now_iso(),
        # Provenance breadcrumb for admin audit — attribution stays with
        # the record forever, even if the admin edits every field.
        "imported_from": {
            "source": "copperknob",
            "ref": ck_item.get("ref", "").upper(),
            "url": ck_item.get("url", ""),
            "at": now_iso(),
            "by": user["user_id"],
        },
    }
    await db.dances.insert_one(doc)
    doc.pop("_id", None)
    if doc.get("is_published"):
        from services.choreographer_follows import notify_followers_of_new_dance
        await notify_followers_of_new_dance(doc)
    return {"dance": dance_to_out(doc, user["user_id"])}


class LinkCopperKnobBody(BaseModel):
    ref: str = Field(..., min_length=1)
    overwrite_url: bool = True
    """When True, update ``copperknob_url`` to CopperKnob's canonical
    URL for this ref. Never overwrites any of our other fields."""


@router.post("/dances/{dance_id}/link-copperknob")
async def link_copperknob(
    dance_id: str,
    body: LinkCopperKnobBody,
    user: dict = Depends(require_admin_or_editor),
):
    """Attach a CopperKnob ref to an existing dance listing without
    touching any of our custom fields (aside from the canonical URL
    when the admin opts in)."""
    dance = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not dance:
        raise HTTPException(404, "Dance not found")

    try:
        ck_item = await ck_svc.get_by_ref(body.ref)
    except ck_svc.CopperKnobError as e:
        raise _ck_error_response(e)

    # Refuse if another dance in our library already claims this ref —
    # protects against accidentally splitting one CopperKnob record
    # across two of our listings.
    other = await db.dances.find_one(
        {"copperknob_ref": ck_item["ref"], "id": {"$ne": dance_id}},
        {"_id": 0, "id": 1, "name": 1},
    )
    if other:
        raise HTTPException(
            409,
            {
                "error": "ref_already_used",
                "existing_dance_id": other["id"],
                "existing_dance_name": other.get("name", ""),
            },
        )

    updates: dict = {"copperknob_ref": ck_item["ref"]}
    if body.overwrite_url and ck_item.get("url"):
        updates["copperknob_url"] = ck_item["url"]
    updates["copperknob_linked_at"] = now_iso()
    updates["copperknob_linked_by"] = user["user_id"]

    await db.dances.update_one({"id": dance_id}, {"$set": updates})
    fresh = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    return {"dance": dance_to_out(fresh, user["user_id"])}


@router.get("/dances/{dance_id}/copperknob-compare")
async def compare_copperknob(
    dance_id: str,
    user: dict = Depends(require_admin_or_editor),
):
    """Field-by-field diff between our stored dance and CopperKnob's
    current record. Client renders the "Check CopperKnob data" review
    UI — nothing is written by this endpoint.
    """
    dance = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not dance:
        raise HTTPException(404, "Dance not found")

    # Prefer a stored ref; fall back to one inferred from the URL. If
    # neither exists we can't diff — surface a helpful 400.
    ref = (dance.get("copperknob_ref") or "").upper().strip()
    if not ref:
        ref = _extract_ref_from_url(dance.get("copperknob_url", ""))
    if not ref:
        raise HTTPException(
            400,
            "No CopperKnob reference on this dance yet — use Link CopperKnob first.",
        )

    try:
        ck_item = await ck_svc.get_by_ref(ref)
    except ck_svc.CopperKnobError as e:
        raise _ck_error_response(e)

    def field(local_key: str, ck_val: str) -> dict:
        our_val = dance.get(local_key, "") or ""
        return {
            "field": local_key,
            "ours": str(our_val),
            "copperknob": str(ck_val or ""),
            "differs": (str(our_val).strip().lower() != str(ck_val or "").strip().lower()),
        }

    ck_count_str = _count_string(ck_item)
    fields = [
        field("name", ck_item.get("title", "")),
        field("choreographer", ck_item.get("choreographer", "")),
        field("song", ck_item.get("song", "")),
        field("artist", ck_item.get("artist", "")),
        field("difficulty", _difficulty_from_level(ck_item.get("level", ""))),
        field("count", ck_count_str),
        field("copperknob_url", ck_item.get("url", "")),
    ]
    return {
        "dance_id": dance_id,
        "ref": ref,
        "copperknob_url": ck_item.get("url", ""),
        "fields": fields,
        "differs_count": sum(1 for f in fields if f["differs"]),
        "attribution": ATTRIBUTION,
    }
