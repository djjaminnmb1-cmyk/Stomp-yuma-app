"""Emergent-managed push notification helpers.

Wraps the tiny `httpx.AsyncClient` singleton used to fire pushes to the
Emergent relay. Splitting this out lets both /register-push (user-triggered)
and the reminder scheduler (background) share the same warmed client and
consistent 401/5xx handling.
"""
from __future__ import annotations

import logging
from typing import List, Optional

import httpx

from core.config import PUSH_BASE_URL, PUSH_KEY

logger = logging.getLogger(__name__)

# Single warm client — reused across the process.
push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)


async def send_push(
    recipients: List[str],
    data: dict,
    idempotency_key: Optional[str] = None,
) -> None:
    """Fire a push notification to up to any number of recipients.

    Chunks into groups of 100 (Emergent relay limit). Absorbs 401/5xx as
    warnings so a broken push provider never blocks a foreground API call.
    """
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    # Chunk to 100
    for i in range(0, len(recipients), 100):
        chunk = recipients[i:i + 100]
        payload: dict = {"recipients": chunk, "data": data}
        if idempotency_key:
            payload["$idempotency_key"] = f"{idempotency_key}-{i}"
        resp = await push_client.post("/api/v1/push/trigger", json=payload)
        if resp.status_code == 401:
            logger.warning("EMERGENT_PUSH_KEY missing or invalid — skipping push")
            return
        if resp.status_code >= 500:
            logger.warning(f"Push provider unavailable: {resp.status_code}")
            return
        try:
            resp.raise_for_status()
        except Exception as e:
            logger.warning(f"Push trigger error: {e}")
