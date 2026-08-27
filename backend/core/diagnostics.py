"""Client diagnostics extractor.

Reads the ``X-Client-…`` header set attached by the mobile app so we
can persist them alongside bug reports / feedback / moderation actions
— which lets an admin trace back "what bundle was this dancer on?"

Kept in ``core`` so any router can depend on it without a cycle.
"""
from __future__ import annotations

from typing import Optional

from fastapi import Header


def _s(v: Optional[str]) -> str:
    return (v or "").strip()


async def client_diagnostics(
    x_client_app_version: Optional[str] = Header(default=None),
    x_client_build_number: Optional[str] = Header(default=None),
    x_client_sdk_version: Optional[str] = Header(default=None),
    x_client_runtime_version: Optional[str] = Header(default=None),
    x_client_ota_update_id: Optional[str] = Header(default=None),
    x_client_ota_channel: Optional[str] = Header(default=None),
    x_client_ota_is_embedded: Optional[str] = Header(default=None),
    x_client_platform: Optional[str] = Header(default=None),
    x_client_os_version: Optional[str] = Header(default=None),
) -> dict:
    """FastAPI dependency — returns a compact diagnostics dict.

    Missing headers are fine — the dict just carries empty strings and
    the ``ota_is_embedded`` flag defaults to True (safest assumption
    for older builds without diagnostics).
    """
    return {
        "app_version": _s(x_client_app_version),
        "build_number": _s(x_client_build_number),
        "sdk_version": _s(x_client_sdk_version),
        "runtime_version": _s(x_client_runtime_version),
        "ota_update_id": _s(x_client_ota_update_id),
        "ota_channel": _s(x_client_ota_channel),
        "ota_is_embedded": _s(x_client_ota_is_embedded) != "0",
        "platform": _s(x_client_platform),
        "os_version": _s(x_client_os_version),
    }
