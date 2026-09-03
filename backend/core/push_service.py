"""Emergent-managed push notification helpers.

Wraps the tiny `httpx.AsyncClient` singleton used to fire pushes to the
Emergent relay. Splitting this out lets both /register-push (user-triggered)
and the reminder scheduler (background) share the same warmed client and
consistent 401/5xx handling.
"""
from __future__ import annotations

import logging
from typing import Iterable, List, Optional

import httpx

from core.config import PUSH_BASE_URL, PUSH_KEY
from core.database import db
from core.i18n import DEFAULT_LANGUAGE, t as translate

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


async def _group_recipients_by_language(
    recipients: Iterable[str],
) -> dict[str, list[str]]:
    """Map user_id → preferred_language for every recipient. Users with
    no override (or an unsupported code) fall into the default bucket.

    Runs a single ``$in`` query, so this scales linearly with the batch
    size regardless of how many distinct languages are present.
    """
    ids = [u for u in recipients if u]
    if not ids:
        return {}
    buckets: dict[str, list[str]] = {}
    async for row in db.users.find(
        {"user_id": {"$in": ids}},
        {"_id": 0, "user_id": 1, "preferred_language": 1},
    ):
        lang = (row.get("preferred_language") or "").strip() or DEFAULT_LANGUAGE
        buckets.setdefault(lang, []).append(row["user_id"])
    # Users we didn't find in the DB (rare — deleted mid-flight) still
    # get delivered a default-language push so we don't silently swallow
    # them.
    known = {u for bucket in buckets.values() for u in bucket}
    missing = [u for u in ids if u not in known]
    if missing:
        buckets.setdefault(DEFAULT_LANGUAGE, []).extend(missing)
    return buckets


async def send_push_localised(
    recipients: Iterable[str],
    *,
    title_key: str,
    body_key: str,
    params: Optional[dict] = None,
    data: Optional[dict] = None,
    idempotency_key: Optional[str] = None,
) -> None:
    """Fire a push whose title/body are translated per recipient.

    ``title_key`` / ``body_key`` are catalog keys resolved through
    :func:`core.i18n.t`. ``params`` supplies the placeholder values
    (same dict shared across all languages). ``data`` merges any extra
    payload fields — deeplink, category identifier, event_id, etc. —
    into every localised push.

    The function groups recipients by their preferred language, fires
    one :func:`send_push` per language, and reuses ``idempotency_key``
    with the language suffix so the relay's dedupe still holds.
    """
    params = params or {}
    extra = dict(data or {})
    # Never let callers stomp title/message — those are language-owned.
    extra.pop("title", None)
    extra.pop("message", None)

    buckets = await _group_recipients_by_language(recipients)
    for lang, chunk in buckets.items():
        if not chunk:
            continue
        payload = {
            **extra,
            "title": translate(title_key, lang, **params),
            "message": translate(body_key, lang, **params),
        }
        idem = f"{idempotency_key}-{lang}" if idempotency_key else None
        await send_push(chunk, payload, idempotency_key=idem)
