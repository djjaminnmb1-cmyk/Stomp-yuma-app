"""App version policy — drives the in-app "Update required" screen
(below ``min_version``) and "New version available" banner (below
``latest_version``). Admins edit it from Admin → App Version.

Stored as a single ``app_settings`` doc (``_id = "app_version"``).
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query
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


# ------------------------------------------------------------ What's new
# One-time Home card shown after an update. Notes are stored per version
# in ``app_settings {_id: "whats_new", notes: {"1_1_0": [...]}}`` (dots
# are not allowed in Mongo keys, hence ``_vkey``). Versions with no saved
# notes fall back to ``DEFAULT_WHATS_NEW`` so a release ships with copy.

DEFAULT_WHATS_NEW: dict[str, list[str]] = {
    "1.1.0": [
        "Smoother sign-up with a clear Terms checkbox — no more mystery errors",
        "The keyboard stops hogging the screen on Android",
        "Friendlier messages when something goes sideways (less robot, more cowboy)",
        "A heads-up whenever a fresh version is ready to grab",
        "Instructors: drafts and published dances now live in their own lists",
    ],
}
_MAX_ITEMS = 12
_MAX_ITEM_LEN = 160


def _vkey(version: str) -> str:
    return version.replace(".", "_")


def _check_version(version: str) -> str:
    v = (version or "").strip()
    if not _VERSION_RE.match(v):
        raise HTTPException(400, "Version must look like 1.2.0")
    return v


async def _whats_new(version: str) -> dict:
    doc = await db.app_settings.find_one({"_id": "whats_new"}) or {}
    notes = doc.get("notes") or {}
    items = notes.get(_vkey(version))
    if items is None:
        items = DEFAULT_WHATS_NEW.get(version, [])
    return {"version": version, "items": items}


@router.get("/app/whats-new")
async def get_whats_new(version: str = Query(...)):
    """Public — the Home card asks for its own build's notes."""
    return await _whats_new(_check_version(version))


class WhatsNewIn(BaseModel):
    version: str
    items: list[str] = []


@router.put("/admin/whats-new")
async def admin_set_whats_new(body: WhatsNewIn, user: dict = Depends(require_admin)):
    version = _check_version(body.version)
    items = [i.strip() for i in body.items if i and i.strip()]
    if len(items) > _MAX_ITEMS:
        raise HTTPException(400, f"Keep it to {_MAX_ITEMS} items or fewer")
    if any(len(i) > _MAX_ITEM_LEN for i in items):
        raise HTTPException(400, f"Each item must be {_MAX_ITEM_LEN} characters or fewer")
    await db.app_settings.update_one(
        {"_id": "whats_new"},
        {"$set": {
            f"notes.{_vkey(version)}": items,
            "updated_at": now_iso(),
            "updated_by_email": user.get("email", ""),
        }},
        upsert=True,
    )
    return await _whats_new(version)
