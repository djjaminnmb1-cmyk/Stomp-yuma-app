"""BootStepper API proxy — the ONLY module that talks to
``api.bootstepper.com``.

Why isolate it here
-------------------
- The API key MUST stay server-side; clients never see it.
- BootStepper's Terms of Use forbid mirroring / scraping / storing
  step-by-step choreography content. This module only ever handles
  the small metadata blocks the API returns — no scraping, no
  ``includeStepSheet=true``, no persisting of stepsheet text.
- BootStepper enforces its own limits (default max 20 per page); we
  centralise that here so route handlers never care about pagination
  cursors.

Endpoints exposed
-----------------
- ``search(q, limit)``          → wraps GET ``/dances/search``
- ``most_popular(limit)``       → wraps GET ``/dances/search?sortBy=videoCount``
- ``get_by_id(id_)``            → wraps GET ``/dances/getById``

Each returns a normalised dict (see ``_normalise``) with the SAME
field names as our CopperKnob normalizer so downstream duplicate
detection / import review can treat both providers identically.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.bootstepper.com"

# Short in-process cache so a burst of identical queries (typing +
# debounce races, admin comparing multiple candidates) doesn't hammer
# BootStepper. Deliberately not backed by Redis — the payloads are
# tiny and per-worker locality is fine for our traffic shape.
_CACHE: dict[str, tuple[float, Any]] = {}
_CACHE_TTL_SEARCH = 60           # seconds
_CACHE_TTL_POPULAR = 15 * 60     # popular list barely moves
_CACHE_TTL_ID = 15 * 60          # single-id lookups
_MAX_CACHE_ENTRIES = 256

# Hard cap on results returned from either search or popular. Matches
# CopperKnob's 50 so the client-facing UX is symmetric even though
# BootStepper's own API only defaults to ~20 per page.
MAX_RESULTS = 50


class BootStepperError(Exception):
    """Raised for any non-2xx / network / config failure.

    Route handlers convert this to a friendly 502/503 so the user
    sees "BootStepper is unavailable right now" instead of a stack
    trace. Never surface the raw message to clients — it may echo
    request details.
    """

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def is_configured() -> bool:
    return bool(os.environ.get("BOOTSTEPPER_API_KEY", "").strip())


def _headers() -> dict:
    key = os.environ.get("BOOTSTEPPER_API_KEY", "").strip()
    if not key:
        raise BootStepperError(
            "BootStepper API key not configured on the server",
            status=503,
        )
    return {
        "X-BootStepper-API-Key": key,
        "Accept": "application/json",
        # Polite User-Agent so BootStepper operators can identify us
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
        # No need for LRU precision here.
        drop = sorted(_CACHE.items(), key=lambda kv: kv[1][0])[
            : max(1, len(_CACHE) // 10)
        ]
        for k, _ in drop:
            _CACHE.pop(k, None)
    _CACHE[key] = (time.time() + ttl, value)


def _first(seq: Any) -> Optional[dict]:
    """Return the first item of a list-ish value or None."""
    if isinstance(seq, list) and seq:
        return seq[0]
    return None


def _dance_public_url(dance_id: str) -> str:
    """Canonical public URL for a BootStepper dance. Confirmed 200 on
    ``https://bootstepper.com/dances/{id}``."""
    d = (dance_id or "").strip()
    if not d:
        return ""
    return f"https://bootstepper.com/dances/{d}"


def _normalise(item: dict) -> dict:
    """Convert a BootStepper API row into our stable client-facing
    shape. Field names deliberately mirror CopperKnob's normaliser so
    downstream code (duplicate detection, import review, compare
    sheets) can treat either provider interchangeably.
    """
    if not isinstance(item, dict):
        return {}

    dc = _first(item.get("danceChoreographers")) or {}
    chor = (dc.get("choreographer") or {}) if isinstance(dc, dict) else {}
    ds = _first(item.get("danceSongs")) or {}
    song_obj = (ds.get("song") or {}) if isinstance(ds, dict) else {}

    song_title = (song_obj.get("title") or "").strip()
    artist = (song_obj.get("artist") or "").strip()

    music = " - ".join([p for p in (song_title, artist) if p]).strip()

    return {
        # NOTE: for BootStepper the stable identifier is called ``id``
        # (not ``ref`` like CopperKnob). We echo BOTH keys so mixed
        # code paths that expect either name keep working — the
        # authoritative one is ``id``.
        "id": (item.get("id") or "").strip(),
        "ref": (item.get("id") or "").strip(),
        "title": (item.get("title") or "").strip(),
        "choreographer": (chor.get("name") or "").strip(),
        "choreographer_country": (chor.get("country") or "").strip(),
        "count": str(item.get("counts") or "").strip(),
        "wall": str(item.get("walls") or "").strip(),
        "level": (item.get("difficultyLevel") or "").strip(),
        "music": music,
        "song": song_title,
        "artist": artist,
        "url": _dance_public_url(item.get("id") or ""),
        # Extra colour BootStepper gives us for free — used by the UI
        # to sort/label "popular" items. Not part of duplicate
        # detection.
        "video_count": int(item.get("videoCount") or 0),
        "tags_count": int(item.get("tags") or 0),
        "restarts": int(item.get("restarts") or 0),
    }


async def _request(path: str, params: Optional[dict] = None) -> Any:
    """Single point of network egress. Every non-2xx becomes a
    ``BootStepperError`` with an appropriate HTTP status hint.

    Retries transparent on 429 (rate limit) and 503 (service unavailable)
    with exponential backoff — 3 attempts total, 1s → 2s → 4s. Any other
    non-2xx or transport error surfaces immediately. Rate-limiting is the
    only expected transient failure for our workload (batch sync sweeps),
    so this keeps the monthly job resilient without ballooning latency
    for interactive callers.
    """
    url = f"{BASE_URL}{path}"
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=10.0) as http:
                r = await http.get(url, params=params or {}, headers=_headers())
        except httpx.TimeoutException:
            raise BootStepperError("BootStepper timed out", status=504)
        except httpx.RequestError as e:
            logger.info("BootStepper transport error: %s", e)
            raise BootStepperError("BootStepper is unreachable", status=502)

        if r.status_code == 200:
            break
        if r.status_code in (429, 503) and attempt < max_retries:
            retry_after_hdr = r.headers.get("Retry-After", "").strip()
            wait_s: float
            if retry_after_hdr.isdigit():
                wait_s = min(int(retry_after_hdr), 30)
            else:
                wait_s = 2 ** (attempt - 1)
            logger.info(
                "BootStepper %s → %s, sleeping %.1fs (attempt %d/%d)",
                path, r.status_code, wait_s, attempt, max_retries,
            )
            await asyncio.sleep(wait_s)
            continue
        break

    if r.status_code == 200:
        # BootStepper occasionally returns a 200 with an empty body
        # for lookups where the id is well-formed but doesn't exist
        # (e.g. copy-paste typo). Treat that as a not-found instead
        # of blowing up on ``r.json()`` — the caller then produces a
        # clean 404 through the ``BootStepperError`` path.
        if not r.content or not r.content.strip():
            raise BootStepperError("Dance not found", status=404)
        try:
            return r.json()
        except ValueError:
            logger.info(
                "BootStepper %s %s → 200 with non-JSON body (len=%s)",
                r.request.method,
                path,
                len(r.content),
            )
            raise BootStepperError(
                "BootStepper returned an unexpected response",
                status=502,
            )
    if r.status_code == 401:
        # Never leak — the client-facing message must be generic.
        logger.warning(
            "BootStepper 401 — API key rejected or missing"
        )
        raise BootStepperError(
            "BootStepper is unavailable right now", status=503
        )
    if r.status_code == 404:
        raise BootStepperError("Dance not found", status=404)
    if r.status_code == 400:
        # Bubble the bad-request through as 400 so validation errors
        # (empty q, invalid sort etc.) can hit the client cleanly.
        raise BootStepperError("Bad BootStepper query", status=400)
    logger.info(
        "BootStepper %s %s → %s", r.request.method, path, r.status_code
    )
    raise BootStepperError("BootStepper is unavailable right now", status=502)


def _clamp_limit(limit: Optional[int]) -> int:
    try:
        n = int(limit) if limit is not None else 20
    except (TypeError, ValueError):
        n = 20
    return max(1, min(n, MAX_RESULTS))


async def search(q: str, limit: Optional[int] = 20) -> dict:
    q = (q or "").strip()
    if not q:
        raise BootStepperError("Search query is required", status=400)
    if len(q) < 2:
        # Keeps us well under BootStepper's implicit rate-limit and
        # avoids the "search on every keystroke" footgun.
        raise BootStepperError(
            "Search query must be at least 2 characters", status=400
        )

    n = _clamp_limit(limit)
    cache_key = f"search::{n}::{q.lower()}"
    hit = _cache_get(cache_key)
    if hit is not None:
        return hit

    raw = await _request(
        "/dances/search",
        {"query": q, "limit": n, "sortBy": "relevance"},
    )
    items = raw.get("items") or []
    data = [_normalise(x) for x in items]
    payload = {
        "results": len(data),
        "query": q,
        "data": data,
    }
    _cache_set(cache_key, payload, _CACHE_TTL_SEARCH)
    return payload


async def most_popular(limit: Optional[int] = 30) -> dict:
    """BootStepper doesn't expose a hard "popular" endpoint like
    CopperKnob does — the closest surrogate is dances with the most
    demo/teach videos on the site. Using ``sortBy=videoCount desc``
    consistently surfaces the community-favourite titles.
    """
    n = _clamp_limit(limit)
    cache_key = f"popular::{n}"
    hit = _cache_get(cache_key)
    if hit is not None:
        return hit

    raw = await _request(
        "/dances/search",
        {"limit": n, "sortBy": "videoCount", "sortOrder": "desc"},
    )
    items = raw.get("items") or []
    data = [_normalise(x) for x in items]
    payload = {"results": len(data), "data": data}
    _cache_set(cache_key, payload, _CACHE_TTL_POPULAR)
    return payload


async def get_by_id(id_: str) -> dict:
    """Fetch a single BootStepper dance by its stable ID.

    We intentionally DO NOT pass ``includeStepSheet=true`` — SGY has
    no licence to persist or display third-party step-by-step
    instructions; the app links out for that content.
    """
    idn = (id_ or "").strip()
    if not idn:
        raise BootStepperError("Bad BootStepper id", status=400)
    # BootStepper IDs are opaque alphanumeric — keep the check
    # permissive but reject anything obviously URL-hostile.
    if not idn.replace("-", "").replace("_", "").isalnum():
        raise BootStepperError("Bad BootStepper id", status=400)
    cache_key = f"id::{idn}"
    hit = _cache_get(cache_key)
    if hit is not None:
        return hit
    raw = await _request(
        "/dances/getById",
        {"id": idn, "includeVideos": "false", "includeStepSheet": "false"},
    )
    payload = _normalise(raw or {})
    if not payload.get("id"):
        raise BootStepperError("Dance not found", status=404)
    _cache_set(cache_key, payload, _CACHE_TTL_ID)
    return payload
