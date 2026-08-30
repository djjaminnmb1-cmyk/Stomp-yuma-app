"""Dance CRUD, bulk import, publish/unpublish, restore from backup."""
from __future__ import annotations

import json as _json
import logging
import re
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException

from core.database import db
from core.security import (
    get_current_user,
    require_admin,
    require_admin_or_editor,
    require_instructor,
    user_can_edit_step_sheets,
)
from core.serialize import dance_to_out, youtube_search_url
from core.time_helpers import now_iso
from models.schemas import DanceImportBody, DanceIn

logger = logging.getLogger(__name__)
router = APIRouter()

# Static resources for the "restore removed dance" flow.
_ROOT_DIR = Path(__file__).parent.parent  # /app/backend/
_BLOCKLIST_PATH = _ROOT_DIR / "dance_blocklist.json"
_BACKUP_PATH = _ROOT_DIR / "backups" / "dances_before_prune.json"


def _load_blocklist() -> list[str]:
    if not _BLOCKLIST_PATH.exists():
        return []
    try:
        data = _json.loads(_BLOCKLIST_PATH.read_text())
        return list(data) if isinstance(data, list) else []
    except Exception:
        return []


def _save_blocklist(names: list[str]) -> None:
    _BLOCKLIST_PATH.write_text(_json.dumps(sorted(set(names)), indent=2))


def _load_backup() -> list[dict]:
    if not _BACKUP_PATH.exists():
        return []
    try:
        return _json.loads(_BACKUP_PATH.read_text())
    except Exception:
        return []


@router.get("/dances")
async def list_dances(
    q: Optional[str] = None,
    difficulty: Optional[str] = None,
    scope: str = "public",  # public | mine | all
    authorization: Optional[str] = Header(None),
):
    """Public feed shows only published dances. ``scope=mine`` returns caller's
    dances (drafts + published). ``scope=all`` requires admin and returns
    everything.
    """
    query: dict = {}
    if difficulty and difficulty.lower() != "all":
        query["difficulty"] = difficulty
    if q:
        # Escape regex meta-chars and cap length to prevent ReDoS on public search.
        safe_q = re.escape(q.strip()[:80])
        query["$or"] = [
            {"name": {"$regex": safe_q, "$options": "i"}},
            {"choreographer": {"$regex": safe_q, "$options": "i"}},
            {"song": {"$regex": safe_q, "$options": "i"}},
            {"artist": {"$regex": safe_q, "$options": "i"}},
        ]

    # Best-effort: identify caller so their own drafts show `created_by`
    # for owner-only UX flags. Anonymous callers see created_by="" (SEC-005).
    viewer_id: Optional[str] = None
    if scope in ("mine", "all"):
        user = await get_current_user(authorization)
        viewer_id = user["user_id"]
        if scope == "mine":
            query["created_by"] = user["user_id"]
        elif scope == "all" and not user.get("is_admin"):
            raise HTTPException(403, "Admin only")
    else:
        query["is_published"] = True
        # Attempt to resolve the viewer for owner-only fields, without
        # requiring auth (public feed still works anonymously).
        if authorization:
            try:
                _u = await get_current_user(authorization)
                viewer_id = _u["user_id"]
            except HTTPException:
                viewer_id = None

    docs = await db.dances.find(query, {"_id": 0}).sort("name", 1).to_list(2000)
    return [dance_to_out(d, viewer_id) for d in docs]


# ---------------- Restore Deleted Dance (from backup) ----------------
# NOTE: these routes MUST come BEFORE ``/dances/{dance_id}`` so the literal
# paths aren't shadowed by the parameterised route.

@router.get("/dances/removed")
async def list_removed_dances(user: dict = Depends(require_admin_or_editor)):
    """Return every dance that was pruned by the LLM verification pass but
    is still available in the pre-prune backup. Editors can call
    POST /dances/restore-by-name to bring one back."""
    blocklist = set(_load_blocklist())
    backup = _load_backup()
    out = []
    for d in backup:
        if d.get("name") in blocklist:
            out.append({
                "id": d.get("id"),
                "name": d.get("name"),
                "choreographer": d.get("choreographer") or "",
                "song": d.get("song") or "",
                "artist": d.get("artist") or "",
                "difficulty": d.get("difficulty") or "Beginner",
                "bpm": d.get("bpm"),
                "count": d.get("count") or "",
                "youtube_url": d.get("youtube_url") or "",
                "choreographer_country": d.get("choreographer_country") or "",
            })
    out.sort(key=lambda x: (x["name"] or "").lower())
    return out


@router.post("/dances/restore-by-name")
async def restore_dance_by_name(
    body: dict, user: dict = Depends(require_admin_or_editor)
):
    """Restore a specific removed dance by name."""
    name = ((body or {}).get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Dance name is required")

    blocklist = _load_blocklist()
    if name not in blocklist:
        raise HTTPException(404, "That dance is not in the removed list")

    backup = _load_backup()
    src = next((d for d in backup if d.get("name") == name), None)
    if not src:
        raise HTTPException(404, "No backup entry for that dance name")

    # Guard: don't create a duplicate if it's already been restored
    if await db.dances.find_one({"name": name}, {"_id": 0, "id": 1}):
        blocklist = [n for n in blocklist if n != name]
        _save_blocklist(blocklist)
        raise HTTPException(409, "That dance is already in the library")

    new_doc = {
        "id": f"dance_{uuid.uuid4().hex[:10]}",
        "name": name,
        "choreographer": src.get("choreographer") or "",
        "choreographer_country": src.get("choreographer_country") or "",
        "song": src.get("song") or "",
        "artist": src.get("artist") or "",
        "difficulty": src.get("difficulty") or "Beginner",
        "bpm": src.get("bpm"),
        "count": src.get("count") or "",
        "youtube_url": src.get("youtube_url") or "",
        # Blanked — we removed all seeded step sheet content globally.
        "step_sheet": "",
        "step_sheet_image": "",
        "description": src.get("description") or "",
        "tags": src.get("tags") or [],
        "is_published": True,
        "created_by": user["user_id"],
        "created_by_name": user.get("name", "Restored"),
        "created_at": now_iso(),
    }
    await db.dances.insert_one(new_doc)
    blocklist = [n for n in blocklist if n != name]
    _save_blocklist(blocklist)
    logger.info("Restored dance %r by %s", name, user.get("email"))
    new_doc.pop("_id", None)
    return dance_to_out(new_doc, user["user_id"])


@router.get("/dances/{dance_id}")
async def get_dance(dance_id: str, authorization: Optional[str] = Header(None)):
    d = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")

    viewer: Optional[dict] = None
    viewer_id: Optional[str] = None
    if authorization:
        try:
            viewer = await get_current_user(authorization)
            viewer_id = viewer["user_id"]
        except HTTPException:
            viewer = None

    # Hide drafts (unpublished) from anyone but the owner and step-sheet
    # editors / admins. Return 404 so unauthorized callers can't tell whether
    # a specific dance id even exists.
    if not d.get("is_published", True):
        can_view_draft = bool(
            viewer
            and (
                viewer.get("is_admin")
                or user_can_edit_step_sheets(viewer)
                or d.get("created_by") == viewer_id
            )
        )
        if not can_view_draft:
            raise HTTPException(404, "Not found")

    return dance_to_out(d, viewer_id)


@router.post("/dances")
async def create_dance(inp: DanceIn, user: dict = Depends(require_instructor)):
    doc = inp.dict()
    doc["id"] = f"dance_{uuid.uuid4().hex[:10]}"
    doc["created_at"] = now_iso()
    doc["created_by"] = user["user_id"]
    doc["created_by_name"] = user.get("name", "")
    # STEP-SHEET GUARD: non-editors can create dances but not attach step-sheet
    # content. Blank the fields silently so the dance is created cleanly.
    if not user_can_edit_step_sheets(user):
        doc["step_sheet"] = ""
        doc["step_sheet_image"] = ""
    if not (doc.get("youtube_url") or "").strip():
        doc["youtube_url"] = youtube_search_url(
            f"{doc['name']} {doc.get('choreographer', '')} line dance"
        )
    # New dances start as DRAFT unless publisher explicitly sets is_published True
    if doc.get("is_published") is None:
        doc["is_published"] = False
    await db.dances.insert_one(doc)
    doc.pop("_id", None)
    return dance_to_out(doc, user["user_id"])


@router.post("/dances/import")
async def import_dances(inp: DanceImportBody, user: dict = Depends(require_instructor)):
    """Bulk import from CSV / list. Skips duplicates by name (case-insensitive)."""
    if not inp.dances:
        return {"imported": 0, "skipped_duplicates": 0, "errors": []}

    # Fetch existing names (lowercased) in one query
    existing_names = {
        d["name"].lower()
        async for d in db.dances.find({}, {"name": 1, "_id": 0})
    }
    # STEP-SHEET GUARD: non-editors get their step_sheet column silently blanked
    can_edit_ss = user_can_edit_step_sheets(user)

    to_insert = []
    skipped = 0
    errors: List[dict] = []
    for i, row in enumerate(inp.dances):
        name = (row.name or "").strip()
        if not name:
            errors.append({"row": i, "reason": "missing name"})
            continue
        if name.lower() in existing_names:
            skipped += 1
            continue
        difficulty = (row.difficulty or "Beginner").strip().title()
        # Accept common shorthand for High Improver / Absolute Beginner so
        # CSV imports don't silently downgrade rows written with hyphens
        # or shortened labels.
        _alias = difficulty.replace("-", " ").replace("_", " ").strip()
        _alias = " ".join(_alias.split())  # collapse whitespace
        if _alias.lower() in ("hi improver", "highimprover"):
            _alias = "High Improver"
        if _alias.lower() in ("ab beginner", "absbeginner", "abs beginner"):
            _alias = "Absolute Beginner"
        difficulty = _alias
        if difficulty not in (
            "Absolute Beginner",
            "Beginner",
            "Improver",
            "High Improver",
            "Intermediate",
            "Advanced",
        ):
            difficulty = "Beginner"
        chor = (row.choreographer or "").strip()
        song = (row.song or "").strip()
        yt = (row.youtube_url or "").strip()
        if not yt:
            yt = youtube_search_url(f"{name} {chor} line dance")
        to_insert.append({
            "id": f"dance_{uuid.uuid4().hex[:10]}",
            "name": name,
            "choreographer": chor,
            "choreographer_country": "",
            "song": song,
            "artist": (row.artist or "").strip(),
            "difficulty": difficulty,
            "bpm": row.bpm,
            "count": (row.count or "").strip(),
            "youtube_url": yt,
            "step_sheet": (row.step_sheet or "").strip() if can_edit_ss else "",
            "step_sheet_image": "",
            "description": "",
            "tags": [],
            "is_published": bool(inp.publish_all),
            "created_by": user["user_id"],
            "created_by_name": user.get("name", ""),
            "created_at": now_iso(),
        })
        existing_names.add(name.lower())

    if to_insert:
        await db.dances.insert_many(to_insert)
    return {
        "imported": len(to_insert),
        "skipped_duplicates": skipped,
        "errors": errors,
    }


@router.put("/dances/{dance_id}")
async def update_dance(dance_id: str, inp: DanceIn, user: dict = Depends(require_instructor)):
    existing = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")

    can_edit_ss = user_can_edit_step_sheets(user)
    is_owner_or_admin = (
        (existing.get("created_by") == user["user_id"]) or bool(user.get("is_admin"))
    )
    updates = inp.dict()

    # ---- Step-sheet fields: whitelist-only ----
    prev_ss = existing.get("step_sheet", "") or ""
    prev_img = existing.get("step_sheet_image", "") or ""
    incoming_ss = (updates.get("step_sheet") or "")
    incoming_img = (updates.get("step_sheet_image") or "")
    ss_changed = (incoming_ss != prev_ss) or (incoming_img != prev_img)
    if ss_changed and not can_edit_ss:
        raise HTTPException(403, "Only Erin or Jamin can edit step sheets")
    # Non-editors: silently preserve the existing step-sheet content
    if not can_edit_ss:
        updates["step_sheet"] = prev_ss
        updates["step_sheet_image"] = prev_img

    # ---- Other fields: owner OR admin OR step-sheet editor (senior instructor) ----
    if not (is_owner_or_admin or can_edit_ss):
        raise HTTPException(403, "Not allowed")

    if updates.get("is_published") is None:
        updates["is_published"] = existing.get("is_published", True)

    # ---- External provider refs are STICKY ----
    # A single dance may carry BOTH a CopperKnob and a BootStepper
    # reference at once (Phase 18). Regular Edit flows on the client
    # don't include those refs in the payload; without this guard,
    # Pydantic's default of ``""`` would silently wipe them out of
    # the DB — which would break duplicate-detection and the admin
    # "Check external data" tools. If the incoming value is empty
    # (or absent), fall back to whatever we already have stored.
    for _sticky in (
        "copperknob_ref",
        "copperknob_url",
        "bootstepper_ref",
        "bootstepper_url",
    ):
        incoming = (updates.get(_sticky) or "").strip()
        if not incoming and existing.get(_sticky):
            updates[_sticky] = existing.get(_sticky)

    await db.dances.update_one({"id": dance_id}, {"$set": updates})
    d = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    return dance_to_out(d, user["user_id"])


@router.put("/dances/{dance_id}/publish")
async def publish_dance(dance_id: str, user: dict = Depends(require_instructor)):
    d = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    owner_id = d.get("created_by")
    if owner_id and owner_id != user["user_id"] and not user.get("is_admin"):
        raise HTTPException(403, "Not allowed")
    await db.dances.update_one({"id": dance_id}, {"$set": {"is_published": True}})
    d["is_published"] = True
    return dance_to_out(d, user["user_id"])


@router.put("/dances/{dance_id}/unpublish")
async def unpublish_dance(dance_id: str, user: dict = Depends(require_instructor)):
    d = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    owner_id = d.get("created_by")
    if owner_id and owner_id != user["user_id"] and not user.get("is_admin"):
        raise HTTPException(403, "Not allowed")
    await db.dances.update_one({"id": dance_id}, {"$set": {"is_published": False}})
    d["is_published"] = False
    return dance_to_out(d, user["user_id"])


@router.delete("/dances/{dance_id}")
async def delete_dance(dance_id: str, admin: dict = Depends(require_admin)):
    await db.dances.delete_one({"id": dance_id})
    return {"ok": True}
