"""OpenStreetMap Nominatim geocoding — free, keyless, respectful.

We hit ``nominatim.openstreetmap.org`` with a proper ``User-Agent`` (per
their usage policy) at most once per second per address, and cache the
resulting ``{lat, lng, display_name}`` in ``db.geocode_cache`` so
re-editing an event doesn't re-hit the network.

Why Nominatim?
--------------
* Zero cost, zero API-key management, no vendor lock-in.
* Accuracy is more than good enough for event discovery ("show me events
  within 25 miles of Yuma, AZ").
* Rate-limited to ~1 req/sec — we serialize calls with an in-process
  asyncio.Lock so instructors don't accidentally trip the throttle when
  they batch-create events.

Fallback behaviour
------------------
If Nominatim can't find the address (or times out), we log a warning and
return ``None``. Callers then persist the event WITHOUT coordinates and
skip it from distance-based searches (it still shows up in name / city
search, so no data is lost).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

import httpx

from core.database import db
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_USER_AGENT = "StompinGroundYumaApp/1.0 (line-dance events search)"
_TIMEOUT_S = 8.0

# Serialize outbound calls so we never exceed 1 req/sec even under
# concurrent event-create load. In-memory is fine — Nominatim doesn't
# care about our process boundaries, it cares about IP.
_call_lock = asyncio.Lock()
_last_call_ts = 0.0
_MIN_INTERVAL_S = 1.05  # slightly over 1s to be safe


def _cache_key(address: str, city: str, state: str, zip_code: str, country: str) -> str:
    return "|".join(
        s.strip().lower()
        for s in (address, city, state, zip_code, country)
    )


async def _throttle() -> None:
    """Sleep just enough that we stay under 1 request per second."""
    global _last_call_ts
    now = asyncio.get_event_loop().time()
    delta = now - _last_call_ts
    if delta < _MIN_INTERVAL_S:
        await asyncio.sleep(_MIN_INTERVAL_S - delta)
    _last_call_ts = asyncio.get_event_loop().time()


async def geocode_address(
    address: str,
    city: str,
    state: str = "",
    zip_code: str = "",
    country: str = "US",
) -> Optional[dict]:
    """Return ``{lat, lng, display_name}`` or ``None`` if not found.

    * ``address``  street line (e.g. "1234 Main St")
    * ``city``     city
    * ``state``    optional US state code or region name
    * ``zip_code`` optional postal code
    * ``country``  ISO-2 code preferred but full name also accepted

    Uses a Mongo cache keyed by the normalized address tuple so the same
    address is only geocoded ONCE per install.
    """
    if not (address and city):
        return None

    key = _cache_key(address, city, state, zip_code, country)
    cached = await db.geocode_cache.find_one({"key": key}, {"_id": 0})
    if cached and cached.get("lat") is not None and cached.get("lng") is not None:
        return {
            "lat": float(cached["lat"]),
            "lng": float(cached["lng"]),
            "display_name": cached.get("display_name") or "",
        }
    if cached and cached.get("not_found"):
        # We've already looked this up and Nominatim couldn't find it —
        # don't burn another request. If the instructor edits any field
        # the cache_key will change so the retry happens automatically.
        return None

    parts = [address, city]
    if state:
        parts.append(state)
    if zip_code:
        parts.append(zip_code)
    if country:
        parts.append(country)
    query = ", ".join(parts)

    async with _call_lock:
        await _throttle()
        try:
            async with httpx.AsyncClient(
                timeout=_TIMEOUT_S,
                headers={
                    "User-Agent": _USER_AGENT,
                    "Accept": "application/json",
                    "Accept-Language": "en",
                },
            ) as client:
                resp = await client.get(
                    _NOMINATIM_URL,
                    params={
                        "q": query,
                        "format": "json",
                        "limit": 1,
                        "addressdetails": 0,
                    },
                )
                resp.raise_for_status()
                results = resp.json() or []
        except Exception as e:
            logger.warning(f"Geocode failed for {query!r}: {e}")
            return None

    if not results:
        # Cache the miss so we don't retry every time the event is loaded.
        try:
            await db.geocode_cache.update_one(
                {"key": key},
                {"$set": {
                    "key": key,
                    "not_found": True,
                    "cached_at": now_iso(),
                    "query": query,
                }},
                upsert=True,
            )
        except Exception:
            pass
        return None

    row = results[0]
    try:
        lat = float(row["lat"])
        lng = float(row["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    display_name = str(row.get("display_name") or "").strip()

    # Persist to cache
    try:
        await db.geocode_cache.update_one(
            {"key": key},
            {"$set": {
                "key": key,
                "lat": lat,
                "lng": lng,
                "display_name": display_name,
                "cached_at": now_iso(),
                "query": query,
            }},
            upsert=True,
        )
    except Exception:
        # Cache failure is non-fatal — we still return the fresh result.
        pass

    return {"lat": lat, "lng": lng, "display_name": display_name}


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in miles. Used as a fallback / for sort keys
    when we need distances from Python (Mongo ``$near`` already sorts, but
    we still want the actual number to render in the UI)."""
    import math
    r = 3958.7613  # earth radius in miles
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c
