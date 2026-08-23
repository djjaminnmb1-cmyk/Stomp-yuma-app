"""Event / class discovery service.

Two functions matter to the rest of the app:

* ``create_event`` / ``update_event`` — persist + geocode on write.
* ``search`` — unified query that returns BOTH events and (optionally)
  classes, with a wide set of filters. Distance search uses Mongo's
  ``$near`` on the ``location`` GeoJSON Point (2dsphere index).

Events are stored under ``db.events`` with this shape::

    {
      "id": "evt_...",
      "name": "Boot Scootin' Boogie Workshop",
      "description": "...",
      "event_type": "workshop",
      "skill_level": "Improver",
      "date": "2026-09-14",
      "start_time": "19:30",
      "end_time": "21:30",
      "venue_name": "The Barn",
      "address": "1234 Main St",
      "city": "Yuma",
      "state": "AZ",
      "zip_code": "85364",
      "country": "US",
      "location": {"type": "Point", "coordinates": [<lng>, <lat>]},
      "display_name": "Yuma, AZ, 85364, USA",
      "cover_image": "",
      "price": "$15",
      "registration_url": "https://...",
      "max_attendees": 40,
      "is_published": true,
      "instructor_id": "user_...",
      "instructor_name": "Erin",
      "created_at": "...",
      "updated_at": "...",
    }
"""
from __future__ import annotations

import uuid
from typing import Optional

from core.database import db
from core.time_helpers import now_iso
from models.schemas import EVENT_SKILL_LEVELS, EVENT_TYPES, EventIn
from services.geocoding import geocode_address, haversine_miles


def _default_country(c: Optional[str]) -> str:
    return (c or "US").strip() or "US"


def _norm_type(t: Optional[str]) -> str:
    t = (t or "workshop").strip().lower().replace(" ", "_")
    return t if t in EVENT_TYPES else "workshop"


def _norm_level(l: Optional[str]) -> str:
    if not l:
        return "All levels"
    # Loose match — instructors may type "Improver" or "improver"
    s = l.strip()
    for candidate in EVENT_SKILL_LEVELS:
        if candidate.lower() == s.lower():
            return candidate
    return "All levels"


async def _location_from_inp(inp: EventIn) -> tuple[Optional[dict], str]:
    """Look up lat/lng for the address in ``inp``. Returns
    ``(geojson_or_None, display_name)`` — the caller decides whether to
    persist a location or not.
    """
    geo = await geocode_address(
        inp.address,
        inp.city,
        inp.state or "",
        inp.zip_code or "",
        _default_country(inp.country),
    )
    if not geo:
        return None, ""
    # Mongo GeoJSON expects [lng, lat]
    return (
        {"type": "Point", "coordinates": [geo["lng"], geo["lat"]]},
        geo.get("display_name", ""),
    )


async def create_event(inp: EventIn, instructor: dict) -> dict:
    location_geo, display_name = await _location_from_inp(inp)
    now = now_iso()
    doc = {
        "id": f"evt_{uuid.uuid4().hex[:12]}",
        "name": inp.name.strip(),
        "description": (inp.description or "").strip(),
        "event_type": _norm_type(inp.event_type),
        "skill_level": _norm_level(inp.skill_level),
        "date": (inp.date or "").strip(),
        "end_date": (inp.end_date or "").strip(),
        "start_time": (inp.start_time or "").strip(),
        "end_time": (inp.end_time or "").strip(),
        "venue_name": (inp.venue_name or "").strip(),
        "address": (inp.address or "").strip(),
        "city": (inp.city or "").strip(),
        "state": (inp.state or "").strip(),
        "zip_code": (inp.zip_code or "").strip(),
        "country": _default_country(inp.country),
        "location": location_geo,       # None if geocoding failed
        "display_name": display_name,
        "cover_image": inp.cover_image or "",
        "price": (inp.price or "").strip(),
        "registration_url": (inp.registration_url or "").strip(),
        "max_attendees": int(inp.max_attendees) if inp.max_attendees else None,
        "is_published": bool(inp.is_published if inp.is_published is not None else True),
        "instructor_id": instructor["user_id"],
        "instructor_name": instructor.get("name") or "",
        "created_at": now,
        "updated_at": now,
    }
    await db.events.insert_one(doc)
    doc.pop("_id", None)
    return _to_out(doc)


async def update_event(event_id: str, inp: EventIn, instructor: dict) -> Optional[dict]:
    existing = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not existing:
        return None
    # Re-geocode only when the address changed — no wasted requests.
    addr_changed = (
        (inp.address or "").strip() != existing.get("address", "")
        or (inp.city or "").strip() != existing.get("city", "")
        or (inp.state or "").strip() != existing.get("state", "")
        or (inp.zip_code or "").strip() != existing.get("zip_code", "")
        or _default_country(inp.country) != existing.get("country", "US")
    )
    if addr_changed:
        location_geo, display_name = await _location_from_inp(inp)
    else:
        location_geo = existing.get("location")
        display_name = existing.get("display_name", "")

    updates = {
        "name": inp.name.strip(),
        "description": (inp.description or "").strip(),
        "event_type": _norm_type(inp.event_type),
        "skill_level": _norm_level(inp.skill_level),
        "date": (inp.date or "").strip(),
        "end_date": (inp.end_date or "").strip(),
        "start_time": (inp.start_time or "").strip(),
        "end_time": (inp.end_time or "").strip(),
        "venue_name": (inp.venue_name or "").strip(),
        "address": (inp.address or "").strip(),
        "city": (inp.city or "").strip(),
        "state": (inp.state or "").strip(),
        "zip_code": (inp.zip_code or "").strip(),
        "country": _default_country(inp.country),
        "location": location_geo,
        "display_name": display_name,
        "cover_image": inp.cover_image or "",
        "price": (inp.price or "").strip(),
        "registration_url": (inp.registration_url or "").strip(),
        "max_attendees": int(inp.max_attendees) if inp.max_attendees else None,
        "is_published": bool(inp.is_published if inp.is_published is not None else True),
        "updated_at": now_iso(),
    }
    await db.events.update_one({"id": event_id}, {"$set": updates})
    fresh = await db.events.find_one({"id": event_id}, {"_id": 0})
    return _to_out(fresh)


async def delete_event(event_id: str) -> bool:
    res = await db.events.delete_one({"id": event_id})
    return int(res.deleted_count or 0) > 0


def _to_out(d: dict) -> dict:
    """Serialize a raw Mongo event doc for API responses. Strips the
    internal `_id` and injects convenience fields (``lat``, ``lng``) so
    the client doesn't have to unpack the GeoJSON tuple."""
    if not d:
        return d
    d = {**d}
    d.pop("_id", None)
    d["kind"] = "event"
    loc = d.get("location") or {}
    coords = loc.get("coordinates") if isinstance(loc, dict) else None
    if coords and len(coords) == 2:
        d["lng"], d["lat"] = float(coords[0]), float(coords[1])
    else:
        d["lat"], d["lng"] = None, None
    return d


# ---------------- Search ----------------
async def search(
    q: str = "",
    types: Optional[list[str]] = None,
    skill_levels: Optional[list[str]] = None,
    date_from: str = "",
    date_to: str = "",
    city: str = "",
    near_lat: Optional[float] = None,
    near_lng: Optional[float] = None,
    radius_miles: float = 25,
    instructor: str = "",
    include_classes: bool = True,
    limit: int = 50,
) -> dict:
    """Search events (and optionally classes) using every requested filter.

    Distance search only fires when both ``near_lat`` and ``near_lng`` are
    provided. Results are always sorted by date ASC (upcoming first),
    then by distance when a location was supplied.
    """
    limit = max(1, min(100, int(limit)))
    filt: dict = {"is_published": True}

    if q:
        import re
        safe = re.escape(q.strip())
        filt["$or"] = [
            {"name": {"$regex": safe, "$options": "i"}},
            {"description": {"$regex": safe, "$options": "i"}},
            {"venue_name": {"$regex": safe, "$options": "i"}},
            {"city": {"$regex": safe, "$options": "i"}},
        ]
    if types:
        norm = [t for t in (_norm_type(t) for t in types) if t]
        if norm:
            filt["event_type"] = {"$in": norm}
    if skill_levels:
        norm = [_norm_level(l) for l in skill_levels if l]
        if norm:
            filt["skill_level"] = {"$in": norm}
    if date_from or date_to:
        # A multi-day event effectively spans ``[date, end_date OR date]``.
        # We want to surface an event if that span OVERLAPS the query
        # range, not just when its start-date is inside the range.
        exprs = []
        if date_from:
            # effective end >= date_from
            exprs.append({
                "$gte": [
                    {"$cond": [
                        {"$and": [
                            {"$ne": [{"$type": "$end_date"}, "missing"]},
                            {"$ne": ["$end_date", ""]},
                            {"$ne": ["$end_date", None]},
                        ]},
                        "$end_date",
                        "$date",
                    ]},
                    date_from,
                ]
            })
        if date_to:
            # starts on or before the range end
            exprs.append({"$lte": ["$date", date_to]})
        filt["$expr"] = {"$and": exprs} if len(exprs) > 1 else exprs[0]
    if city:
        import re
        filt["city"] = {"$regex": re.escape(city), "$options": "i"}
    if instructor:
        import re
        filt["instructor_name"] = {
            "$regex": re.escape(instructor), "$options": "i"
        }

    # Distance search uses geoNear (must be first stage in aggregation)
    events_out: list[dict] = []
    if near_lat is not None and near_lng is not None:
        # Convert miles → meters for MongoDB's spherical query
        max_meters = float(radius_miles) * 1609.344
        pipeline = [
            {
                "$geoNear": {
                    "near": {"type": "Point", "coordinates": [float(near_lng), float(near_lat)]},
                    "distanceField": "distance_meters",
                    "maxDistance": max_meters,
                    "spherical": True,
                    "query": filt,
                }
            },
            {"$sort": {"date": 1, "distance_meters": 1}},
            {"$limit": limit},
        ]
        async for d in db.events.aggregate(pipeline):
            out = _to_out(d)
            meters = d.get("distance_meters")
            if meters is not None:
                out["distance_miles"] = round(float(meters) / 1609.344, 1)
            events_out.append(out)
    else:
        cur = db.events.find(filt, {"_id": 0}).sort("date", 1).limit(limit)
        async for d in cur:
            events_out.append(_to_out(d))

    # Optionally interleave classes into the results (basic filters only).
    classes_out: list[dict] = []
    if include_classes:
        class_filt: dict = {"is_published": {"$ne": False}}
        if q:
            import re
            safe = re.escape(q.strip())
            class_filt["$or"] = [
                {"session_label": {"$regex": safe, "$options": "i"}},
                {"venue_name": {"$regex": safe, "$options": "i"}},
                {"city": {"$regex": safe, "$options": "i"}},
                {"notes": {"$regex": safe, "$options": "i"}},
            ]
        if date_from or date_to:
            date_filter = {}
            if date_from:
                date_filter["$gte"] = date_from
            if date_to:
                date_filter["$lte"] = date_to
            class_filt["date"] = date_filter
        if city:
            import re
            class_filt["city"] = {"$regex": re.escape(city), "$options": "i"}
        cur = db.classes.find(class_filt, {"_id": 0}).sort("date", 1).limit(limit)
        async for c in cur:
            row = _class_to_out(c)
            # If searching by distance and the class has coords, filter.
            if near_lat is not None and near_lng is not None:
                if row.get("lat") is None:
                    continue
                dmi = haversine_miles(near_lat, near_lng, row["lat"], row["lng"])
                if dmi > radius_miles:
                    continue
                row["distance_miles"] = round(dmi, 1)
            classes_out.append(row)

    return {
        "events": events_out,
        "classes": classes_out,
        "count": len(events_out) + len(classes_out),
    }


def _class_to_out(c: dict) -> dict:
    """Normalize a raw class row to the search-result shape used by the
    client so events & classes can be rendered by the same component."""
    if not c:
        return c
    return {
        "id": c.get("id", ""),
        "kind": "class",
        "name": c.get("session_label") or "Class Session",
        "date": c.get("date", ""),
        "start_time": c.get("start_time", ""),
        "end_time": c.get("end_time", ""),
        "venue_name": c.get("venue_name", ""),
        "address": c.get("address", ""),
        "city": c.get("city", ""),
        "state": c.get("state", ""),
        "zip_code": c.get("zip_code", ""),
        "country": c.get("country", "US"),
        "lat": (c.get("location") or {}).get("coordinates", [None, None])[1] if c.get("location") else None,
        "lng": (c.get("location") or {}).get("coordinates", [None, None])[0] if c.get("location") else None,
        "event_type": "class",
        "skill_level": "All levels",
        "instructor_id": c.get("created_by") or "",
        "instructor_name": c.get("created_by_name") or "",
        "cover_image": c.get("flyer_image") or "",
        "description": c.get("notes") or "",
        "is_published": bool(c.get("is_published", True)),
    }
