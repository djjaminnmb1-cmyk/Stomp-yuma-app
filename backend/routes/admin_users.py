"""Admin management for other users' auth.

Two capabilities today — both restricted to signed-in admins:

- ``POST /admin/users/set-password`` — set (or reset) another user's
  password by email. Works even if the target signed up with Apple/Google
  only (no existing ``password_hash``). Bumps the target's ``pwd_ver`` so
  any of *their* previously issued JWTs are invalidated (SEC-004), and
  drops any lingering Google session rows.
- ``POST /admin/users/promote`` — set/unset ``is_admin`` / ``is_instructor``
  flags on another user. Guards against the last admin demoting themselves.

Kept in its own file so the admin surface is easy to audit and the
existing ``admin_leaderboard`` module can stay narrowly focused.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from core.database import db
from core.security import hash_password, require_admin

logger = logging.getLogger(__name__)
router = APIRouter()


class AdminSetPasswordBody(BaseModel):
    email: EmailStr
    new_password: str = Field(..., min_length=8, max_length=128)


class AdminPromoteBody(BaseModel):
    email: EmailStr
    is_admin: Optional[bool] = None
    is_instructor: Optional[bool] = None


@router.post("/admin/users/set-password")
async def admin_set_password(
    inp: AdminSetPasswordBody,
    admin: dict = Depends(require_admin),
):
    """Set (or reset) another user's password by email.

    Intended for the rare case where an Apple-only user needs a
    fallback email/password login, or where the SMTP-based reset flow
    isn't practical. Bumps the target's ``pwd_ver`` so any of their
    previously issued JWTs stop working — the target must sign in
    again after this call.
    """
    email = inp.email.lower().strip()
    target = await db.users.find_one({"email": email}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")

    new_hash = hash_password(inp.new_password)
    new_pwd_ver = int(target.get("pwd_ver") or 0) + 1
    await db.users.update_one(
        {"user_id": target["user_id"]},
        {"$set": {"password_hash": new_hash, "pwd_ver": new_pwd_ver}},
    )
    # Revoke any Google session rows so old tokens can't ride along.
    await db.user_sessions.delete_many({"user_id": target["user_id"]})
    logger.warning(
        "admin=%s set password for user=%s (%s)",
        admin.get("email"), target.get("user_id"), email,
    )
    return {
        "ok": True,
        "user_id": target["user_id"],
        "email": email,
        "message": "Password set. User's previous tokens are invalidated.",
    }


@router.post("/admin/users/promote")
async def admin_promote(
    inp: AdminPromoteBody,
    admin: dict = Depends(require_admin),
):
    """Grant / revoke ``is_admin`` / ``is_instructor`` on another user.

    Pass only the flags you want to change — omitted flags are left
    untouched. Guards against an admin demoting the last remaining
    admin.
    """
    email = inp.email.lower().strip()
    target = await db.users.find_one({"email": email}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")

    updates: dict = {}
    if inp.is_admin is not None:
        # Guard: don't let the last admin be demoted.
        if not inp.is_admin and target.get("is_admin"):
            remaining = await db.users.count_documents(
                {"is_admin": True, "user_id": {"$ne": target["user_id"]}}
            )
            if remaining == 0:
                raise HTTPException(
                    400,
                    "Cannot demote the last remaining admin. Promote "
                    "another admin first.",
                )
        updates["is_admin"] = bool(inp.is_admin)
        # Admins are always instructors — keep the two flags consistent
        # when granting admin (but don't clobber instructor status when
        # demoting from admin).
        if inp.is_admin:
            updates["is_instructor"] = True

    if inp.is_instructor is not None:
        updates["is_instructor"] = bool(inp.is_instructor)

    if not updates:
        return {"ok": True, "unchanged": True, "user_id": target["user_id"]}

    await db.users.update_one(
        {"user_id": target["user_id"]}, {"$set": updates}
    )
    logger.warning(
        "admin=%s promoted user=%s (%s) with %s",
        admin.get("email"), target.get("user_id"), email, updates,
    )
    fresh = await db.users.find_one({"user_id": target["user_id"]}, {"_id": 0})
    return {
        "ok": True,
        "user_id": target["user_id"],
        "email": email,
        "is_admin": bool(fresh.get("is_admin")),
        "is_instructor": bool(fresh.get("is_instructor")),
    }
