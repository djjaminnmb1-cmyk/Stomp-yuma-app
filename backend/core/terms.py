"""Centralised Terms/EULA version tracking for Apple UGC compliance.

TERMS_VERSION bumps invalidate every user's cached acceptance and
force re-acceptance on next app open. Keep the version YYYY-MM-DD-N
so the audit trail is obvious. Any material change to the Terms of
Use, Community Guidelines, or Privacy Policy that affects user
consent should bump this.
"""
from __future__ import annotations

# Current live Terms/EULA version. Bumped on 2026-06-24 to add
# Apple-mandated zero-tolerance clause + explicit UGC rules (post-
# Apple Guideline 1.2 rejection response).
TERMS_VERSION = "2026-06-24"

# Version required for the app to be usable. Anything below this and
# the client is redirected to the Terms Accept screen before any
# further API call succeeds.
MIN_TERMS_VERSION = "2026-06-24"

__all__ = ["TERMS_VERSION", "MIN_TERMS_VERSION"]
