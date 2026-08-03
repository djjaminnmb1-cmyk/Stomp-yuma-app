"""iTunes song preview proxy for the Practice Mode player.

The frontend Practice Mode plays a 30-second iTunes preview at the shown
BPM. We proxy the free iTunes Search API through the backend so:

1. Mobile browsers / restrictive networks with cross-origin blocks or
   no direct HTTPS route to itunes.apple.com still get a preview.
2. We can cache lookups server-side so opening the same dance twice is
   instant even after a JS-runtime reload.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter()

_ITUNES_CACHE: dict[str, Optional[dict]] = {}


@router.get("/song-preview")
async def song_preview(song: str = "", artist: str = ""):
    """Return ``{previewUrl, trackName, artistName, artworkUrl}`` or 404."""
    s = (song or "").strip()
    a = (artist or "").strip()
    if not s:
        raise HTTPException(400, "song is required")
    if len(s) + len(a) > 200:
        raise HTTPException(400, "query too long")

    cache_key = f"{s.lower()}|{a.lower()}"
    if cache_key in _ITUNES_CACHE:
        hit = _ITUNES_CACHE[cache_key]
        if hit is None:
            raise HTTPException(404, "No preview found")
        return hit

    async def _lookup(term: str) -> Optional[dict]:
        url = "https://itunes.apple.com/search"
        params = {
            "media": "music",
            "entity": "song",
            "limit": "5",
            "term": term,
        }
        try:
            async with httpx.AsyncClient(timeout=8.0) as hc:
                resp = await hc.get(url, params=params, headers={
                    "User-Agent": "StompinGroundYuma/1.0 (mobile app)",
                })
                if resp.status_code != 200:
                    return None
                data = resp.json()
        except Exception as e:  # network / parsing errors
            logger.info("iTunes lookup failed for %r: %s", term, e)
            return None
        for r in (data.get("results") or []):
            if r.get("previewUrl"):
                return {
                    "previewUrl": r.get("previewUrl") or "",
                    "trackName": r.get("trackName") or "",
                    "artistName": r.get("artistName") or "",
                    "artworkUrl": r.get("artworkUrl100") or r.get("artworkUrl60") or "",
                    "provider": "itunes",
                }
        return None

    primary_term = f"{s} {a}".strip() if a else s
    hit = await _lookup(primary_term)
    if not hit and a:
        # Fall back to song-only in case the artist string is odd/generic.
        hit = await _lookup(s)

    # Cap the cache to prevent unbounded growth if attackers flood us with
    # unique queries. Simple FIFO-ish eviction is fine here.
    if len(_ITUNES_CACHE) > 5000:
        _ITUNES_CACHE.clear()
    _ITUNES_CACHE[cache_key] = hit

    if not hit:
        raise HTTPException(404, "No preview found")
    return hit
