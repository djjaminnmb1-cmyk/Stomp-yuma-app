"""Followed-Instructor Hub — upcoming classes + events from instructors
the caller follows (via ``users.instructor_ids``).

Powers a Home card: "From your instructors — upcoming" so dancers see
the stuff from the people they picked first, without wading through the
full classes/events calendars.

Shape of a hub item (unified so one renderer handles both)::

    {
        "kind":            "class" | "event",
        "id":              "<class or event id>",
        "instructor_id":   "...",
        "instructor_name": "...",
        "title":           "<session_label or event name>",
        "date":            "YYYY-MM-DD",
        "start_time":      "HH:MM" | "",       # events only (classes have no time)
        "venue_name":      ""   | "...",       # events only
        "city":            ""   | "...",       # events only
        "dance_count":     0    | <int>,       # classes only
        "deeplink":        "/classes" | "/events/{id}",
    }

Ordering: by (date asc, start_time asc). Classes without a time come
BEFORE events on the same day (fine — classes are generally all-day
schedule items anyway).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core.database import db
from core.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


def _today_utc_ymd() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _normalize_class(doc: dict) -> dict:
    return {
        "kind": "class",
        "id": doc.get("id", ""),
        "instructor_id": doc.get("instructor_id", ""),
        "instructor_name": doc.get("instructor_name", "") or "",
        "title": (doc.get("session_label") or "").strip() or "Class",
        "date": (doc.get("date") or "").strip(),
        "start_time": "",
        "venue_name": "",
        "city": "",
        "dance_count": len(doc.get("dances", []) or []),
        "deeplink": "/classes",
    }


def _normalize_event(doc: dict) -> dict:
    return {
        "kind": "event",
        "id": doc.get("id", ""),
        "instructor_id": doc.get("instructor_id", ""),
        "instructor_name": doc.get("instructor_name", "") or "",
        "title": (doc.get("name") or "").strip() or "Event",
        "date": (doc.get("date") or "").strip(),
        "start_time": (doc.get("start_time") or "").strip(),
        "venue_name": (doc.get("venue_name") or "").strip(),
        "city": (doc.get("city") or "").strip(),
        "dance_count": 0,
        "deeplink": f"/events/{doc.get('id', '')}",
    }


@router.get("/followed-instructors/upcoming")
async def get_followed_upcoming(
    limit: int = Query(default=10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    """Upcoming classes + events from every instructor the caller
    follows. Returns a merged list sorted chronologically.

    Response::

        {
            "items":       [...],   # see shape above (capped at `limit`)
            "total":       <int>,   # BEFORE truncation
            "has_follows": <bool>,  # false if caller follows no one yet
            "today":       "YYYY-MM-DD",
        }

    ``has_follows=false`` lets the client render a friendly empty state
    ("Pick your instructors to see their upcoming classes & events
    here") instead of a dead grey card.
    """
    me = await db.users.find_one(
        {"user_id": user["user_id"]},
        {"_id": 0, "instructor_ids": 1},
    )
    instructor_ids = (me or {}).get("instructor_ids") or []
    today = _today_utc_ymd()

    if not instructor_ids:
        return {
            "items": [],
            "total": 0,
            "has_follows": False,
            "today": today,
        }

    # Pull every upcoming class authored by a followed instructor.
    # `date >= today` is a string compare on ISO-formatted dates — cheap
    # and index-friendly if `(instructor_id, date)` is indexed. Even
    # without an index this reads a small table in practice.
    class_cur = (
        db.classes.find(
            {
                "instructor_id": {"$in": instructor_ids},
                "date": {"$gte": today},
            },
            {"_id": 0},
        )
        .sort("date", 1)
        .limit(100)  # upstream cap — merged + re-sorted below
    )
    classes = [c async for c in class_cur]

    # Published, upcoming events only. Drafts never bubble up to a
    # follower who's not the author.
    event_cur = (
        db.events.find(
            {
                "instructor_id": {"$in": instructor_ids},
                "is_published": True,
                "date": {"$gte": today},
            },
            {"_id": 0},
        )
        .sort([("date", 1), ("start_time", 1)])
        .limit(100)
    )
    events = [e async for e in event_cur]

    merged = [
        *(_normalize_class(c) for c in classes),
        *(_normalize_event(e) for e in events),
    ]
    # (date asc, start_time asc). Classes have start_time="" which
    # sorts BEFORE any "HH:MM" in Python string compare, so same-day
    # classes come before timed events — a sensible default for a
    # "what's next" peek.
    merged.sort(key=lambda it: (it["date"], it["start_time"], it["kind"]))
    total = len(merged)
    items = merged[: max(1, min(int(limit or 10), 50))]
    return {
        "items": items,
        "total": total,
        "has_follows": True,
        "today": today,
    }
