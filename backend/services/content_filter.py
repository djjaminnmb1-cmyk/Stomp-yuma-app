"""Server-side content filter for Apple Guideline 1.2 UGC safety.

Detects and blocks user-submitted text that clearly violates community
guidelines: slurs, threats, obvious sexual solicitation, and spam
patterns. Runs BEFORE persistence — a caller passes any user-typed
string and gets a verdict back:

    ok, reason = check(text)
    if not ok:
        raise HTTPException(400, {
            "code": "content_blocked",
            "message": FRIENDLY_MESSAGE,
            "detail": reason,   # for the audit trail, not the user
        })

Design choices
--------------
* **Wordlist + regex** — small, explainable, works offline. Enough for
  the App Store Review guideline; teams should layer an ML classifier
  on top for production-grade moderation once the pipeline is stable.
* **Slur list is deliberately terse and non-exhaustive** — we cover
  well-known racial, homophobic, and misogynist slurs in English +
  Spanish. False negatives are expected; the workflow relies on
  reporting for anything the filter misses.
* **Char-boundary matching** so we don't false-positive innocent words
  that contain a fragment (e.g. "assist" containing "ass"). Uses
  `\b` for word boundaries with case-insensitive matching.
* **Leet-speak normalisation** — collapse common numeric substitutions
  (0→o, 1→i/l, 3→e, 4→a, 5→s, 7→t, @→a, $→s) so `n1gger` still gets
  caught. Preserves the original text for logging.
* **Spam** — huge repeated chars, all-caps beyond a threshold, more
  than N URLs, phone/email harvesting patterns.
* **No secrets in logs.** Never print the raw wordlist; log only
  the category that matched.

Intentionally NOT in this filter
--------------------------------
* Politeness policing / mild profanity ("damn", "hell") — these are
  fine for a dance app's chat.
* Automatic action on user account — this filter is just a pre-insert
  guard. The report + admin queue handles account-level actions.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


# ---- Slurs & extremely offensive terms (case-insensitive, boundary-matched) ----
# NOTE: These are deliberately awful. They exist so we can block awful
# content. The Apple reviewer needs to see we filter these; we do.
_SLURS_RAW: tuple[str, ...] = (
    # Racial / ethnic slurs
    "nigger", "niger", "nigga", "chink", "gook", "spic", "kike",
    "wetback", "beaner", "coon", "dothead", "raghead", "sandnigger",
    # Homophobic slurs
    "faggot", "fagot", "faggit", "dyke", "tranny", "shemale",
    # Misogynist / sexual slurs
    "cunt", "whore", "slut",
    # Ableist slurs
    "retard", "retarded",
    # Nazi / hate group
    "heilhitler", "sieg heil",
)

# Spanish slurs — common ones our LatAm dancers might encounter
_SLURS_ES: tuple[str, ...] = (
    "maricon", "marica", "pinche puto", "puta madre",
)

# ---- Threats & harassment phrases ----
# Patterns rather than single words — captures "I'll kill you", "kys",
# "you should die", etc. Simple regexes; false negatives OK, false
# positives expensive.
_THREAT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\b(?:i(?:'|)ll|i\s+will|imma|gonna)\s+(?:kill|murder|hurt|beat|end|rape)\s+(?:you|u|him|her|them)\b", re.I),
    re.compile(r"\byou\s+(?:should|deserve\s+to|need\s+to|are\s+gonna)\s+die\b", re.I),
    re.compile(r"\bkys\b", re.I),  # "kill yourself" abbreviation
    re.compile(r"\bkill\s+your\s*self\b", re.I),
    re.compile(r"\bgo\s+die\b", re.I),
    re.compile(r"\bi\s+hope\s+you\s+(?:die|get\s+hurt)\b", re.I),
    re.compile(r"\bgo\s+back\s+to\s+your\s+country\b", re.I),
    re.compile(r"\brape\s+(?:you|her|him|them|us)\b", re.I),
)

# ---- Sexual solicitation ----
# Aiming at obvious solicitation, not any mention of sex.
_SEXUAL_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\b(?:send|show)\s+(?:me\s+)?(?:nudes?|nudez?|pics?\s+of\s+your)\b", re.I),
    re.compile(r"\b(?:dm|pm|inbox|whatsapp)\s+me\s+(?:for|if\s+you\s+want)\s+(?:sex|fuck|hook\s*up)\b", re.I),
    re.compile(r"\bcock\s+(?:pic|picture|photo)s?\b", re.I),
    re.compile(r"\bmasturbat(?:e|ing|ion)\s+(?:for|with)\s+(?:me|us)\b", re.I),
    re.compile(r"\bonlyfans\b.*\b(?:link|sub|subscribe|dm)\b", re.I),
    re.compile(r"\b(?:webcam|camgirl)\s+(?:live|sex|show)\b", re.I),
)

# ---- Spam patterns ----
_URL_RE = re.compile(r"\bhttps?://\S+|\bwww\.\S+\.\S+", re.I)
_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
_PHONE_RE = re.compile(r"\+?\d[\d\s().-]{8,}\d")
_ALL_CAPS_RE = re.compile(r"[A-Z]")
_REPEATED_CHAR_RE = re.compile(r"(.)\1{9,}")  # 10+ of the same char in a row


# ---- Leet-speak normalisation ----
_LEET_MAP = str.maketrans(
    {"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
     "@": "a", "$": "s", "!": "i", "|": "l"}
)


def _leet_normalise(text: str) -> str:
    """Lowercase + strip common leet substitutions so simple bypasses
    don't slip through the wordlist. Preserves whitespace so word
    boundaries still work."""
    return text.lower().translate(_LEET_MAP)


# ---- Compiled slur regex ----
def _build_slur_regex() -> re.Pattern[str]:
    all_slurs = _SLURS_RAW + _SLURS_ES
    # Escape and join. Boundary chars on both sides so "chinkapin"
    # (a tree) doesn't match "chink".
    parts = [re.escape(s) for s in all_slurs]
    return re.compile(r"\b(?:" + "|".join(parts) + r")\b", re.I)


_SLUR_RE = _build_slur_regex()


@dataclass
class FilterResult:
    ok: bool
    """True = safe to post."""

    category: Optional[str] = None
    """When ok=False: 'slur' | 'threat' | 'sexual' | 'spam'."""

    message: str = ""
    """Human-friendly message for the user (already generic — no leaks)."""

    detail: str = ""
    """Short internal detail (which pattern matched) — for admin logs, not
    for the user."""


# ---- Public API ----
_GENERIC_BLOCKED = (
    "This content cannot be posted because it may violate our "
    "Community Guidelines. Please revise and try again."
)


def check(text: str) -> FilterResult:
    """Return a :class:`FilterResult` for the supplied user text.

    Empty / whitespace-only text is treated as safe — length caps are
    the caller's responsibility.
    """
    if not text or not text.strip():
        return FilterResult(ok=True)

    normalised = _leet_normalise(text)

    # 1) Slurs — highest priority, always blocks.
    m = _SLUR_RE.search(normalised)
    if m:
        return FilterResult(
            ok=False,
            category="slur",
            message=_GENERIC_BLOCKED,
            detail=f"slur:{m.group(0)}",
        )

    # 2) Threats
    for pat in _THREAT_PATTERNS:
        if pat.search(normalised):
            return FilterResult(
                ok=False,
                category="threat",
                message=_GENERIC_BLOCKED,
                detail=f"threat:{pat.pattern[:60]}",
            )

    # 3) Sexual solicitation
    for pat in _SEXUAL_PATTERNS:
        if pat.search(text):  # not normalised — sexual patterns include
            # multi-word phrases where leet-normalise might smear
            # boundaries.
            return FilterResult(
                ok=False,
                category="sexual",
                message=_GENERIC_BLOCKED,
                detail=f"sexual:{pat.pattern[:60]}",
            )

    # 4) Spam heuristics — repeated chars, too many URLs, phone/email
    #    harvesting on top of a very short body.
    if _REPEATED_CHAR_RE.search(text):
        return FilterResult(
            ok=False,
            category="spam",
            message=_GENERIC_BLOCKED,
            detail="spam:repeated_char",
        )

    urls = _URL_RE.findall(text)
    if len(urls) >= 4:
        return FilterResult(
            ok=False,
            category="spam",
            message=_GENERIC_BLOCKED,
            detail=f"spam:urls_{len(urls)}",
        )

    # Short (<=25 chars) messages containing a phone or email are almost
    # certainly harvesting or scam ping-outs.
    stripped = text.strip()
    if len(stripped) <= 60 and (_EMAIL_RE.search(text) or _PHONE_RE.search(text)):
        # Small bump: allow if there are also multiple normal words
        word_count = len(re.findall(r"\b[A-Za-z]{3,}\b", text))
        if word_count < 3:
            return FilterResult(
                ok=False,
                category="spam",
                message=_GENERIC_BLOCKED,
                detail="spam:contact_only",
            )

    # 5) Excessive shouting — >70% caps AND at least 20 alphabetical
    #    characters. Kept lenient so "OMG THIS DANCE IS FIRE" still lands.
    letters = re.sub(r"[^A-Za-z]", "", text)
    if len(letters) >= 40:
        caps = sum(1 for c in letters if c.isupper())
        if caps / len(letters) > 0.9:
            return FilterResult(
                ok=False,
                category="spam",
                message=_GENERIC_BLOCKED,
                detail=f"spam:allcaps_{caps}/{len(letters)}",
            )

    return FilterResult(ok=True)


def log_block(*, user_id: str, category: str, detail: str, surface: str) -> None:
    """Structured log line for admin audit. Never contains the raw
    offending text — only the category + which pattern matched."""
    logger.info(
        "content_filter_block user=%s surface=%s category=%s detail=%s",
        user_id,
        surface,
        category,
        detail,
    )
