"""CopperKnob API proxy — the ONLY module that talks to
``api.copperknob.co.uk``.

Why isolate it here
-------------------
- The API key MUST stay server-side; clients never see it.
- CopperKnob's Terms of Use forbid mirroring / scraping / storing
  count-by-count stepsheet content. This module only ever handles the
  small metadata blocks the API returns — no scraping or HTML parsing.
- Their API caps searches at 50 results and popular at 99; wrapping
  everything here keeps those limits documented in one place.

Endpoints exposed
-----------------
- ``search(q, type_)``           → wraps GET ``/stepsheets/search``
- ``most_popular()``             → wraps GET ``/stepsheets/mostpopular``
- ``get_by_ref(ref)``            → wraps GET ``/stepsheets/{ref}``

Each returns a normalised dict (see ``_normalise``) so route handlers
never touch raw CopperKnob field names — that shape is a stable
contract we control.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.copperknob.co.uk/v1"
SEARCH_TYPES = {"all", "title", "music", "choreographer"}

# Short in-process cache so a burst of identical queries (typing +
# debounce races, admin comparing multiple candidates) doesn't hammer
# CopperKnob. Deliberately not backed by Redis — the payloads are tiny
# and per-worker locality is fine for the traffic shape we expect.
_CACHE: dict[str, tuple[float, Any]] = {}
_CACHE_TTL_SEARCH = 60           # seconds
_CACHE_TTL_POPULAR = 15 * 60     # popular list barely moves
_CACHE_TTL_REF = 15 * 60         # single-ref lookups
_MAX_CACHE_ENTRIES = 256


class CopperKnobError(Exception):
    """Raised for any non-2xx / network / config failure.

    Route handlers convert this to a friendly 502/503 so the user
    sees "CopperKnob is unavailable right now" instead of a stack
    trace. Never surface the raw message to clients — it may echo
    request details.
    """

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def is_configured() -> bool:
    return bool(os.environ.get("COPPERKNOB_API_KEY", "").strip())


def _headers() -> dict:
    key = os.environ.get("COPPERKNOB_API_KEY", "").strip()
    if not key:
        raise CopperKnobError(
            "CopperKnob API key not configured on the server",
            status=503,
        )
    return {
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        # A polite User-Agent so CopperKnob operators can identify us
        # if they need to reach out about usage.
        "User-Agent": "StompinGroundYuma/1.0 (+support@stompinground.com)",
    }


def _cache_get(key: str) -> Optional[Any]:
    entry = _CACHE.get(key)
    if not entry:
        return None
    expires_at, value = entry
    if time.time() > expires_at:
        _CACHE.pop(key, None)
        return None
    return value


def _cache_set(key: str, value: Any, ttl: int) -> None:
    if len(_CACHE) >= _MAX_CACHE_ENTRIES:
        # Cheap eviction — drop the oldest ~10% of entries by expiry.
        # We don't need LRU precision here.
        drop = sorted(_CACHE.items(), key=lambda kv: kv[1][0])[
            : max(1, len(_CACHE) // 10)
        ]
        for k, _ in drop:
            _CACHE.pop(k, None)
    _CACHE[key] = (time.time() + ttl, value)


def _split_music(music: str) -> tuple[str, str]:
    """CopperKnob returns music as ``"Song - Artist"`` — split it back
    out so our downstream UI/import can populate the separate fields we
    already have. Falls back to (whole_string, "") if no dash.
    """
    if not music:
        return "", ""
    parts = [p.strip() for p in music.split(" - ", 1)]
    if len(parts) == 2:
        return parts[0], parts[1]
    # Also tolerate "Song by Artist"
    parts = [p.strip() for p in music.rsplit(" by ", 1)]
    if len(parts) == 2:
        return parts[0], parts[1]
    return music.strip(), ""


def _normalise(item: dict) -> dict:
    """Convert a CopperKnob response row into our stable client-facing
    shape. All fields are safe to render — no missing-key surprises.

    ``count`` and ``wall`` are returned as int by the live API but
    documented as string; coerce both to strings for consistency.
    """
    song, artist = _split_music(item.get("music") or "")
    return {
        "ref": (item.get("ref") or "").strip(),
        "title": (item.get("title") or "").strip(),
        "choreographer": (item.get("choreographer") or "").strip(),
        "count": str(item.get("count") or "").strip(),
        "wall": str(item.get("wall") or "").strip(),
        "level": (item.get("level") or "").strip(),
        "music": (item.get("music") or "").strip(),  # keep raw for display
        "song": song,
        "artist": artist,
        "url": (item.get("url") or "").strip(),
    }


async def _request(path: str, params: Optional[dict] = None) -> Any:
    """Single point of network egress. Every non-2xx becomes a
    ``CopperKnobError`` with an appropriate HTTP status hint."""
    url = f"{BASE_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            r = await http.get(url, params=params or {}, headers=_headers())
    except httpx.TimeoutException:
        raise CopperKnobError("CopperKnob timed out", status=504)
    except httpx.RequestError as e:
        logger.info("CopperKnob transport error: %s", e)
        raise CopperKnobError("CopperKnob is unreachable", status=502)

    if r.status_code == 200:
        return r.json()
    if r.status_code == 401:
        # Never leak — the client-facing message must be generic.
        logger.warning(
            "CopperKnob 401 — API key rejected or missing"
        )
        raise CopperKnobError(
            "CopperKnob is unavailable right now", status=503
        )
    if r.status_code == 404:
        raise CopperKnobError("Stepsheet not found", status=404)
    if r.status_code == 400:
        # Bubble the bad-request through as 400 so validation errors
        # (empty q, invalid type) can hit the client cleanly.
        raise CopperKnobError("Bad CopperKnob query", status=400)
    logger.info(
        "CopperKnob %s %s → %s", r.request.method, path, r.status_code
    )
    raise CopperKnobError("CopperKnob is unavailable right now", status=502)


async def search(q: str, type_: str = "all") -> dict:
    q = (q or "").strip()
    if not q:
        raise CopperKnobError("Search query is required", status=400)
    if len(q) < 2:
        # Keeps us well under CopperKnob's implicit rate-limit and
        # avoids the "search on every keystroke" footgun.
        raise CopperKnobError("Search query must be at least 2 characters", status=400)
    type_norm = (type_ or "all").lower().strip()
    if type_norm not in SEARCH_TYPES:
        raise CopperKnobError(
            f"Invalid search type — must be one of {sorted(SEARCH_TYPES)}",
            status=400,
        )
    cache_key = f"search::{type_norm}::{q.lower()}"
    hit = _cache_get(cache_key)
    if hit is not None:
        return hit

    raw = await _request("/stepsheets/search", {"q": q, "type": type_norm})
    data = [_normalise(x) for x in (raw.get("data") or [])]
    payload = {
        "results": len(data),
        "query": raw.get("query", q),
        "type": raw.get("type", type_norm),
        "data": data,
    }
    _cache_set(cache_key, payload, _CACHE_TTL_SEARCH)
    return payload


async def most_popular() -> dict:
    cache_key = "popular"
    hit = _cache_get(cache_key)
    if hit is not None:
        return hit
    raw = await _request("/stepsheets/mostpopular")
    data = [_normalise(x) for x in (raw.get("data") or [])]
    payload = {"results": len(data), "data": data}
    _cache_set(cache_key, payload, _CACHE_TTL_POPULAR)
    return payload


async def get_by_ref(ref: str) -> dict:
    ref = (ref or "").strip().upper()
    if not ref or not ref.isalnum():
        raise CopperKnobError("Bad stepsheet reference", status=400)
    cache_key = f"ref::{ref}"
    hit = _cache_get(cache_key)
    if hit is not None:
        return hit
    raw = await _request(f"/stepsheets/{ref}")
    inner = raw.get("data") or {}
    payload = _normalise(inner)
    _cache_set(cache_key, payload, _CACHE_TTL_REF)
    return payload
