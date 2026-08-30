"""Cross-provider duplicate detection for external dance imports.

Both CopperKnob and BootStepper import flows funnel through this
module so a dance already listed under EITHER provider (or as a
manual entry) can never be added a second time by mistake.

Matching signals, best → worst:

  1. Exact match on the same provider's stored ref
     (``copperknob_ref`` or ``bootstepper_ref``)
  2. Ref inferred from the OTHER provider's stored URL — catches
     pre-integration listings where only the URL was stored
  3. Normalised ``(title, choreographer)`` exact-match — same
     dance, same artist, differs only in casing/punctuation
  4. Normalised ``(song, artist)`` exact-match with a length-safe
     title Jaccard tiebreak — catches "Copperhead Road" by
     "Michael Barr" vs. "Michael J Barr" style aliases

Everything runs against the FULL ``dances`` collection so a match
found via ANY signal is treated as a duplicate — importing from
CopperKnob will refuse if BootStepper has already added the same
dance to our library.
"""
from __future__ import annotations

import re
from typing import Optional

from core.database import db


# Punctuation we strip before comparing titles/names/songs. Kept
# conservative — apostrophes, dashes, ampersands, brackets, dots.
# Whitespace is separately collapsed to a single space.
_STRIP_PUNCT = re.compile(r"[\'\"’`,\.\-–—/&()\[\]!?:;]+")
_MULTI_WS = re.compile(r"\s+")

# Common feature-artist suffix noise we strip off song titles so
# "Copperhead Road (Radio Edit)" ~ "Copperhead Road". Extendable.
_TITLE_TAIL = re.compile(
    r"\s*(?:"
    r"\((?:radio|remaster|remix|live|acoustic|extended|clean|explicit|feat\.?|ft\.?|featuring)[^)]*\)|"
    r"\[(?:radio|remaster|remix|live|acoustic|extended|clean|explicit|feat\.?|ft\.?|featuring)[^\]]*\]|"
    r"\s+-\s+(?:radio|remaster|remix|live|acoustic|extended|clean|explicit)[^-]*"
    r")",
    re.IGNORECASE,
)


def _normalise(s: str) -> str:
    """Lowercase + strip punctuation + collapse whitespace. Empty
    strings pass through as empty."""
    if not s:
        return ""
    t = _TITLE_TAIL.sub("", s)
    t = _STRIP_PUNCT.sub(" ", t.lower())
    t = _MULTI_WS.sub(" ", t).strip()
    return t


async def _match_by_normalised(field: str, value: str) -> Optional[dict]:
    """Find a dance where the normalised form of ``field`` equals the
    normalised form of ``value``. Uses a case-insensitive regex on a
    stripped-punctuation pattern; scans at most a few hundred docs so
    it stays cheap even on the full 1.2k collection.
    """
    norm = _normalise(value)
    if not norm:
        return None
    # Build a pattern that tolerates any of the stripped punctuation
    # characters between the words of ``norm`` — e.g., "cowboy rhythm"
    # will also match "Cowboy's Rhythm".
    words = [re.escape(w) for w in norm.split(" ") if w]
    if not words:
        return None
    pattern = r"^[\s\'\"\-\.\,]*" + r"[\s\'\"\-\.\,/&()!?:;]+".join(words) + r"[\s\'\"\-\.\,!?:;]*$"
    hit = await db.dances.find_one(
        {field: {"$regex": pattern, "$options": "i"}},
        {"_id": 0},
    )
    return hit


async def find_duplicate(
    item: dict,
    *,
    source: str,
) -> Optional[dict]:
    """Return the first local dance that matches ``item`` under ANY
    of the four signals above, else ``None``.

    ``item`` is the normalised external record — shape mirrors what
    both ``services.copperknob._normalise`` and
    ``services.bootstepper._normalise`` return: at minimum ``id`` /
    ``ref``, ``title``, ``choreographer``, ``song``, ``artist``,
    ``url``.

    ``source`` is either ``"copperknob"`` or ``"bootstepper"`` — it
    only affects which ref field is checked FIRST (small perf win).
    All four signals are always evaluated.
    """
    ext_ref = (item.get("id") or item.get("ref") or "").strip()

    # ---- Signal 1: exact ref match, prefer same-source first ----
    if ext_ref:
        primary = "copperknob_ref" if source == "copperknob" else "bootstepper_ref"
        secondary = "bootstepper_ref" if source == "copperknob" else "copperknob_ref"
        # Same-source ref: an exact stored value wins.
        hit = await db.dances.find_one({primary: ext_ref}, {"_id": 0})
        if hit:
            return hit
        # Cross-source: only if the OTHER provider happens to store
        # the same opaque id — extremely rare but doesn't hurt.
        hit = await db.dances.find_one({secondary: ext_ref}, {"_id": 0})
        if hit:
            return hit

    # ---- Signal 2: same ref inferred from a stored URL ----
    if ext_ref:
        if source == "copperknob":
            url_pattern = f"/stepsheets/{re.escape(ext_ref)}"
            hit = await db.dances.find_one(
                {"copperknob_url": {"$regex": url_pattern, "$options": "i"}},
                {"_id": 0},
            )
        else:
            url_pattern = f"bootstepper\\.com/dances/{re.escape(ext_ref)}(?:$|[/?#])"
            hit = await db.dances.find_one(
                {"bootstepper_url": {"$regex": url_pattern, "$options": "i"}},
                {"_id": 0},
            )
        if hit:
            return hit

    # ---- Signal 3: normalised (title, choreographer) ----
    title = (item.get("title") or "").strip()
    chor = (item.get("choreographer") or "").strip()
    if title and chor:
        cand = await _match_by_normalised("name", title)
        if cand and _normalise(cand.get("choreographer", "")) == _normalise(chor):
            return cand
        # Also try the other direction so a slight punctuation swap
        # in either field still trips the match.
        cand = await _match_by_normalised("choreographer", chor)
        if cand and _normalise(cand.get("name", "")) == _normalise(title):
            return cand

    # ---- Signal 4: normalised (song, artist) with title tiebreak ----
    song = (item.get("song") or "").strip()
    artist = (item.get("artist") or "").strip()
    if song and artist:
        cand = await _match_by_normalised("song", song)
        if (
            cand
            and _normalise(cand.get("artist", "")) == _normalise(artist)
        ):
            # Only accept the song+artist signal if the local dance
            # title is at least loosely similar — protects against
            # "Same song, totally different choreography" false
            # positives (e.g. two dances by different choreographers
            # both use "Copperhead Road").
            if title and cand.get("name"):
                if _titles_similar(title, cand["name"]):
                    return cand
            else:
                # No title on either side to compare — song+artist
                # alone is a strong-enough signal.
                return cand

    return None


def _titles_similar(a: str, b: str) -> bool:
    """Loose Jaccard similarity on the normalised word sets. Returns
    True when the two titles share ≥ 50% of their words (order
    doesn't matter). Symmetric.
    """
    aw = set(_normalise(a).split(" "))
    bw = set(_normalise(b).split(" "))
    aw.discard("")
    bw.discard("")
    if not aw or not bw:
        return False
    inter = len(aw & bw)
    union = len(aw | bw)
    if union == 0:
        return False
    return (inter / union) >= 0.5


def duplicate_response_payload(match: dict) -> dict:
    """Shape the 409 body both provider import routes return so the
    frontend has a consistent contract."""
    return {
        "error": "already_exists",
        "existing_dance_id": match["id"],
        "existing_dance_name": match.get("name", ""),
        "has_copperknob_ref": bool(match.get("copperknob_ref")),
        "has_bootstepper_ref": bool(match.get("bootstepper_ref")),
    }
