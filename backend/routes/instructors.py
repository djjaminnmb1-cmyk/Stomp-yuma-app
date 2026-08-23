"""Instructor directory + user's picked instructors + main instructor.

Powers the picker used from Home → Suggest a Dance (and from Profile →
"My instructors"). Kept in its own router because the concerns are
tangential to /auth: this is discovery + preference, not authentication.

Two closely-related preferences live here:

* ``users.main_instructor_id`` — the single instructor who receives the
  dancer's Suggest-a-Dance submissions (kept for continuity + suggestion
  routing). Always a member of ``instructor_ids`` when set.
* ``users.instructor_ids`` — the full list of instructors the dancer
  has "adopted" (attends classes with, wants updates from). Multi-select
  UX lets dancers follow every teacher whose class they attend.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import db
from core.security import get_current_user
from core.serialize import user_to_out
from models.schemas import InstructorSelectionBody, MainInstructorBody
from services.social import follow as social_follow

router = APIRouter()


class InstructorLite(BaseModel):
    user_id: str
    name: str
    picture: str = ""
    city: str = ""
    state: str = ""


def _norm_bool(v) -> bool:
    return bool(v) if v is not None else False


async def _load_and_validate_instructors(instructor_ids: list[str]) -> list[dict]:
    """Fetch each user_id and confirm they're an instructor or admin.

    Silently drops invalid ids (unknown users, non-instructor users)
    rather than raising — the client's picker only surfaces instructor
    ids to begin with, so the only way we'd hit this is if someone
    scripts a bad payload. Trimming to real instructors is safer than
    a hard reject that hides good picks behind one bad id.
    """
    if not instructor_ids:
        return []
    seen: set[str] = set()
    ordered_ids: list[str] = []
    for iid in instructor_ids:
        if iid and iid not in seen:
            seen.add(iid)
            ordered_ids.append(iid)
    if not ordered_ids:
        return []
    rows = await db.users.find(
        {"user_id": {"$in": ordered_ids}},
        {"_id": 0, "user_id": 1, "name": 1, "is_instructor": 1, "is_admin": 1},
    ).to_list(length=len(ordered_ids))
    by_id = {r["user_id"]: r for r in rows}
    valid: list[dict] = []
    for iid in ordered_ids:
        r = by_id.get(iid)
        if r and (r.get("is_instructor") or r.get("is_admin")):
            valid.append(r)
    return valid


async def _upsert_follows(follower_id: str, target_ids: list[str]) -> int:
    """Ensure the caller follows each ``target_id`` (upsert, idempotent).

    Never unfollows — this is an "opt-in" side-effect of picking an
    instructor. Users can still unfollow later from the follows screen.
    Delegates to ``services.social.follow`` so we hit the same insert
    path (and unique index — ``follower_id + followee_id``) as the rest
    of the app.

    Returns the number of NEW follows created (audit only).
    """
    if not target_ids:
        return 0
    created = 0
    for tid in target_ids:
        if not tid or tid == follower_id:
            continue
        if await social_follow(follower_id, tid):
            created += 1
    return created


@router.get("/instructors")
async def list_instructors(
    q: Optional[str] = Query(default=None),
    city: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    """Return every account flagged ``is_instructor`` or ``is_admin``.

    Admins are included because the SGY head instructor (Erin) is an
    admin — they are still someone a dancer might route suggestions
    to. Result is small (< a few dozen rows in the foreseeable future)
    so no pagination is exposed; we just cap at 500 to be safe.
    """
    filt: dict = {
        "$or": [{"is_instructor": True}, {"is_admin": True}],
    }
    if q:
        needle = q.strip()
        if needle:
            filt["name"] = {"$regex": needle, "$options": "i"}
    if city:
        c = city.strip()
        if c:
            filt["city"] = {"$regex": f"^{c}", "$options": "i"}
    rows: list[dict] = []
    async for u in db.users.find(
        filt,
        {
            "_id": 0,
            "user_id": 1,
            "name": 1,
            "picture": 1,
            "city": 1,
            "state": 1,
        },
    ).sort("name", 1).limit(limit):
        rows.append(
            {
                "user_id": u.get("user_id", ""),
                "name": u.get("name", "") or "",
                "picture": u.get("picture", "") or "",
                "city": u.get("city", "") or "",
                "state": u.get("state", "") or "",
            }
        )
    return {"instructors": rows}


@router.put("/auth/me/instructors")
async def save_instructors(
    body: InstructorSelectionBody, user: dict = Depends(get_current_user)
):
    """Atomic update of the caller's picked instructors + main
    instructor + optional bulk-follow.

    Returns the freshly-hydrated ``UserOut`` plus counts of new follows
    the server created so the client can toast "Now following 3 more!"
    """
    valid = await _load_and_validate_instructors(body.instructor_ids)
    valid_ids = [v["user_id"] for v in valid]

    # Resolve the main_instructor_id:
    #   1. Explicit ``body.main_instructor_id`` when it's a member of
    #      the newly-picked list.
    #   2. Existing user.main_instructor_id if it's still selected.
    #   3. First valid instructor in the picked list.
    #   4. Empty string when the list is cleared.
    resolved_main = ""
    explicit_main = (body.main_instructor_id or "").strip()
    existing_main = (user.get("main_instructor_id") or "").strip()
    if explicit_main and explicit_main in valid_ids:
        resolved_main = explicit_main
    elif existing_main and existing_main in valid_ids:
        resolved_main = existing_main
    elif valid_ids:
        resolved_main = valid_ids[0]

    update_doc: dict = {"instructor_ids": valid_ids}
    if resolved_main:
        update_doc["main_instructor_id"] = resolved_main
    unset_doc: dict = {}
    if not resolved_main:
        # Clear the field so the picker re-opens on next Suggest tap.
        unset_doc["main_instructor_id"] = ""

    ops: dict = {"$set": update_doc}
    if unset_doc:
        ops["$unset"] = unset_doc

    await db.users.update_one({"user_id": user["user_id"]}, ops)

    # Denormalise the new main-instructor name on any pending
    # suggestions from the caller so the "For {name}" inbox stays
    # sensible. Only touches rows that are still routed by
    # main-instructor fallback (i.e. target_instructor_id == "" or
    # equal to the previous main). Bounded by pending rows only.
    if resolved_main and existing_main and existing_main != resolved_main:
        # No name refresh needed for the switch-primary case — the
        # previous instructor's name is fine on historical rows. The
        # DB stores both id + name and the client uses id for filtering.
        pass

    new_follows = 0
    if body.follow and valid_ids:
        new_follows = await _upsert_follows(user["user_id"], valid_ids)

    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {
        "ok": True,
        "user": user_to_out(fresh or user),
        "new_follows": new_follows,
    }


@router.patch("/auth/me/main-instructor")
async def set_main_instructor(
    body: MainInstructorBody, user: dict = Depends(get_current_user)
):
    """Set (or change) the caller's preferred instructor.

    The target must actually be an instructor (or admin) — we don't
    let dancers point their suggestion inbox at a random user by
    mistake. Also inserts the target into ``instructor_ids`` so the
    single-pick path stays consistent with the multi-pick path.
    """
    if not body.instructor_id:
        raise HTTPException(400, "instructor_id is required.")
    target = await db.users.find_one(
        {"user_id": body.instructor_id},
        {"_id": 0, "is_instructor": 1, "is_admin": 1, "name": 1},
    )
    if not target:
        raise HTTPException(404, "Instructor not found.")
    if not (target.get("is_instructor") or target.get("is_admin")):
        raise HTTPException(400, "That user isn't an instructor.")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {
            "$set": {"main_instructor_id": body.instructor_id},
            "$addToSet": {"instructor_ids": body.instructor_id},
        },
    )
    return {
        "ok": True,
        "main_instructor_id": body.instructor_id,
        "main_instructor_name": target.get("name", "") or "",
    }


@router.delete("/auth/me/main-instructor")
async def clear_main_instructor(user: dict = Depends(get_current_user)):
    """Clear the caller's preferred instructor so the next Suggest tap
    re-opens the picker. Does NOT wipe the multi-select ``instructor_ids``
    list — that stays independent."""
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$unset": {"main_instructor_id": ""}},
    )
    return {"ok": True}
