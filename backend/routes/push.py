"""Push token registration endpoint (proxies to Emergent's push relay)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from core.push_service import push_client
from core.security import get_current_user
from models.schemas import RegisterPushBody

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/register-push", status_code=201)
async def register_push(
    body: RegisterPushBody, user: dict = Depends(get_current_user)
):
    # Ignore any client-supplied user_id — bind to the authenticated caller.
    payload = body.model_dump()
    payload["user_id"] = user["user_id"]
    try:
        resp = await push_client.post(
            "/api/v1/push/users/register", json=payload
        )
    except Exception as e:
        logger.warning(f"Push register upstream unreachable: {e}")
        raise HTTPException(502, "Push provider unavailable")
    if resp.status_code == 401:
        # Do not leak upstream config state to the client.
        logger.error("Push relay returned 401 — EMERGENT_PUSH_KEY missing or invalid")
        raise HTTPException(502, "Push provider unavailable")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}
