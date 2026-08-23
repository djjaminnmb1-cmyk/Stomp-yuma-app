"""Events: create / read / update / delete + unified search.

Auth model
----------
* GET routes are auth-required (login-gated feature per user's choice).
* Write routes (POST/PATCH/DELETE) require ``is_instructor``.
* Instructors can only edit / delete events they own — admins can edit
  any event.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import db
from core.security import get_current_user, require_instructor
from models.schemas import EVENT_SKILL_LEVELS, EVENT_TYPES, EventIn
from services import events as events_svc
from services.geocoding import geocode_address

router = APIRouter()


# ---------------- Search ----------------
@router.get("/events/search")
async def search_events(
    q: Optional[str] = Query(default=""),
    type: Optional[str] = Query(default=None, description="Comma-separated list"),
    level: Optional[str] = Query(default=None, description="Comma-separated list"),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    city: Optional[str] = Query(default=None),
    near_lat: Optional[float] = Query(default=None),
    near_lng: Optional[float] = Query(default=None),
    radius_miles: Optional[float] = Query(default=25),
    instructor: Optional[str] = Query(default=None),
    include_classes: Optional[bool] = Query(default=True),
    limit: Optional[int] = Query(default=50),
    user: dict = Depends(get_current_user),
):
    """Unified search over events (+ optionally classes).

    Query params:
        q               free-text
        type            "workshop,social" style CSV
        level           "Improver,Intermediate" style CSV
        date_from/to    YYYY-MM-DD (inclusive on both ends)
        city            substring, case-insensitive
        near_lat/lng    device coords for radius search
        radius_miles    default 25; capped at 500
        instructor      substring of instructor name
        include_classes default True — flip to False to hide recurring
                        classes from the results
        limit           1..100
    """
    types = [t.strip() for t in (type.split(",") if type else []) if t.strip()]
    levels = [l.strip() for l in (level.split(",") if level else []) if l.strip()]
    radius = min(float(radius_miles or 25), 500.0)
    return await events_svc.search(
        q=q or "",
        types=types,
        skill_levels=levels,
        date_from=date_from or "",
        date_to=date_to or "",
        city=city or "",
        near_lat=near_lat,
        near_lng=near_lng,
        radius_miles=radius,
        instructor=instructor or "",
        include_classes=bool(include_classes),
        limit=int(limit or 50),
    )


# ---------------- Static reference ----------------
@router.get("/events/types")
async def get_event_types(user: dict = Depends(get_current_user)):
    """Return the enum values used by the create/edit form."""
    return {
        "types": list(EVENT_TYPES),
        "skill_levels": list(EVENT_SKILL_LEVELS),
    }


# ---------------- Instructor-authored list ----------------
@router.get("/events/mine")
async def my_events(user: dict = Depends(get_current_user)):
    """Every event the caller has authored (drafts included)."""
    rows = await db.events.find(
        {"instructor_id": user["user_id"]},
        {"_id": 0},
    ).sort("date", -1).to_list(200)
    return {"events": [events_svc._to_out(r) for r in rows]}


# ---------------- Single event ----------------
@router.get("/events/{event_id}")
async def get_event(event_id: str, user: dict = Depends(get_current_user)):
    d = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Event not found")
    # Draft events are only visible to their instructor / admins
    if not d.get("is_published"):
        if not (user.get("is_admin") or user["user_id"] == d.get("instructor_id")):
            raise HTTPException(404, "Event not found")
    return events_svc._to_out(d)


# ---------------- Create / update / delete ----------------
@router.post("/events")
async def create_event(
    inp: EventIn, user: dict = Depends(require_instructor)
):
    if not (inp.name or "").strip():
        raise HTTPException(400, "Event name is required.")
    if not (inp.date or "").strip():
        raise HTTPException(400, "Event date is required.")
    if not (inp.address or "").strip() or not (inp.city or "").strip():
        raise HTTPException(400, "Address + city are required.")
    return await events_svc.create_event(inp, user)


@router.patch("/events/{event_id}")
async def update_event(
    event_id: str, inp: EventIn, user: dict = Depends(require_instructor)
):
    existing = await db.events.find_one(
        {"id": event_id}, {"_id": 0, "instructor_id": 1}
    )
    if not existing:
        raise HTTPException(404, "Event not found")
    if existing["instructor_id"] != user["user_id"] and not user.get("is_admin"):
        raise HTTPException(403, "You can only edit your own events.")
    out = await events_svc.update_event(event_id, inp, user)
    if not out:
        raise HTTPException(404, "Event not found")
    return out


@router.delete("/events/{event_id}")
async def delete_event(
    event_id: str, user: dict = Depends(require_instructor)
):
    existing = await db.events.find_one(
        {"id": event_id}, {"_id": 0, "instructor_id": 1}
    )
    if not existing:
        raise HTTPException(404, "Event not found")
    if existing["instructor_id"] != user["user_id"] and not user.get("is_admin"):
        raise HTTPException(403, "You can only delete your own events.")
    await events_svc.delete_event(event_id)
    return {"ok": True}


# ---------------- Reverse-geocode helper for the client ----------------
class GeocodeBody(BaseModel):
    address: str
    city: str
    state: Optional[str] = ""
    zip_code: Optional[str] = ""
    country: Optional[str] = "US"


@router.post("/events/geocode")
async def do_geocode(
    body: GeocodeBody, user: dict = Depends(require_instructor)
):
    """One-off geocode for the event-create form so the instructor can
    preview where the pin will land before saving."""
    geo = await geocode_address(
        body.address, body.city, body.state or "", body.zip_code or "",
        body.country or "US",
    )
    if not geo:
        raise HTTPException(
            404,
            "Couldn't find that address — please double-check it or try a nearby cross-street.",
        )
    return geo
