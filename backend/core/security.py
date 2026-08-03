"""Auth primitives: password hashing, JWT issue/decode, current-user dep,
role-based dependencies used across routes.

`get_current_user` accepts both Emergent Google session tokens (stored in
``user_sessions``) and app-issued JWTs. JWTs carry a ``pwd_ver`` claim that
must still match ``users.pwd_ver`` — bumping ``pwd_ver`` (on password reset)
invalidates every previously-issued JWT for that account.
"""
from __future__ import annotations

import hmac
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt as pyjwt
from fastapi import Depends, Header, HTTPException

from core.config import (
    ADMIN_EMAILS,
    INSTRUCTOR_CODE,
    INSTRUCTOR_EMAILS,
    JWT_ALG,
    JWT_SECRET,
    STEP_SHEET_EDITOR_EMAILS,
)
from core.database import db
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)


# ---------------- Password ----------------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


async def bcrypt_dummy_delay() -> None:
    """Constant-time-ish delay to blunt user-enumeration timing attacks."""
    try:
        bcrypt.checkpw(b"x", bcrypt.hashpw(b"x", bcrypt.gensalt(rounds=8)))
    except Exception:
        pass


# ---------------- JWT ----------------
def make_jwt(user_id: str, *, pwd_ver: int = 0) -> str:
    """Issue a signed JWT for a user.

    `pwd_ver` is the user's `pwd_ver` field at the moment the token is
    issued. On decode we verify that the token's `pwd_ver` still matches
    the user's current value — bumping `pwd_ver` in the users collection
    (e.g. after a password reset) instantly invalidates every previously
    issued JWT for that account (SEC-004).
    """
    payload = {
        "user_id": user_id,
        "pwd_ver": pwd_ver,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
        "iat": datetime.now(timezone.utc),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


# ---------------- Instructor code (constant-time compare) ----------------
def instructor_code_ok(candidate: Optional[str]) -> bool:
    """Constant-time comparison against the server-side INSTRUCTOR_CODE."""
    if not candidate or not INSTRUCTOR_CODE:
        return False
    return hmac.compare_digest(candidate.strip(), INSTRUCTOR_CODE)


# ---------------- User upsert ----------------
async def upsert_user(
    email: str,
    name: str,
    picture: str = "",
    provider: str = "email",
    password_hash: Optional[str] = None,
) -> dict:
    """Return the user record.

    A synthetic ``_is_new_user`` bool is attached so callers can trigger
    first-time UX (fireworks overlay on register / first Google login).
    The flag is NOT persisted to the DB.
    """
    email = email.lower().strip()
    should_be_admin = email in ADMIN_EMAILS
    should_be_instructor = email in ADMIN_EMAILS or email in INSTRUCTOR_EMAILS
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        updates = {"name": name or existing.get("name", email)}
        if picture:
            updates["picture"] = picture
        if password_hash:
            updates["password_hash"] = password_hash
        # Self-heal instructor/admin flags for whitelisted emails
        if should_be_admin and not existing.get("is_admin"):
            updates["is_admin"] = True
        if should_be_instructor and not existing.get("is_instructor"):
            updates["is_instructor"] = True
        await db.users.update_one({"email": email}, {"$set": updates})
        existing.update(updates)
        existing["_is_new_user"] = False
        return existing
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": email,
        "name": name or email.split("@")[0],
        "picture": picture,
        "is_admin": should_be_admin,
        "is_instructor": should_be_instructor,
        "auth_provider": provider,
        "password_hash": password_hash or "",
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    doc["_is_new_user"] = True
    return doc


# ---------------- Current user + role dependencies ----------------
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.split(" ", 1)[1].strip()

    # 1) Try Emergent session token (stored in DB)
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if sess:
        expires = sess.get("expires_at")
        if isinstance(expires, datetime):
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires < datetime.now(timezone.utc):
                raise HTTPException(401, "Session expired")
        user = await db.users.find_one(
            {"user_id": sess["user_id"]},
            {"_id": 0, "password_hash": 0},
        )
        if not user:
            raise HTTPException(401, "User not found")
        return user

    # 2) Try JWT
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user = await db.users.find_one(
            {"user_id": payload["user_id"]},
            {"_id": 0, "password_hash": 0},
        )
        if not user:
            raise HTTPException(401, "User not found")
        # Invalidate JWTs issued before the last password reset (SEC-004).
        # Legacy tokens without `pwd_ver` are treated as version 0.
        tok_ver = int(payload.get("pwd_ver") or 0)
        cur_ver = int(user.get("pwd_ver") or 0)
        if tok_ver != cur_ver:
            raise HTTPException(401, "Session invalidated — please sign in again.")
        return user
    except pyjwt.PyJWTError:
        raise HTTPException(401, "Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin only")
    return user


async def require_instructor(user: dict = Depends(get_current_user)) -> dict:
    if not (user.get("is_admin") or user.get("is_instructor")):
        raise HTTPException(403, "Instructor only")
    return user


def user_can_edit_step_sheets(user: dict) -> bool:
    """Strictly the whitelist — no admin backdoor.
    User said 'no one other than Erin and Jamin' so we honour that literally."""
    email = (user.get("email") or "").lower()
    return email in STEP_SHEET_EDITOR_EMAILS


async def require_step_sheet_editor(user: dict = Depends(get_current_user)) -> dict:
    if not user_can_edit_step_sheets(user):
        raise HTTPException(403, "Only Erin or Jamin can edit step sheets")
    return user


async def require_admin_or_editor(user: dict = Depends(get_current_user)) -> dict:
    """Admins OR step-sheet editors (Erin & Jamin). Used for reviewing user
    suggestions — the review team is admin + the whitelisted senior
    instructors."""
    if user.get("is_admin") or user_can_edit_step_sheets(user):
        return user
    raise HTTPException(403, "Admin or step-sheet editor only")
