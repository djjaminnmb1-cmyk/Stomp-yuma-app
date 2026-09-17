"""Rich link previews for URLs pasted in the instructor chat.

Supported sources
-----------------
1. **YouTube** — public oEmbed endpoint. No API key required.  Handles
   ``youtube.com/watch?v=…``, ``youtu.be/…``, ``youtube.com/shorts/…``
   and ``youtube.com/embed/…``.
2. **BootStepper** — uses the existing ``BOOTSTEPPER_API_KEY`` env var
   already wired into ``services/bootstepper.py``.  Skipped gracefully
   if the key isn't configured.
3. **CopperKnob** — same story via ``services/copperknob.py`` and
   ``COPPERKNOB_API_KEY``.

Storage
-------
Successful previews are cached in the ``link_previews`` collection so
we don't re-fetch on every 6-second chat poll.  Each row is keyed by
a canonical URL string (lower-cased, tracker-stripped) and carries a
``fetched_at`` timestamp; readers accept anything less than a week
old before re-fetching.

Contract
--------

    ``preview_for_message(text) -> list[dict]``  — extracts URLs,
    resolves the ones we know how to preview, returns compact preview
    dicts ready to embed in the chat response.

    ``extract_urls(text) -> list[str]``  — best-effort URL scanner
    used by both the message-write path and unit tests.

A preview dict always has:

    {
      "url":       original URL as pasted (with query string preserved
                   so YouTube timestamps still work when tapped),
      "kind":      "youtube" | "bootstepper" | "copperknob",
      "title":     short display title,
      "subtitle":  optional secondary line (channel / choreographer),
      "thumbnail": absolute HTTPS URL (may be "" if we don't have one),
      "meta":      short extra info (duration / BPM / difficulty).
    }
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from typing import Optional
from urllib.parse import parse_qs, unquote, urlparse

import httpx

from core.database import db
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)


# ---------------- URL extraction ----------------
# A generous but conservative URL matcher — deliberately narrower than
# a full RFC-compliant one because chat messages are informal and we
# only need the http(s) subset.
_URL_RE = re.compile(
    r"""
    (?<![\w@/])                   # not in an @handle or path segment
    (https?://[^\s<>"']+?)        # http:// or https:// + body
    (?=[\s<>"']|[.,;:)!?]?(?:\s|$))  # trailing punct is stripped
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Preview is capped per-message so a pasted wall of links can't blow
# up the API response or drain external API quota.
_MAX_PREVIEWS_PER_MESSAGE = 3

# One week in seconds — YouTube titles rarely change; step-sheet
# metadata almost never does.
_CACHE_TTL_SECONDS = 7 * 24 * 3600


def extract_urls(text: str) -> list[str]:
    """Return the URLs mentioned in ``text``, de-duplicated, up to the
    per-message cap. Trailing punctuation is stripped so
    ``see https://example.com.`` yields the clean URL.
    """
    if not text:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for m in _URL_RE.finditer(text):
        raw = m.group(1)
        # Trim trailing punctuation that shouldn't be part of the URL.
        raw = raw.rstrip(".,;:!?)")
        if not raw or raw in seen:
            continue
        seen.add(raw)
        out.append(raw)
        if len(out) >= _MAX_PREVIEWS_PER_MESSAGE:
            break
    return out


def _canonical(url: str) -> str:
    """Lower-case scheme+host, strip common tracking params so cache
    hits are stable across "same URL, different tracking".
    """
    if not url:
        return ""
    try:
        p = urlparse(url)
    except Exception:
        return url.lower()
    scheme = (p.scheme or "https").lower()
    host = (p.netloc or "").lower()
    path = p.path or ""
    # Drop utm_* / fbclid / gclid / si / feature — YouTube's own share
    # links append `si=…` which is a tracking identifier.
    if p.query:
        keep = []
        for pair in p.query.split("&"):
            key = pair.split("=", 1)[0].lower()
            if key.startswith("utm_") or key in {
                "fbclid", "gclid", "si", "feature",
            }:
                continue
            keep.append(pair)
        query = "&".join(keep)
    else:
        query = ""
    tail = "?" + query if query else ""
    return f"{scheme}://{host}{path}{tail}"


# ---------------- Source detection ----------------
def _classify(url: str) -> Optional[str]:
    """Return the preview ``kind`` for a URL, or ``None`` if we don't
    know how to preview it. Deliberately narrow — we only want to
    render previews we're confident about.
    """
    try:
        host = (urlparse(url).netloc or "").lower()
    except Exception:
        return None
    if host in ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com") \
       or host.endswith(".youtube.com"):
        return "youtube"
    if host in ("youtu.be", "www.youtu.be"):
        return "youtube"
    if host in ("bootstepper.com", "www.bootstepper.com") \
       or host.endswith(".bootstepper.com"):
        return "bootstepper"
    if host in ("copperknob.co.uk", "www.copperknob.co.uk") \
       or host.endswith(".copperknob.co.uk"):
        return "copperknob"
    return None


# ---------------- YouTube ----------------
def _youtube_video_id(url: str) -> Optional[str]:
    """Extract the 11-char video id from any YouTube URL shape we
    support. Returns None if the shape is unusual.
    """
    try:
        p = urlparse(url)
    except Exception:
        return None
    host = (p.netloc or "").lower()
    if host in ("youtu.be", "www.youtu.be"):
        seg = p.path.lstrip("/").split("/", 1)[0]
        return seg or None
    path = p.path or ""
    if path.startswith("/watch"):
        vid = parse_qs(p.query).get("v", [""])[0]
        return vid or None
    if path.startswith("/shorts/"):
        return path[len("/shorts/"):].split("/", 1)[0] or None
    if path.startswith("/embed/"):
        return path[len("/embed/"):].split("/", 1)[0] or None
    return None


async def _fetch_youtube(url: str) -> Optional[dict]:
    """Hit YouTube's public oEmbed endpoint. No API key needed."""
    vid = _youtube_video_id(url)
    if not vid:
        return None
    endpoint = "https://www.youtube.com/oembed"
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(
                endpoint,
                params={"url": f"https://www.youtube.com/watch?v={vid}", "format": "json"},
                headers={"User-Agent": "StompinGroundYuma/1.0"},
            )
        if r.status_code != 200:
            return None
        data = r.json()
    except Exception as e:  # network / json flake
        logger.info(f"YouTube oEmbed miss for {vid}: {e}")
        return None
    return {
        "url": url,
        "kind": "youtube",
        "title": (data.get("title") or "").strip() or "YouTube video",
        "subtitle": (data.get("author_name") or "").strip(),
        # Prefer the high-res thumbnail served on i.ytimg.com.
        "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
        "meta": "",
    }


# ---------------- BootStepper ----------------
_BOOTSTEPPER_ID_RE = re.compile(r"/(?:dance|stepsheet)/(\d+)")


async def _fetch_bootstepper(url: str) -> Optional[dict]:
    from services import bootstepper as bs  # lazy — avoid startup cost
    if not bs.is_configured():
        return None
    m = _BOOTSTEPPER_ID_RE.search(urlparse(url).path or "")
    if not m:
        return None
    dance_id = m.group(1)
    try:
        item = await bs.get_by_id(dance_id)
    except Exception as e:
        logger.info(f"BootStepper preview miss for {dance_id}: {e}")
        return None
    if not item:
        return None
    dance = item.get("dance") if isinstance(item, dict) else None
    d = dance or item
    return {
        "url": url,
        "kind": "bootstepper",
        "title": (d.get("name") or d.get("title") or "").strip() or "BootStepper dance",
        "subtitle": (d.get("choreographer") or "").strip(),
        "thumbnail": "",  # BootStepper API doesn't return thumbnails
        "meta": _dance_meta(d),
    }


# ---------------- CopperKnob ----------------
_COPPERKNOB_ID_RE = re.compile(r"/(?:stepsheet|dance)/(\d+)")


async def _fetch_copperknob(url: str) -> Optional[dict]:
    from services import copperknob as ck  # lazy
    if not ck.is_configured():
        return None
    m = _COPPERKNOB_ID_RE.search(urlparse(url).path or "")
    if not m:
        return None
    stepsheet_id = m.group(1)
    try:
        result = await ck.search(q=stepsheet_id, type_="dance")
    except Exception as e:
        logger.info(f"CopperKnob preview miss for {stepsheet_id}: {e}")
        return None
    items = (result or {}).get("dances") or (result or {}).get("items") or []
    d = items[0] if items else None
    if not d:
        return None
    return {
        "url": url,
        "kind": "copperknob",
        "title": (d.get("name") or "").strip() or "CopperKnob step sheet",
        "subtitle": (d.get("choreographer") or "").strip(),
        "thumbnail": "",
        "meta": _dance_meta(d),
    }


def _dance_meta(d: dict | None) -> str:
    """Short "60 BPM · Improver · 32 count" line for step-sheet cards."""
    if not d:
        return ""
    parts: list[str] = []
    bpm = d.get("bpm")
    if bpm:
        parts.append(f"{bpm} BPM")
    diff = (d.get("difficulty") or "").strip()
    if diff:
        parts.append(diff)
    cnt = d.get("count") or d.get("counts")
    if cnt:
        parts.append(f"{cnt} count")
    return " · ".join(parts)


# ---------------- Public entrypoint ----------------
_FETCHERS = {
    "youtube": _fetch_youtube,
    "bootstepper": _fetch_bootstepper,
    "copperknob": _fetch_copperknob,
}


async def _cached_preview(url: str, kind: str) -> Optional[dict]:
    """Look up a fresh preview in Mongo before hitting the network.
    Returns the preview dict (without the ``fetched_at`` field) or
    None on miss.
    """
    canon = _canonical(url)
    if not canon:
        return None
    doc = await db.link_previews.find_one({"canonical": canon}, {"_id": 0})
    if not doc:
        return None
    ts = doc.get("fetched_at_ts") or 0
    if time.time() - ts > _CACHE_TTL_SECONDS:
        return None
    preview = doc.get("preview") or {}
    # Overlay the ORIGINAL URL (with query string) so tapping the card
    # honours things like a YouTube ``&t=42`` timestamp the user pasted.
    if preview:
        preview = dict(preview)
        preview["url"] = url
    return preview


async def _store_preview(url: str, preview: dict) -> None:
    canon = _canonical(url)
    if not canon or not preview:
        return
    try:
        await db.link_previews.update_one(
            {"canonical": canon},
            {
                "$set": {
                    "canonical": canon,
                    "preview": preview,
                    "fetched_at": now_iso(),
                    "fetched_at_ts": time.time(),
                }
            },
            upsert=True,
        )
    except Exception:
        # Non-fatal — cache misses just re-fetch next time.
        pass


async def preview_for_message(text: str) -> list[dict]:
    """Resolve up to ``_MAX_PREVIEWS_PER_MESSAGE`` link cards for a
    chat body. Everything is best-effort — a failed fetcher yields
    an empty list, never raises.
    """
    urls = extract_urls(text or "")
    if not urls:
        return []
    async def _one(url: str) -> Optional[dict]:
        kind = _classify(url)
        if not kind:
            return None
        cached = await _cached_preview(url, kind)
        if cached:
            return cached
        fetcher = _FETCHERS.get(kind)
        if not fetcher:
            return None
        try:
            preview = await fetcher(url)
        except Exception as e:
            logger.info(f"link preview fetch failed for {url}: {e}")
            return None
        if preview:
            await _store_preview(url, preview)
        return preview
    # Fan out — YouTube's oEmbed is fast and public, the others are
    # keyed. Parallel keeps a message with 3 links snappy.
    results = await asyncio.gather(*[_one(u) for u in urls], return_exceptions=False)
    return [p for p in results if p]


async def ensure_indexes() -> None:
    """Compound unique index on the canonical URL. Idempotent."""
    try:
        await db.link_previews.create_index(
            "canonical", unique=True, name="uniq_canonical"
        )
    except Exception as e:  # pragma: no cover
        logger.warning(f"link_previews index setup failed: {e}")
