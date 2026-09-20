"""Unified moderation surface — Apple Guideline 1.2 UGC compliance.

Covers everything the Apple reviewer needs to see beyond the feed
reporting that already exists in ``routes/social.py``:

USER ENDPOINTS (any authenticated user)
---------------------------------------
- ``POST /api/moderation/reports`` — report ANY UGC by
  ``{target_type, target_id, target_user_id, reason, note}``.
  Valid ``target_type`` values: ``feed``, ``chat``, ``profile``,
  ``comment``, ``dance``, ``event``.
- ``GET  /api/moderation/report-reasons`` — canonical list surfaced
  by the UI.

ADMIN ENDPOINTS (require_admin_or_editor)
-----------------------------------------
- ``GET  /api/admin/moderation/reports`` — unified queue across every
  target_type with pagination + status filter.
- ``PATCH /api/admin/moderation/reports/{id}`` — status change +
  admin note.
- ``POST /api/admin/moderation/reports/{id}/remove-content`` —
  content-removal on the reported artefact.
- ``POST /api/admin/moderation/users/{user_id}/suspend`` — body
  ``{duration_hours, reason}`` (24 / 168 / 720 / 999999).
- ``POST /api/admin/moderation/users/{user_id}/unsuspend``.
- ``POST /api/admin/moderation/users/{user_id}/ban`` — permanent.
- ``POST /api/admin/moderation/users/{user_id}/warn`` — records a
  warning; user is not blocked from the app but sees a soft banner
  next login.

The ``moderation_reports`` collection unions every kind of report so
the admin queue is a single feed. Feed-specific reports created via
``routes/social.py`` are dual-written into this collection during
this rollout so the queue is truly unified — new reports flow only
through here going forward.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.database import db
from core.security import (
    get_current_user,
    require_admin_or_editor,
)
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)
router = APIRouter()


# ---- Canonical vocabulary ----
REPORT_REASONS = (
    {"key": "harassment",    "label": "Harassment or bullying"},
    {"key": "hate_abuse",    "label": "Hate or abusive content"},
    {"key": "sexual",        "label": "Sexual or inappropriate content"},
    {"key": "threats",       "label": "Threats or violence"},
    {"key": "spam",          "label": "Spam"},
    {"key": "impersonation", "label": "Impersonation"},
    {"key": "copyright",     "label": "Copyright / IP concern"},
    {"key": "other",         "label": "Other"},
)
_REASON_KEYS = {r["key"] for r in REPORT_REASONS}

ALLOWED_TARGET_TYPES = {
    "feed",     # activity feed post
    "chat",     # instructor-chat message
    "profile",  # user profile (harassing profile picture / bio)
    "comment",  # future — placeholder
    "dance",    # published dance listing
    "event",    # published event
}

SUSPEND_PRESETS = {24, 168, 720}       # hours: 1d, 7d, 30d
BAN_HOURS = 999_999                    # sentinel — treat as permanent


# ---- Pydantic bodies ----
class ReportBody(BaseModel):
    target_type: str = Field(..., description="feed | chat | profile | comment | dance | event")
    target_id: str = Field(..., min_length=1, description="Stable ID of the reported artefact")
    target_user_id: Optional[str] = Field(None, description="user_id of the author of the reported content")
    reason: str = Field(..., description="One of REPORT_REASONS keys")
    note: Optional[str] = Field("", max_length=1000, description="Optional context from the reporter")


class ReportPatchBody(BaseModel):
    status: Optional[str] = Field(None, description="reviewed | resolved | dismissed | actioned")
    admin_note: Optional[str] = Field(None, max_length=2000)


class SuspendBody(BaseModel):
    duration_hours: int = Field(..., description="24, 168, 720, or 999999 for permanent")
    reason: Optional[str] = Field("", max_length=500)


class WarnBody(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


# ---- Helpers ----
def _human_ref(report_id: str) -> str:
    """Short, uppercase reference the user sees in the "your report was
    received" toast — e.g. ``rep_abc123def456`` → ``ABC12F``.

    We take a mix of the first + last three hex chars of the internal
    id so the ref is stable across the 12-char UUID space without
    leaking the whole id. Users type this into an email to safety@ so
    the mods can look up the original row via
    ``db.moderation_reports.find_one({"id": {"$regex": ref, ...}})``.
    """
    hex_part = report_id.split("_", 1)[1] if "_" in report_id else report_id
    if len(hex_part) < 6:
        return hex_part.upper()
    return (hex_part[:3] + hex_part[-3:]).upper()


async def _lookup_target_snapshot(target_type: str, target_id: str) -> tuple[str, Optional[str]]:
    """Return ``(preview_text, target_user_id_from_db)`` for the artefact.

    Empty preview if we can't find it — the report row still records
    the target for the admin queue. Author user_id is authoritative
    from the DB when available; falls back to whatever the reporter
    supplied.
    """
    try:
        if target_type == "chat":
            row = await db.instructor_messages.find_one(
                {"id": target_id}, {"_id": 0, "message": 1, "user_id": 1}
            )
            if row:
                return (row.get("message") or "")[:280], row.get("user_id")
        elif target_type == "feed":
            row = await db.feed_events.find_one(
                {"id": target_id}, {"_id": 0, "text": 1, "content": 1, "user_id": 1, "actor_id": 1}
            )
            if row:
                preview = (row.get("text") or row.get("content") or "")[:280]
                return preview, row.get("user_id") or row.get("actor_id")
        elif target_type == "profile":
            row = await db.users.find_one(
                {"user_id": target_id}, {"_id": 0, "name": 1, "bio": 1}
            )
            if row:
                return f"{row.get('name', '')} — {row.get('bio', '')[:200]}", target_id
        elif target_type == "dance":
            row = await db.dances.find_one(
                {"id": target_id}, {"_id": 0, "name": 1, "description": 1, "created_by": 1}
            )
            if row:
                return f"{row.get('name', '')} — {(row.get('description') or '')[:200]}", row.get("created_by")
        elif target_type == "event":
            row = await db.events.find_one(
                {"id": target_id}, {"_id": 0, "name": 1, "description": 1, "instructor_id": 1}
            )
            if row:
                return f"{row.get('name', '')} — {(row.get('description') or '')[:200]}", row.get("instructor_id")
    except Exception:
        logger.exception("target snapshot failed for %s:%s", target_type, target_id)
    return "", None


def _report_display(row: dict) -> dict:
    """Strip internal keys, keep JSON-safe."""
    row = {**row}
    row.pop("_id", None)
    return row


# ---- USER ENDPOINTS ----

@router.get("/moderation/report-reasons")
async def report_reasons(_user: dict = Depends(get_current_user)):
    """The canonical list of report reasons the UI should render."""
    return {"reasons": list(REPORT_REASONS)}


@router.post("/moderation/reports")
async def create_report(
    body: ReportBody,
    user: dict = Depends(get_current_user),
):
    """Log a UGC report. Deduped per ``(reporter, target)`` — a user
    can't spam-report the same thing to game the queue."""
    target_type = body.target_type.strip().lower()
    if target_type not in ALLOWED_TARGET_TYPES:
        raise HTTPException(400, f"target_type must be one of {sorted(ALLOWED_TARGET_TYPES)}")
    reason_key = body.reason.strip().lower()
    if reason_key not in _REASON_KEYS:
        raise HTTPException(400, f"reason must be one of {sorted(_REASON_KEYS)}")

    # Users can't report themselves (accidental taps).
    reporter_id = user["user_id"]
    target_user_id = (body.target_user_id or "").strip()

    # Server-side lookup wins — the client's target_user_id is a hint.
    preview, resolved_uid = await _lookup_target_snapshot(target_type, body.target_id.strip())
    if resolved_uid:
        target_user_id = resolved_uid
    if target_user_id and target_user_id == reporter_id:
        raise HTTPException(400, "You can't report your own content.")

    dup = await db.moderation_reports.find_one(
        {
            "target_type": target_type,
            "target_id": body.target_id.strip(),
            "reporter_id": reporter_id,
        },
        {"_id": 0, "id": 1},
    )
    if dup:
        return {
            "ok": True,
            "already_reported": True,
            "id": dup["id"],
            "ref": _human_ref(dup["id"]),
        }

    doc = {
        "id": f"rep_{uuid.uuid4().hex[:12]}",
        "target_type": target_type,
        "target_id": body.target_id.strip(),
        "target_user_id": target_user_id or None,
        "reporter_id": reporter_id,
        "reporter_email": user.get("email", ""),
        "reporter_name": user.get("name", ""),
        "reason": reason_key,
        "note": (body.note or "").strip(),
        "content_snapshot": preview,
        "status": "pending",
        "reported_at": now_iso(),
        "reviewed_at": None,
        "reviewed_by": None,
        "reviewed_by_name": None,
        "admin_note": "",
    }
    await db.moderation_reports.insert_one(doc)

    logger.info(
        "moderation_report user=%s target=%s:%s reason=%s",
        reporter_id, target_type, doc["target_id"], reason_key,
    )
    return {"ok": True, "id": doc["id"], "ref": _human_ref(doc["id"])}


# ---- ADMIN ENDPOINTS ----

@router.get("/admin/moderation/reports")
async def admin_list_reports(
    status: str = Query("pending", description="pending | reviewed | resolved | dismissed | actioned | all"),
    target_type: Optional[str] = Query(None, description="Filter by target type"),
    limit: int = Query(200, ge=1, le=500),
    _admin: dict = Depends(require_admin_or_editor),
):
    """Unified admin queue. Newest first."""
    q: dict = {}
    if status and status.lower() != "all":
        q["status"] = status.lower()
    if target_type:
        if target_type not in ALLOWED_TARGET_TYPES:
            raise HTTPException(400, "invalid target_type")
        q["target_type"] = target_type

    cur = db.moderation_reports.find(q, {"_id": 0}).sort("reported_at", -1).limit(limit)
    items = [row async for row in cur]

    # Attach elapsed-since-reported (seconds) for the 24-hour warning UI.
    now = datetime.now(timezone.utc)
    for it in items:
        try:
            rep_at = datetime.fromisoformat(it["reported_at"].replace("Z", "+00:00"))
            it["elapsed_seconds"] = int((now - rep_at).total_seconds())
        except Exception:
            it["elapsed_seconds"] = 0

    pending_count = await db.moderation_reports.count_documents({"status": "pending"})
    return {"items": items, "count": len(items), "pending_count": pending_count}


@router.patch("/admin/moderation/reports/{rep_id}")
async def admin_patch_report(
    rep_id: str,
    body: ReportPatchBody,
    admin: dict = Depends(require_admin_or_editor),
):
    """Status change + admin note (dismiss / reviewed / resolved etc)."""
    row = await db.moderation_reports.find_one({"id": rep_id}, {"_id": 0})
    if not row:
        raise HTTPException(404, "Report not found")

    update: dict = {}
    if body.status:
        st = body.status.strip().lower()
        if st not in {"pending", "reviewed", "resolved", "dismissed", "actioned"}:
            raise HTTPException(400, "invalid status")
        update["status"] = st
        update["reviewed_at"] = now_iso()
        update["reviewed_by"] = admin["user_id"]
        update["reviewed_by_name"] = admin.get("name", "")
    if body.admin_note is not None:
        update["admin_note"] = body.admin_note.strip()

    if not update:
        return {"ok": True}

    await db.moderation_reports.update_one({"id": rep_id}, {"$set": update})
    return {"ok": True}


@router.post("/admin/moderation/reports/{rep_id}/remove-content")
async def admin_remove_content(
    rep_id: str,
    admin: dict = Depends(require_admin_or_editor),
):
    """Hard-remove the reported artefact from public feeds.

    * chat  → soft-delete (mark ``deleted_at`` + blank ``message``)
    * feed  → delete the feed_events row
    * dance → un-publish (is_published=false)
    * event → un-publish (is_published=false)
    * profile → clear bio (name preserved for community context)
    """
    row = await db.moderation_reports.find_one({"id": rep_id}, {"_id": 0})
    if not row:
        raise HTTPException(404, "Report not found")

    target_type = row["target_type"]
    target_id = row["target_id"]
    action_desc = ""

    if target_type == "chat":
        result = await db.instructor_messages.update_one(
            {"id": target_id},
            {
                "$set": {
                    "message": "",
                    "deleted_at": now_iso(),
                    "deleted_by_moderator": admin["user_id"],
                    "moderation_reason": f"report:{rep_id}",
                }
            },
        )
        action_desc = f"soft-deleted chat message ({result.modified_count} matched)"
    elif target_type == "feed":
        result = await db.feed_events.delete_one({"id": target_id})
        action_desc = f"deleted feed event ({result.deleted_count} matched)"
    elif target_type == "dance":
        result = await db.dances.update_one(
            {"id": target_id},
            {"$set": {"is_published": False, "moderation_hidden": True}},
        )
        action_desc = f"unpublished dance ({result.modified_count} matched)"
    elif target_type == "event":
        result = await db.events.update_one(
            {"id": target_id},
            {"$set": {"is_published": False, "moderation_hidden": True}},
        )
        action_desc = f"unpublished event ({result.modified_count} matched)"
    elif target_type == "profile":
        result = await db.users.update_one(
            {"user_id": target_id},
            {"$set": {"bio": "", "moderation_bio_clear": now_iso()}},
        )
        action_desc = f"cleared profile bio ({result.modified_count} matched)"
    else:
        raise HTTPException(400, f"remove-content not supported for target_type '{target_type}'")

    await db.moderation_reports.update_one(
        {"id": rep_id},
        {
            "$set": {
                "status": "actioned",
                "reviewed_at": now_iso(),
                "reviewed_by": admin["user_id"],
                "reviewed_by_name": admin.get("name", ""),
                "content_removed": True,
                "moderation_action": action_desc,
            }
        },
    )
    logger.info(
        "moderation_remove admin=%s report=%s %s",
        admin["user_id"], rep_id, action_desc,
    )
    return {"ok": True, "action": action_desc}


# ---- USER ACCOUNT ACTIONS ----

async def _apply_user_status(
    *,
    user_id: str,
    admin: dict,
    is_suspended: bool,
    is_banned: bool,
    duration_hours: int,
    reason: str,
    action: str,
) -> dict:
    """Common writer for suspend / ban / warn. Refuses to touch admins
    or the caller themselves. Returns the updated user summary."""
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    if target.get("is_admin"):
        raise HTTPException(400, "Cannot act on admin accounts")
    if user_id == admin["user_id"]:
        raise HTTPException(400, "Cannot moderate yourself")

    now = datetime.now(timezone.utc)
    suspend_until = None
    if is_suspended and duration_hours > 0:
        suspend_until = (now + timedelta(hours=duration_hours)).isoformat().replace("+00:00", "Z")

    updates: dict = {
        "is_suspended": bool(is_suspended and not is_banned),
        "is_banned": bool(is_banned),
        "suspend_until": suspend_until,
        "moderation_reason": reason,
        "moderation_action": action,
        "moderation_at": now_iso(),
        "moderation_by": admin["user_id"],
        "moderation_by_name": admin.get("name", ""),
    }
    # Bump pwd_ver so every existing JWT for this user is invalidated
    # (session revocation on suspend/ban).
    updates["pwd_ver"] = int(target.get("pwd_ver") or 0) + 1

    await db.users.update_one({"user_id": user_id}, {"$set": updates})
    await db.user_sessions.delete_many({"user_id": user_id})

    # Audit log
    await db.moderation_actions.insert_one(
        {
            "id": f"ma_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "action": action,
            "duration_hours": duration_hours,
            "reason": reason,
            "at": now_iso(),
            "by": admin["user_id"],
            "by_name": admin.get("name", ""),
        }
    )

    logger.info(
        "moderation_action admin=%s user=%s action=%s hours=%s",
        admin["user_id"], user_id, action, duration_hours,
    )
    return {
        "user_id": user_id,
        "is_suspended": updates["is_suspended"],
        "is_banned": updates["is_banned"],
        "suspend_until": suspend_until,
        "moderation_action": action,
    }


@router.post("/admin/moderation/users/{user_id}/suspend")
async def admin_suspend(
    user_id: str,
    body: SuspendBody,
    admin: dict = Depends(require_admin_or_editor),
):
    if body.duration_hours not in SUSPEND_PRESETS and body.duration_hours != BAN_HOURS:
        raise HTTPException(400, f"duration_hours must be one of {sorted(SUSPEND_PRESETS) + [BAN_HOURS]}")
    if body.duration_hours == BAN_HOURS:
        # Permanent → ban
        return await _apply_user_status(
            user_id=user_id, admin=admin,
            is_suspended=False, is_banned=True,
            duration_hours=BAN_HOURS,
            reason=(body.reason or "").strip(),
            action="ban",
        )
    return await _apply_user_status(
        user_id=user_id, admin=admin,
        is_suspended=True, is_banned=False,
        duration_hours=body.duration_hours,
        reason=(body.reason or "").strip(),
        action=f"suspend_{body.duration_hours}h",
    )


@router.post("/admin/moderation/users/{user_id}/ban")
async def admin_ban(
    user_id: str,
    body: SuspendBody,
    admin: dict = Depends(require_admin_or_editor),
):
    return await _apply_user_status(
        user_id=user_id, admin=admin,
        is_suspended=False, is_banned=True,
        duration_hours=BAN_HOURS,
        reason=(body.reason or "").strip(),
        action="ban",
    )


@router.post("/admin/moderation/users/{user_id}/unsuspend")
async def admin_unsuspend(
    user_id: str,
    admin: dict = Depends(require_admin_or_editor),
):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    await db.users.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "is_suspended": False,
                "is_banned": False,
                "suspend_until": None,
                "moderation_action": "unsuspend",
                "moderation_at": now_iso(),
                "moderation_by": admin["user_id"],
                "moderation_by_name": admin.get("name", ""),
            }
        },
    )
    await db.moderation_actions.insert_one(
        {
            "id": f"ma_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "action": "unsuspend",
            "duration_hours": 0,
            "reason": "",
            "at": now_iso(),
            "by": admin["user_id"],
            "by_name": admin.get("name", ""),
        }
    )
    return {"ok": True}


@router.post("/admin/moderation/users/{user_id}/warn")
async def admin_warn(
    user_id: str,
    body: WarnBody,
    admin: dict = Depends(require_admin_or_editor),
):
    """Record a warning without blocking access."""
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    if user_id == admin["user_id"]:
        raise HTTPException(400, "Cannot warn yourself")

    warnings = int(target.get("warnings_count") or 0) + 1
    await db.users.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "warnings_count": warnings,
                "last_warning_at": now_iso(),
                "last_warning_reason": body.reason.strip(),
            }
        },
    )
    await db.moderation_actions.insert_one(
        {
            "id": f"ma_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "action": "warn",
            "duration_hours": 0,
            "reason": body.reason.strip(),
            "at": now_iso(),
            "by": admin["user_id"],
            "by_name": admin.get("name", ""),
        }
    )
    return {"ok": True, "warnings_count": warnings}


@router.get("/admin/moderation/users/{user_id}/history")
async def admin_user_history(
    user_id: str,
    _admin: dict = Depends(require_admin_or_editor),
):
    """Full moderation history for a user — every action + every
    report where they were the target."""
    actions = [
        _report_display(row)
        async for row in db.moderation_actions.find({"user_id": user_id}, {"_id": 0})
        .sort("at", -1)
        .limit(200)
    ]
    reports = [
        _report_display(row)
        async for row in db.moderation_reports.find({"target_user_id": user_id}, {"_id": 0})
        .sort("reported_at", -1)
        .limit(200)
    ]
    return {"actions": actions, "reports": reports}
