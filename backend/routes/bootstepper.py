"""BootStepper integration — server-side proxy + admin import flows.

The heavy lifting lives in ``services/bootstepper.py``. This module is
just the HTTP surface + "does this dance already exist in our
library?" logic. Nothing here ever exposes the BootStepper API key —
all client requests are proxied through us.

Ownership language
------------------
Our Dance Library is a **curated informational directory**. Importing
a BootStepper record does NOT transfer ownership of the choreography
or stepsheet to SGY. We store metadata + a reference to the original
BootStepper page; the full stepsheet + tutorial videos stay on
BootStepper. Every response that includes BootStepper data carries an
``attribution`` field with the required attribution copy for the UI
to render.

Critical directory rules (per user requirement)
-----------------------------------------------
- A single local dance MAY carry BOTH ``copperknob_ref`` and
  ``bootstepper_ref`` — importing/linking BootStepper NEVER touches
  the CopperKnob fields.
- We DO NOT persist raw step-by-step instructions from BootStepper.
  Only metadata + a link back.
- Duplicate detection considers both refs plus the (title,
  choreographer) fallback so we never split one dance across two
  listings.

Routes
------
Read (all authenticated users):
  - ``GET  /api/bootstepper/search?q=&limit=``
  - ``GET  /api/bootstepper/popular``
  - ``GET  /api/bootstepper/dances/{id}``

Write (admin / step-sheet editor only, server-side enforced):
  - ``POST /api/dances/from-bootstepper``
  - ``POST /api/dances/{dance_id}/link-bootstepper``
  - ``GET  /api/dances/{dance_id}/bootstepper-compare``
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
from services import bootstepper as bs_svc
from services import dance_dedupe

logger = logging.getLogger(__name__)
router = APIRouter()


# BootStepper URLs on the public site are of the shape
# ``https://bootstepper.com/dances/<opaque-id>``.  Cheap regex so we
# can dedupe against dances that only have a ``bootstepper_url`` from
# the pre-integration era.
_BS_ID_IN_URL = re.compile(r"bootstepper\.com/dances/([A-Z0-9_-]+)", re.IGNORECASE)


ATTRIBUTION = {
    "provider": "BootStepper",
    "text": "Dance information provided by BootStepper",
    "link_label": "View on BootStepper",
    "home_url": "https://bootstepper.com",
}


def _extract_id_from_url(url: str) -> str:
    """Pull a BootStepper id out of any /dances/{id} URL. Empty when
    nothing looks like one."""
    if not url:
        return ""
    m = _BS_ID_IN_URL.search(url)
    return (m.group(1) if m else "").strip()


async def _match_existing_dance(bs_item: dict) -> Optional[dict]:
    """Cross-provider duplicate detection — delegates to the shared
    ``services.dance_dedupe`` module so a dance already added under
    the CopperKnob provider is also flagged here (and vice versa).
    Kept as a thin wrapper so existing call sites don't need to
    change.
    """
    return await dance_dedupe.find_duplicate(bs_item, source="bootstepper")


async def _annotate_matches(items: list[dict]) -> list[dict]:
    """For every BootStepper item, attach ``existing_dance`` (id +
    name) when we already have this dance listed. Used so the UI can
    show "Already in Library / View Dance" instead of "Add".
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
                # Extra flags so the client-side card can render
                # "Already linked to CopperKnob" or similar hints.
                "has_copperknob_ref": bool(match.get("copperknob_ref")),
                "has_bootstepper_ref": bool(match.get("bootstepper_ref")),
            }
        out.append(annotated)
    return out


def _bs_error_response(e: bs_svc.BootStepperError):
    """Convert a service-layer error into a proper FastAPI exception
    without leaking any details from BootStepper upstream."""
    return HTTPException(e.status, str(e))


# ---------------- Regular-user reads ----------------


@router.get("/bootstepper/search")
async def search_bootstepper(
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(20, ge=1, le=50),
    _user: dict = Depends(get_current_user),
):
    """Search BootStepper. Any authenticated dancer may call — no
    admin check here since browsing is a read-only external lookup."""
    try:
        payload = await bs_svc.search(q, limit)
    except bs_svc.BootStepperError as e:
        raise _bs_error_response(e)
    payload["data"] = await _annotate_matches(payload["data"])
    payload["attribution"] = ATTRIBUTION
    return payload


@router.get("/bootstepper/popular")
async def popular_bootstepper(
    limit: int = Query(30, ge=1, le=50),
    _user: dict = Depends(get_current_user),
):
    """BootStepper doesn't have a formal "popular" list — we use its
    ``sortBy=videoCount desc`` as a proxy for community favourites."""
    try:
        payload = await bs_svc.most_popular(limit)
    except bs_svc.BootStepperError as e:
        raise _bs_error_response(e)
    payload["data"] = await _annotate_matches(payload["data"])
    payload["attribution"] = ATTRIBUTION
    return payload


@router.get("/bootstepper/dances/{bs_id}")
async def get_bootstepper_dance(
    bs_id: str, _user: dict = Depends(get_current_user)
):
    """Fetch a single BootStepper dance by id + our match status.
    Used by both the regular-user "view metadata" flow and the admin
    import screen."""
    try:
        item = await bs_svc.get_by_id(bs_id)
    except bs_svc.BootStepperError as e:
        raise _bs_error_response(e)
    match = await _match_existing_dance(item)
    return {
        "data": item,
        "existing_dance": (
            {
                "id": match["id"],
                "name": match.get("name", ""),
                "has_copperknob_ref": bool(match.get("copperknob_ref")),
                "has_bootstepper_ref": bool(match.get("bootstepper_ref")),
            }
            if match
            else None
        ),
        "attribution": ATTRIBUTION,
    }


# ---------------- Admin write flows ----------------


class FromBootStepperBody(BaseModel):
    """Admin import payload. All optional overrides mirror our own
    ``DanceIn`` fields — anything the admin left blank falls back to
    the BootStepper value the id resolves to.

    ``publish`` defaults to ``False`` so a distracted admin can't
    accidentally push half-reviewed metadata to end users; they must
    explicitly toggle Publish in the review screen.
    """

    id: str = Field(..., min_length=1, description="BootStepper dance ID")
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
    """Map BootStepper's level strings onto our own difficulty
    vocabulary. BootStepper uses lowercase enums:
    ``unknown / beginner / improver / high improver / intermediate /
    advanced``. Anything we can't confidently map lands on "Improver"
    — the safe middle bucket — with the admin free to override in the
    review screen.
    """
    if not level:
        return "Improver"
    s = level.lower().strip()
    if "absolute beginner" in s:
        return "Absolute Beginner"
    if "high improver" in s:
        return "High Improver"
    if "improver" in s:
        return "Improver"
    if "beginner" in s:
        return "Beginner"
    if "intermediate" in s:
        return "Intermediate"
    if "advanced" in s:
        return "Advanced"
    # "unknown" or anything else
    return "Improver"


def _count_string(bs_item: dict) -> str:
    """Compose our "32 count, 4 wall" string from BootStepper's split
    fields. Empty when neither is present."""
    c = str(bs_item.get("count") or "").strip()
    w = str(bs_item.get("wall") or "").strip()
    parts = []
    if c and c != "0":
        parts.append(f"{c} count")
    if w and w != "0":
        parts.append(f"{w} wall")
    return ", ".join(parts)


@router.post("/dances/from-bootstepper")
async def create_dance_from_bootstepper(
    body: FromBootStepperBody,
    user: dict = Depends(require_admin_or_editor),
):
    """Create a new library listing pre-filled from a BootStepper id.

    Refuses if a matching dance already exists (client should catch
    this earlier via the search-annotated ``existing_dance`` field but
    we belt-and-suspenders it here too — the request could race with
    another admin importing the same id).
    """
    try:
        bs_item = await bs_svc.get_by_id(body.id)
    except bs_svc.BootStepperError as e:
        raise _bs_error_response(e)

    dup = await _match_existing_dance(bs_item)
    if dup:
        raise HTTPException(
            409,
            dance_dedupe.duplicate_response_payload(dup),
        )

    name = (body.name or bs_item.get("title") or "").strip()
    if not name:
        raise HTTPException(400, "Missing dance name")
    chor = (body.choreographer or bs_item.get("choreographer") or "").strip()
    country = (
        body.choreographer_country
        or bs_item.get("choreographer_country")
        or ""
    ).strip()
    song = (body.song or bs_item.get("song") or "").strip()
    artist = (body.artist or bs_item.get("artist") or "").strip()

    doc = {
        "id": f"dance_{uuid.uuid4().hex[:10]}",
        "name": name,
        "choreographer": chor,
        "choreographer_country": country,
        "song": song,
        "artist": artist,
        "difficulty": body.difficulty
        or _difficulty_from_level(bs_item.get("level", "")),
        "bpm": body.bpm,
        "count": body.count or _count_string(bs_item),
        "youtube_url": youtube_search_url(f"{name} {chor} line dance"),
        # We DO NOT copy BootStepper's stepsheet content — we never
        # request ``includeStepSheet=true`` and their Terms forbid
        # mirroring. Users tap the BootStepper link to see the actual
        # instructions.
        "step_sheet": "",
        "step_sheet_image": "",
        "description": body.description or "",
        "tags": list(body.tags or []),
        # The two direct-URL fields the existing UI already
        # understands. This import path only fills ``bootstepper_url``
        # — CopperKnob fields stay empty for a fresh row.
        "copperknob_url": "",
        "bootstepper_url": bs_item.get("url", ""),
        "copperknob_ref": "",
        "bootstepper_ref": bs_item.get("id", "") or bs_item.get("ref", ""),
        "is_published": bool(body.is_published),
        "created_by": user["user_id"],
        "created_by_name": user.get("name", ""),
        "created_at": now_iso(),
        # Provenance breadcrumb for admin audit — attribution stays
        # with the record forever, even if the admin edits every
        # field.
        "imported_from": {
            "source": "bootstepper",
            "id": bs_item.get("id", "") or bs_item.get("ref", ""),
            "url": bs_item.get("url", ""),
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


class LinkBootStepperBody(BaseModel):
    id: str = Field(..., min_length=1)
    overwrite_url: bool = True
    """When True, update ``bootstepper_url`` to BootStepper's
    canonical URL for this id. Never overwrites any of our other
    fields — CopperKnob refs / URLs stay exactly as they are."""


@router.post("/dances/{dance_id}/link-bootstepper")
async def link_bootstepper(
    dance_id: str,
    body: LinkBootStepperBody,
    user: dict = Depends(require_admin_or_editor),
):
    """Attach a BootStepper id to an existing dance listing without
    touching any of our custom fields (aside from the canonical URL
    when the admin opts in). CopperKnob metadata is deliberately left
    intact — one dance CAN carry BOTH references simultaneously.
    """
    dance = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not dance:
        raise HTTPException(404, "Dance not found")

    try:
        bs_item = await bs_svc.get_by_id(body.id)
    except bs_svc.BootStepperError as e:
        raise _bs_error_response(e)

    bs_id = bs_item.get("id", "") or bs_item.get("ref", "")

    # Refuse if another dance in our library already claims this id —
    # protects against accidentally splitting one BootStepper record
    # across two of our listings.
    other = await db.dances.find_one(
        {"bootstepper_ref": bs_id, "id": {"$ne": dance_id}},
        {"_id": 0, "id": 1, "name": 1},
    )
    if other:
        raise HTTPException(
            409,
            {
                "error": "id_already_used",
                "existing_dance_id": other["id"],
                "existing_dance_name": other.get("name", ""),
            },
        )

    updates: dict = {"bootstepper_ref": bs_id}
    if body.overwrite_url and bs_item.get("url"):
        updates["bootstepper_url"] = bs_item["url"]
    updates["bootstepper_linked_at"] = now_iso()
    updates["bootstepper_linked_by"] = user["user_id"]

    await db.dances.update_one({"id": dance_id}, {"$set": updates})
    fresh = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    return {"dance": dance_to_out(fresh, user["user_id"])}


@router.get("/dances/{dance_id}/bootstepper-compare")
async def compare_bootstepper(
    dance_id: str,
    user: dict = Depends(require_admin_or_editor),
):
    """Field-by-field diff between our stored dance and BootStepper's
    current record. Client renders the "Check BootStepper data"
    review UI — nothing is written by this endpoint.
    """
    dance = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not dance:
        raise HTTPException(404, "Dance not found")

    bs_id = (dance.get("bootstepper_ref") or "").strip()
    if not bs_id:
        bs_id = _extract_id_from_url(dance.get("bootstepper_url", ""))
    if not bs_id:
        raise HTTPException(
            400,
            "No BootStepper reference on this dance yet — use Link BootStepper first.",
        )

    try:
        bs_item = await bs_svc.get_by_id(bs_id)
    except bs_svc.BootStepperError as e:
        raise _bs_error_response(e)

    def field(local_key: str, bs_val: str) -> dict:
        our_val = dance.get(local_key, "") or ""
        return {
            "field": local_key,
            "ours": str(our_val),
            "bootstepper": str(bs_val or ""),
            "differs": (
                str(our_val).strip().lower()
                != str(bs_val or "").strip().lower()
            ),
        }

    bs_count_str = _count_string(bs_item)
    fields = [
        field("name", bs_item.get("title", "")),
        field("choreographer", bs_item.get("choreographer", "")),
        field(
            "choreographer_country",
            bs_item.get("choreographer_country", ""),
        ),
        field("song", bs_item.get("song", "")),
        field("artist", bs_item.get("artist", "")),
        field(
            "difficulty",
            _difficulty_from_level(bs_item.get("level", "")),
        ),
        field("count", bs_count_str),
        field("bootstepper_url", bs_item.get("url", "")),
    ]
    return {
        "dance_id": dance_id,
        "id": bs_id,
        "bootstepper_url": bs_item.get("url", ""),
        "fields": fields,
        "differs_count": sum(1 for f in fields if f["differs"]),
        "attribution": ATTRIBUTION,
    }
