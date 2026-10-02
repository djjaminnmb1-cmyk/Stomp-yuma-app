"""User-Submitted Dances — pending approval queue.

Allows any authenticated user to submit a CopperKnob or BootStepper
listing as a "pending dance". An admin (or step-sheet editor) then
reviews the queue and either **approves** (which creates a real
``dances`` row using the existing import-from-X helpers) or **rejects**
with an optional reason.

Business rules (per spec)
-------------------------
- Sources allowed: CopperKnob and BootStepper (no arbitrary URLs, no
  step-sheet content — we only store metadata, matching how the
  admin-only import flow already works).
- **Daily limit: 5 submissions per user per UTC day.**
- **Duplicates rejected** early: same ref that is already in the
  dance library, or already pending/approved in this queue, cannot be
  submitted twice.
- Approvals reuse the same ``services.copperknob`` / ``services.
  bootstepper`` upstream lookups so the persisted dance row is always
  freshly fetched at approval time (no staleness).

Routes
------
User (any authenticated user):
  - ``GET  /api/pending-dances/quota``    — remaining submissions today
  - ``POST /api/pending-dances/submit``   — submit `{source, ref}`
  - ``GET  /api/pending-dances/mine``     — my own submissions

Admin / step-sheet editor:
  - ``GET  /api/admin/pending-dances``            — list (status filter)
  - ``POST /api/admin/pending-dances/{id}/approve``
  - ``POST /api/admin/pending-dances/{id}/reject`` — `{reason}`
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.database import db
from core.security import (
    get_current_user,
    require_admin_or_editor,
)
from core.serialize import youtube_search_url
from core.time_helpers import now_iso
from services import bootstepper as bs_svc
from services import copperknob as ck_svc
from services import dance_dedupe

logger = logging.getLogger(__name__)
router = APIRouter()


DAILY_LIMIT = 5
ALLOWED_SOURCES = ("copperknob", "bootstepper")


# ---------- Helpers ----------

def _utc_day_start(dt: Optional[datetime] = None) -> datetime:
    """Return the current UTC day's 00:00 boundary."""
    d = dt or datetime.now(timezone.utc)
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


def _next_utc_day_start() -> datetime:
    return _utc_day_start() + timedelta(days=1)


async def _count_today(user_id: str) -> int:
    """How many submissions the user has made in the current UTC day.
    We count anything that is not ``rejected`` (rejected submissions do
    NOT eat into the daily quota — otherwise a bad-faith actor could
    grief a user by getting their submissions denied)."""
    start_iso = _utc_day_start().isoformat().replace("+00:00", "Z")
    n = await db.pending_dances.count_documents(
        {
            "user_id": user_id,
            "submitted_at": {"$gte": start_iso},
            "status": {"$in": ["pending", "approved"]},
        }
    )
    return int(n)


async def _find_duplicate_in_queue(source: str, ref: str) -> Optional[dict]:
    """Any pending/approved queue row with the same source + ref."""
    return await db.pending_dances.find_one(
        {
            "source": source,
            "ref": ref,
            "status": {"$in": ["pending", "approved"]},
        },
        {"_id": 0},
    )


def _difficulty_from_level(level: str) -> str:
    if not level:
        return "Improver"
    s = level.lower()
    if "absolute beginner" in s:
        return "Absolute Beginner"
    if "beginner" in s:
        return "Beginner"
    if "improver" in s and "high" in s:
        return "High Improver"
    if "improver" in s:
        return "Improver"
    if "intermediate" in s:
        return "Intermediate"
    if "advanced" in s:
        return "Advanced"
    return "Improver"


def _count_string(item: dict) -> str:
    c = str(item.get("count") or "").strip()
    w = str(item.get("wall") or "").strip()
    parts = []
    if c and c != "0":
        parts.append(f"{c} count")
    if w and w != "0":
        parts.append(f"{w} wall")
    return ", ".join(parts)


async def _fetch_meta(source: str, ref: str) -> dict:
    """Freshly fetch metadata from CopperKnob or BootStepper. Never
    trust the client-supplied metadata."""
    try:
        if source == "copperknob":
            return await ck_svc.get_by_ref(ref)
        if source == "bootstepper":
            return await bs_svc.get_by_id(ref)
    except (ck_svc.CopperKnobError, bs_svc.BootStepperError) as e:
        raise HTTPException(e.status, str(e))
    raise HTTPException(400, f"Unknown source '{source}'")


def _display_dict(row: dict) -> dict:
    """Trim mongo internal fields, keep public-safe shape."""
    row = {**row}
    row.pop("_id", None)
    return row


# ---------- Request bodies ----------

class SubmitBody(BaseModel):
    source: str = Field(..., description="'copperknob' or 'bootstepper'")
    ref: str = Field(..., min_length=1, description="CopperKnob ref or BootStepper id")


class RejectBody(BaseModel):
    reason: Optional[str] = Field("", max_length=500)


# ---------- User endpoints ----------

@router.get("/pending-dances/quota")
async def get_quota(user: dict = Depends(get_current_user)):
    """Return remaining daily submission slots for the current user."""
    used = await _count_today(user["user_id"])
    return {
        "used": used,
        "limit": DAILY_LIMIT,
        "remaining": max(0, DAILY_LIMIT - used),
        "resets_at": _next_utc_day_start().isoformat().replace("+00:00", "Z"),
    }


@router.post("/pending-dances/submit")
async def submit_pending(
    body: SubmitBody,
    user: dict = Depends(get_current_user),
):
    """Submit a CopperKnob/BootStepper listing for admin approval."""
    source = (body.source or "").strip().lower()
    if source not in ALLOWED_SOURCES:
        raise HTTPException(400, f"Source must be one of {ALLOWED_SOURCES}")

    ref = (body.ref or "").strip()
    if not ref:
        raise HTTPException(400, "Missing ref")
    # CopperKnob refs are always uppercase; normalise so duplicate
    # detection works regardless of client-side casing.
    if source == "copperknob":
        ref = ref.upper()

    # 1) Daily quota check
    used = await _count_today(user["user_id"])
    if used >= DAILY_LIMIT:
        raise HTTPException(
            429,
            {
                "code": "daily_limit_reached",
                "message": f"You've reached today's limit ({DAILY_LIMIT}). Try again tomorrow.",
                "resets_at": _next_utc_day_start().isoformat().replace("+00:00", "Z"),
                "limit": DAILY_LIMIT,
            },
        )

    # 2) Duplicate check — pending/approved in queue
    queue_dup = await _find_duplicate_in_queue(source, ref)
    if queue_dup:
        raise HTTPException(
            409,
            {
                "code": "already_pending",
                "message": (
                    "This dance is already pending approval."
                    if queue_dup.get("status") == "pending"
                    else "This dance is already in the library."
                ),
                "status": queue_dup.get("status"),
            },
        )

    # 3) Fetch fresh metadata from the source
    meta = await _fetch_meta(source, ref)

    # 4) Duplicate check — already in the dance library
    lib_dup = await dance_dedupe.find_duplicate(meta, source=source)
    if lib_dup:
        raise HTTPException(
            409,
            {
                "code": "already_in_library",
                "message": "This dance is already in the library.",
                "dance_id": lib_dup.get("id"),
                "dance_name": lib_dup.get("name"),
            },
        )

    # 5) Persist the pending row (metadata only, never step sheet content)
    doc = {
        "id": f"pd_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "user_email": user.get("email", ""),
        "user_name": user.get("name", ""),
        "source": source,
        "ref": ref,
        "title": (meta.get("title") or "").strip(),
        "choreographer": (meta.get("choreographer") or "").strip(),
        "choreographer_country": (meta.get("choreographer_country") or "").strip(),
        "song": (meta.get("song") or "").strip(),
        "artist": (meta.get("artist") or "").strip(),
        "music": (meta.get("music") or "").strip(),
        "level": (meta.get("level") or "").strip(),
        "count": str(meta.get("count") or "").strip(),
        "wall": str(meta.get("wall") or "").strip(),
        "url": (meta.get("url") or "").strip(),
        "status": "pending",
        "submitted_at": now_iso(),
        "reviewed_at": None,
        "reviewed_by": None,
        "reviewed_by_name": None,
        "rejection_reason": None,
        "approved_dance_id": None,
    }
    await db.pending_dances.insert_one(doc)

    # Ping every admin — a new row just landed in the review queue.
    # Best-effort: never block the submit response on a push flake.
    try:
        from services.admin_notifications import notify_admins_of_pending_dance
        await notify_admins_of_pending_dance(doc)
    except Exception:
        logger.exception(
            "Failed to notify admins of new pending dance %s", doc.get("id")
        )

    return {
        "submission": _display_dict(doc),
        "quota": {
            "used": used + 1,
            "limit": DAILY_LIMIT,
            "remaining": max(0, DAILY_LIMIT - used - 1),
            "resets_at": _next_utc_day_start().isoformat().replace("+00:00", "Z"),
        },
    }


@router.get("/pending-dances/mine")
async def list_my_submissions(user: dict = Depends(get_current_user)):
    """The current user's own submissions, newest first."""
    cur = db.pending_dances.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("submitted_at", -1).limit(200)
    items = [row async for row in cur]
    return {"items": items, "count": len(items)}


# ---------- Admin endpoints ----------

@router.get("/admin/pending-dances")
async def admin_list(
    status: str = Query("pending", description="pending | approved | rejected | all"),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_admin_or_editor),  # noqa: ARG001
):
    """Admin queue listing. Default view is 'pending'."""
    q: dict = {}
    if status and status.lower() != "all":
        q["status"] = status.lower()
    cur = db.pending_dances.find(q, {"_id": 0}).sort("submitted_at", -1).limit(limit)
    items = [row async for row in cur]
    # Counts for the tab badges
    pending_count = await db.pending_dances.count_documents({"status": "pending"})
    return {
        "items": items,
        "count": len(items),
        "pending_count": pending_count,
    }


@router.post("/admin/pending-dances/{pd_id}/approve")
async def admin_approve(
    pd_id: str,
    admin: dict = Depends(require_admin_or_editor),
):
    """Approve a pending submission: re-fetches the source and creates a
    real ``dances`` row using the same shape as the direct admin
    import."""
    row = await db.pending_dances.find_one({"id": pd_id}, {"_id": 0})
    if not row:
        raise HTTPException(404, "Submission not found")
    if row.get("status") != "pending":
        raise HTTPException(409, f"Submission is already {row.get('status')}")

    source = row["source"]
    ref = row["ref"]

    # Re-fetch fresh (in case CopperKnob/BootStepper updated the record
    # in the meantime — the admin should approve on current data).
    meta = await _fetch_meta(source, ref)

    # Last-chance duplicate check before insert.
    lib_dup = await dance_dedupe.find_duplicate(meta, source=source)
    if lib_dup:
        # Auto-mark the submission as approved-but-duplicate so it
        # leaves the queue cleanly.
        await db.pending_dances.update_one(
            {"id": pd_id},
            {
                "$set": {
                    "status": "approved",
                    "reviewed_at": now_iso(),
                    "reviewed_by": admin["user_id"],
                    "reviewed_by_name": admin.get("name", ""),
                    "approved_dance_id": lib_dup.get("id"),
                }
            },
        )
        return {
            "ok": True,
            "already_in_library": True,
            "dance_id": lib_dup.get("id"),
        }

    name = (meta.get("title") or "").strip()
    if not name:
        raise HTTPException(400, "Source record has no title")
    chor = (meta.get("choreographer") or "").strip()
    song = (meta.get("song") or "").strip()
    artist = (meta.get("artist") or "").strip()
    country = (meta.get("choreographer_country") or "").strip()

    doc = {
        "id": f"dance_{uuid.uuid4().hex[:10]}",
        "name": name,
        "choreographer": chor,
        "choreographer_country": country,
        "song": song,
        "artist": artist,
        "difficulty": _difficulty_from_level(meta.get("level", "")),
        "bpm": None,
        "count": _count_string(meta),
        "youtube_url": youtube_search_url(f"{name} {chor} line dance"),
        # Never store step sheet content — Terms forbid mirroring.
        "step_sheet": "",
        "step_sheet_image": "",
        "description": "",
        "tags": [],
        "copperknob_url": meta.get("url", "") if source == "copperknob" else "",
        "bootstepper_url": meta.get("url", "") if source == "bootstepper" else "",
        "copperknob_ref": ref if source == "copperknob" else "",
        "bootstepper_ref": (
            (meta.get("id") or meta.get("ref") or ref)
            if source == "bootstepper"
            else ""
        ),
        "is_published": True,  # approved submissions go live immediately
        # Credit the original submitter as the "created_by" so their
        # name appears on the dance card — makes the feature feel like
        # a genuine community contribution.
        "created_by": row.get("user_id"),
        "created_by_name": row.get("user_name") or row.get("user_email") or "",
        "created_at": now_iso(),
        "imported_from": {
            "source": source,
            "ref": ref,
            "url": meta.get("url", ""),
            "at": now_iso(),
            "by": admin["user_id"],
            "via": "user_submission",
            "submitted_by": row.get("user_id"),
            "submitted_by_name": row.get("user_name") or row.get("user_email") or "",
        },
    }
    # Sync choreographer_key so the new dance shows up under the
    # choreographer's search bucket.
    from services.choreographer_follows import inject_choreographer_key
    inject_choreographer_key(doc)
    await db.dances.insert_one(doc)

    # Update the queue row
    await db.pending_dances.update_one(
        {"id": pd_id},
        {
            "$set": {
                "status": "approved",
                "reviewed_at": now_iso(),
                "reviewed_by": admin["user_id"],
                "reviewed_by_name": admin.get("name", ""),
                "approved_dance_id": doc["id"],
            }
        },
    )

    # Fire followers notifications for the new dance (published above).
    try:
        from services.choreographer_follows import notify_followers_of_new_dance
        await notify_followers_of_new_dance(doc)
    except Exception:  # never let a follower-notify hiccup break approval
        logger.exception("Failed to notify choreographer followers for %s", doc["id"])

    # ALSO broadcast to every opted-in user via ``library_updates``.
    try:
        from services.library_broadcast import broadcast_new_dance
        await broadcast_new_dance(doc)
    except Exception:
        logger.exception(
            "Failed to broadcast new dance %s to library_updates subscribers",
            doc["id"],
        )

    # Ping the submitter so they don't have to check the app to see the
    # good news. Push is best-effort — failure never blocks approval.
    try:
        await _notify_submitter_approved(row, doc)
    except Exception:
        logger.exception(
            "Failed to notify submitter %s of approval", row.get("user_id")
        )

    return {"ok": True, "dance_id": doc["id"]}


@router.post("/admin/pending-dances/{pd_id}/reject")
async def admin_reject(
    pd_id: str,
    body: RejectBody,
    admin: dict = Depends(require_admin_or_editor),
):
    """Reject a pending submission with an optional reason."""
    row = await db.pending_dances.find_one({"id": pd_id}, {"_id": 0})
    if not row:
        raise HTTPException(404, "Submission not found")
    if row.get("status") != "pending":
        raise HTTPException(409, f"Submission is already {row.get('status')}")

    reason = (body.reason or "").strip()

    await db.pending_dances.update_one(
        {"id": pd_id},
        {
            "$set": {
                "status": "rejected",
                "reviewed_at": now_iso(),
                "reviewed_by": admin["user_id"],
                "reviewed_by_name": admin.get("name", ""),
                "rejection_reason": reason,
            }
        },
    )

    # Let the submitter know the outcome so they can act on it. Best
    # effort — a push relay hiccup shouldn't block the admin's flow.
    try:
        await _notify_submitter_rejected(row, reason)
    except Exception:
        logger.exception(
            "Failed to notify submitter %s of rejection", row.get("user_id")
        )

    return {"ok": True}


# ---------- Submitter notifications ----------
# Push is fire-and-forget; failure is logged and swallowed by the
# callers above so approve/reject always succeeds regardless.

async def _notify_submitter_approved(pd_row: dict, dance_doc: dict) -> None:
    """Push a friendly heads-up to the user whose submission just
    got approved. Deep-links straight to the new dance page."""
    user_id = pd_row.get("user_id")
    if not user_id:
        return
    from core.push_service import send_push_localised
    await send_push_localised(
        recipients=[user_id],
        title_key="push.pending_dance.approved.title",
        body_key="push.pending_dance.approved.body",
        params={"title": pd_row.get("title") or dance_doc.get("name") or ""},
        data={
            "deeplink": f"/dance/{dance_doc['id']}",
            "action_url": f"/dance/{dance_doc['id']}",
            "kind": "pending_dance_approved",
            "submission_id": pd_row.get("id"),
            "dance_id": dance_doc["id"],
        },
        idempotency_key=f"pd-approved-{pd_row.get('id')}",
    )


async def _notify_submitter_rejected(pd_row: dict, reason: str) -> None:
    """Push a heads-up when a submission is rejected. Body shows the
    admin's reason (trimmed) if one was supplied, else a soft
    catch-all so the user still knows what happened."""
    user_id = pd_row.get("user_id")
    if not user_id:
        return
    from core.push_service import send_push_localised
    fallback = "The admin didn't add it to the library this time."
    trimmed = (reason or "").strip()[:120]
    await send_push_localised(
        recipients=[user_id],
        title_key="push.pending_dance.rejected.title",
        body_key="push.pending_dance.rejected.body",
        params={
            "title": pd_row.get("title") or "",
            "reason": trimmed or fallback,
        },
        data={
            "deeplink": "/my-submissions",
            "action_url": "/my-submissions",
            "kind": "pending_dance_rejected",
            "submission_id": pd_row.get("id"),
        },
        idempotency_key=f"pd-rejected-{pd_row.get('id')}",
    )
