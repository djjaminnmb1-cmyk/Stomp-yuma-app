"""Shared helper for consistent UTC ISO-8601 timestamps."""
from datetime import datetime, timezone


def now_iso() -> str:
    """Return current UTC time as an ISO-8601 string (used for `updated_at`,
    `created_at`, and rate-limit windowing everywhere in the app)."""
    return datetime.now(timezone.utc).isoformat()
