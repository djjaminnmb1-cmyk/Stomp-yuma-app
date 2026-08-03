"""In-process sliding-window rate limiting.

Simple enough for a single-server MVP. Keys are lowercased strings like
``login:jamin@example.com`` or ``code:<user_id>``.
If we ever scale to multiple backend workers, move this to Redis / Mongo TTL.
"""
from __future__ import annotations

import time as _t
from typing import Tuple

from fastapi import Request

_RATE_BUCKETS: dict[str, list[float]] = {}
_RATE_BUCKETS_MAX_KEYS = 5000  # cap memory


def throttle_check(key: str, *, max_hits: int, window_sec: float) -> Tuple[bool, float]:
    """Return ``(allowed, retry_after_seconds)``.

    Records a hit if allowed. If not allowed, returns the seconds until the
    oldest hit inside the window expires.
    """
    now = _t.monotonic()
    hits = _RATE_BUCKETS.get(key, [])
    # Drop old hits outside the window
    hits = [t for t in hits if now - t < window_sec]
    if len(hits) >= max_hits:
        oldest = hits[0]
        retry_after = max(0.5, window_sec - (now - oldest))
        _RATE_BUCKETS[key] = hits  # keep pruned list
        return False, retry_after
    hits.append(now)
    # Evict oldest keys if the store is bloated
    if len(_RATE_BUCKETS) > _RATE_BUCKETS_MAX_KEYS:
        # Drop half of the oldest keys
        for k in list(_RATE_BUCKETS.keys())[: len(_RATE_BUCKETS) // 2]:
            _RATE_BUCKETS.pop(k, None)
    _RATE_BUCKETS[key] = hits
    return True, 0.0


def throttle_reset(key: str) -> None:
    _RATE_BUCKETS.pop(key, None)


def client_ip(request: Request) -> str:
    """Best-effort caller IP for rate-limit keying.
    Trusts the first hop of X-Forwarded-For (set by our ingress) and falls
    back to the peer address."""
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return getattr(request.client, "host", "") or "unknown"
