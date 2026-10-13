"""App version policy — drives the in-app "Update required" screen
(below ``min_version``) and "New version available" banner (below
``latest_version``). Admins edit it from Admin → App Version.

Stored as a single ``app_settings`` doc (``_id = "app_version"``).
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.database import db
from core.security import require_admin
from core.time_helpers import now_iso

router = APIRouter()

_DOC_ID = "app_version"
DEFAULT_IOS_URL = "https://apps.apple.com/us/app/stompin-ground-dance-hq/id6805265437"
DEFAULT_ANDROID_URL = "https://play.google.com/store/apps/details?id=com.stompinyuma.app"
_VERSION_RE = re.compile(r"^\d{1,4}(\.\d{1,4}){0,2}$")


def _vtuple(v: str) -> tuple[int, int, int]:
    parts = [int(p) for p in v.split(".")] + [0, 0, 0]
    return parts[0], parts[1], parts[2]


async def _policy() -> dict:
    doc = await db.app_settings.find_one({"_id": _DOC_ID}) or {}
    return {
        "min_version": doc.get("min_version") or "",
        "latest_version": doc.get("latest_version") or "",
        "ios_url": doc.get("ios_url") or DEFAULT_IOS_URL,
        "android_url": doc.get("android_url") or DEFAULT_ANDROID_URL,
        "updated_at": doc.get("updated_at"),
        "updated_by_email": doc.get("updated_by_email"),
    }


@router.get("/app/version-policy")
async def get_version_policy():
    """Public — every app launch / foreground reads this."""
    p = await _policy()
    p.pop("updated_by_email", None)
    return p


@router.get("/admin/app-version")
async def admin_get_version_policy(user: dict = Depends(require_admin)):
    return await _policy()


class AppVersionIn(BaseModel):
    min_version: str = ""
    latest_version: str = ""
    ios_url: str = ""
    android_url: str = ""


@router.put("/admin/app-version")
async def admin_set_version_policy(
    body: AppVersionIn, user: dict = Depends(require_admin)
):
    min_v = body.min_version.strip()
    latest_v = body.latest_version.strip()
    for label, v in (("Minimum version", min_v), ("Latest version", latest_v)):
        if v and not _VERSION_RE.match(v):
            raise HTTPException(400, f"{label} must look like 1.2.0")
    if min_v and latest_v and _vtuple(min_v) > _vtuple(latest_v):
        raise HTTPException(400, "Minimum version can't be higher than the latest version")
    urls = {}
    for key in ("ios_url", "android_url"):
        u = getattr(body, key).strip()
        if u and not u.startswith("https://"):
            raise HTTPException(400, "Store links must start with https://")
        urls[key] = u
    await db.app_settings.update_one(
        {"_id": _DOC_ID},
        {"$set": {
            "min_version": min_v,
            "latest_version": latest_v,
            **urls,
            "updated_at": now_iso(),
            "updated_by_email": user.get("email", ""),
        }},
        upsert=True,
    )
    return await _policy()
