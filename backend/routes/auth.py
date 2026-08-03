"""Authentication routes: register / login / Google session / me /
forgot & reset password / logout / delete-my-account, plus the self-serve
instructor upgrade endpoint.
"""
from __future__ import annotations

import logging
import os
import secrets as _secrets_mod
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request

from core.config import (
    APP_PUBLIC_URL,
    EMERGENT_AUTH_SESSION_URL,
    RESET_RATE_LIMIT_PER_15MIN,
    RESET_TOKEN_TTL_MIN,
)
from core.database import db
from core.email_service import send_email
from core.rate_limit import client_ip, throttle_check, throttle_reset
from core.reset_tokens import hash_reset_token
from core.security import (
    bcrypt_dummy_delay,
    get_current_user,
    hash_password,
    instructor_code_ok,
    make_jwt,
    upsert_user,
    verify_password,
)
from core.serialize import user_to_out
from models.schemas import (
    ForgotPasswordIn,
    GoogleSessionIn,
    LoginIn,
    RegisterIn,
    ResetPasswordIn,
    SetInstructorIn,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/auth/register")
async def register(inp: RegisterIn, request: Request):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing and existing.get("password_hash"):
        raise HTTPException(400, "Email already registered")
    # Throttle instructor-code guessing during signup (per client IP)
    if inp.instructor_code:
        ip = client_ip(request)
        allowed, retry = throttle_check(
            f"code:{ip}", max_hits=5, window_sec=15 * 60,
        )
        if not allowed:
            raise HTTPException(
                429,
                f"Too many attempts — please wait {int(retry)}s and try again.",
            )
    user = await upsert_user(
        inp.email, inp.name, provider="email",
        password_hash=hash_password(inp.password),
    )
    # If they entered the studio's instructor code on signup, unlock the role.
    # (Admin/whitelist status set by upsert_user is preserved — we never demote.)
    if instructor_code_ok(inp.instructor_code) and not user.get("is_instructor"):
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"is_instructor": True}},
        )
        user["is_instructor"] = True
        # Reset the throttle on success — good actors shouldn't be penalised
        throttle_reset(f"code:{client_ip(request)}")
    token = make_jwt(user["user_id"], pwd_ver=int(user.get("pwd_ver") or 0))
    return {
        "token": token,
        "user": user_to_out(user),
        "is_new_user": bool(user.get("_is_new_user")),
    }


@router.post("/auth/set-instructor")
async def set_instructor(
    inp: SetInstructorIn,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Self-serve instructor upgrade for signed-in users.
    Requires the shared instructor access code. Admins are always instructors."""
    # Per-user + per-IP throttle: 5 attempts / 15 min per user, 20 / 15 min per IP
    ip = client_ip(request)
    for key, cap in [(f"code-user:{user['user_id']}", 5), (f"code-ip:{ip}", 20)]:
        allowed, retry = throttle_check(key, max_hits=cap, window_sec=15 * 60)
        if not allowed:
            raise HTTPException(
                429,
                f"Too many attempts — please wait {int(retry)}s and try again.",
            )
    if not instructor_code_ok(inp.instructor_code):
        # Small artificial delay to blunt brute-force attempts
        await bcrypt_dummy_delay()
        raise HTTPException(400, "Invalid access code")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"is_instructor": True}},
    )
    # Success — reset the per-user throttle so future legitimate uses are free
    throttle_reset(f"code-user:{user['user_id']}")
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"ok": True, "user": user_to_out(fresh)}


@router.post("/auth/login")
async def login(inp: LoginIn, request: Request):
    ip = client_ip(request)
    email = inp.email.lower()
    # Two-key throttle: per email (blocks account brute force) + per IP
    # (blocks credential stuffing across accounts).
    for key, cap in [(f"login:{email}", 10), (f"login-ip:{ip}", 40)]:
        allowed, retry = throttle_check(key, max_hits=cap, window_sec=15 * 60)
        if not allowed:
            raise HTTPException(
                429,
                f"Too many attempts — please wait {int(retry)}s and try again.",
            )
    user = await db.users.find_one({"email": email}, {"_id": 0})
    # Timing-safe: always run bcrypt so unknown emails take the same time
    if not user or not user.get("password_hash"):
        await bcrypt_dummy_delay()
        raise HTTPException(401, "Invalid credentials")
    if not verify_password(inp.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    throttle_reset(f"login:{email}")
    token = make_jwt(user["user_id"], pwd_ver=int(user.get("pwd_ver") or 0))
    return {"token": token, "user": user_to_out(user)}


@router.post("/auth/google-session")
async def google_session(inp: GoogleSessionIn):
    # Emergent-managed Google Auth session-exchange URL. Required from env so
    # no environment-specific URL is baked into source. In dev/preview this is
    # set in backend/.env; production overrides it in the deploy config.
    if not EMERGENT_AUTH_SESSION_URL:
        raise HTTPException(
            500,
            "Server misconfigured: EMERGENT_AUTH_SESSION_URL not set",
        )
    async with httpx.AsyncClient(timeout=15) as hc:
        r = await hc.get(
            EMERGENT_AUTH_SESSION_URL,
            headers={"X-Session-ID": inp.session_id},
        )
        if r.status_code != 200:
            raise HTTPException(401, "Invalid Google session")
        data = r.json()
    email = data.get("email", "").lower()
    if not email:
        raise HTTPException(401, "No email in session")
    user = await upsert_user(
        email, data.get("name", ""),
        picture=data.get("picture", ""), provider="google",
    )
    is_new = bool(user.get("_is_new_user"))
    session_token = data.get("session_token")
    if session_token:
        await db.user_sessions.insert_one({
            "session_token": session_token,
            "user_id": user["user_id"],
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        })
        return {
            "token": session_token,
            "user": user_to_out(user),
            "is_new_user": is_new,
        }
    # Fallback JWT
    return {
        "token": make_jwt(user["user_id"], pwd_ver=int(user.get("pwd_ver") or 0)),
        "user": user_to_out(user),
        "is_new_user": is_new,
    }


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user_to_out(user)


# ---------------- Password Reset ----------------
@router.post("/auth/forgot-password")
async def forgot_password(inp: ForgotPasswordIn, request: Request):
    """Always returns 200 (no user-enumeration).

    If the email exists AND has a password (i.e. not a Google-only account)
    AND the caller has not exceeded 3 requests in the last 15 minutes, a
    reset link is emailed with a 15-minute single-use token.
    """
    email = inp.email.lower().strip()
    generic_ok = {"ok": True, "message": "If that email exists, a reset link has been sent."}

    # Per-IP throttle blocks fan-out attacks where one attacker fires reset
    # requests at many emails to spam users. Keeps the DB tidy too.
    ip = client_ip(request)
    allowed, _retry = throttle_check(
        f"forgot-ip:{ip}", max_hits=20, window_sec=15 * 60,
    )
    if not allowed:
        # Silent — do not disclose the block to the caller
        return generic_ok

    user = await db.users.find_one({"email": email})
    # Silently ignore missing users / passwordless accounts to prevent enumeration.
    if not user or not user.get("password_hash"):
        # Still burn a small amount of time so timing doesn't leak existence.
        await bcrypt_dummy_delay()
        return generic_ok

    # Rate limit: max 3 unused tokens issued in the last 15 min
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=RESET_TOKEN_TTL_MIN)
    recent = await db.password_reset_tokens.count_documents({
        "user_id": user["user_id"],
        "issued_at": {"$gte": cutoff.isoformat()},
    })
    if recent >= RESET_RATE_LIMIT_PER_15MIN:
        # Silent — do not disclose to caller
        logger.info("reset rate-limited for user %s", email)
        return generic_ok

    # Generate and store hashed token
    raw = _secrets_mod.token_urlsafe(32)
    token_hash = hash_reset_token(raw)
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=RESET_TOKEN_TTL_MIN)
    await db.password_reset_tokens.insert_one({
        "user_id": user["user_id"],
        "email": email,
        "token_hash": token_hash,
        "issued_at": now.isoformat(),
        "expires_at": exp,  # datetime -> Mongo TTL index cleans up
        "used": False,
    })

    if not APP_PUBLIC_URL:
        logger.error("APP_PUBLIC_URL not set — cannot build reset URL")
        raise HTTPException(500, "Reset flow misconfigured — contact support")
    reset_url = f"{APP_PUBLIC_URL}/reset-password?token={raw}"
    display_name = user.get("name") or email.split("@")[0]

    text_body = (
        f"Hi {display_name},\n\n"
        f"We received a request to reset your Stompin' Ground Yuma password.\n"
        f"Open the link below to set a new password. This link expires in "
        f"{RESET_TOKEN_TTL_MIN} minutes and can only be used once.\n\n"
        f"{reset_url}\n\n"
        f"If you didn't request this, you can safely ignore this email — "
        f"your password will stay the same.\n\n"
        f"— Stompin' Ground Yuma"
    )
    html_body = f"""
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#2a1f18">
        <h2 style="color:#8B2E1E">Reset your password</h2>
        <p>Hi {display_name},</p>
        <p>We received a request to reset your <strong>Stompin' Ground Yuma</strong> password.
        Tap the button below to set a new password. This link expires in
        <strong>{RESET_TOKEN_TTL_MIN} minutes</strong> and can only be used once.</p>
        <p style="text-align:center;margin:24px 0">
          <a href="{reset_url}"
             style="background:#8B2E1E;color:#fff;padding:12px 22px;border-radius:8px;
                    text-decoration:none;font-weight:700">Reset password</a>
        </p>
        <p style="font-size:12px;color:#666">Or copy this link into your browser:<br/>
          <span style="word-break:break-all">{reset_url}</span></p>
        <p>If you didn't request this, you can safely ignore this email — your
        password will stay the same.</p>
        <p>— Stompin' Ground Yuma</p>
      </div>
    """.strip()

    await send_email(email, "Reset your Stompin' Ground Yuma password", text_body, html_body)
    return generic_ok


@router.post("/auth/reset-password")
async def reset_password(inp: ResetPasswordIn):
    if len(inp.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    token_hash = hash_reset_token(inp.token)
    doc = await db.password_reset_tokens.find_one({"token_hash": token_hash})
    if not doc or doc.get("used"):
        raise HTTPException(400, "Invalid or expired token")

    # Explicit expiry check (TTL index is background; don't rely on it for correctness)
    exp = doc.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            exp = datetime.now(timezone.utc) - timedelta(seconds=1)
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if not exp or exp < datetime.now(timezone.utc):
        raise HTTPException(400, "Invalid or expired token")

    user = await db.users.find_one({"user_id": doc["user_id"]})
    if not user:
        raise HTTPException(400, "Invalid or expired token")

    new_hash = hash_password(inp.new_password)
    # Bump pwd_ver so every JWT issued before this instant is rejected
    # by get_current_user (SEC-004). Also drop any lingering session
    # rows so Google-auth sessions are revoked too.
    new_pwd_ver = int(user.get("pwd_ver") or 0) + 1
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": new_hash, "pwd_ver": new_pwd_ver}},
    )
    await db.user_sessions.delete_many({"user_id": user["user_id"]})
    await db.password_reset_tokens.update_one(
        {"_id": doc["_id"]},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}},
    )
    # Best-effort: invalidate other unused tokens for this user
    await db.password_reset_tokens.update_many(
        {"user_id": user["user_id"], "used": False},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}},
    )
    logger.info("password reset for user %s", user.get("email"))
    return {"ok": True, "message": "Password reset successful"}


@router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@router.delete("/auth/me")
async def delete_my_account(user: dict = Depends(get_current_user)):
    """Permanently delete the caller's account and personal data.

    Required for App Store compliance (Apple Guideline 5.1.1(v)): users who
    can create an account in-app must be able to delete it in-app.

    Deletes:
      - user record, all sessions, all password reset tokens
      - all personal state (tracking, attendance, suggestions, chat messages,
        push token subscription)

    Anonymises (preserves for other users):
      - dances the user authored (author blanked to "Deleted user")
      - classes the user taught (instructor blanked to "Deleted user")

    Guard: the last remaining admin cannot delete their own account (prevents
    locking the tenant out).
    """
    uid = user["user_id"]
    email = user.get("email", "")

    # Guard: last admin standing cannot delete themselves
    if user.get("is_admin"):
        remaining_admins = await db.users.count_documents(
            {"is_admin": True, "user_id": {"$ne": uid}}
        )
        if remaining_admins == 0:
            raise HTTPException(
                400,
                "You are the last admin — promote another admin before deleting your account.",
            )

    # 1) Personal data — hard delete
    await db.user_sessions.delete_many({"user_id": uid})
    await db.password_reset_tokens.delete_many({"user_id": uid})
    await db.tracking.delete_many({"user_id": uid})
    await db.attendance.delete_many({"user_id": uid})
    await db.practice_sessions.delete_many({"user_id": uid})
    await db.suggestions.delete_many({"user_id": uid})
    await db.instructor_messages.delete_many({"user_id": uid})
    # push_tokens is a subdoc list keyed by user_id in the users collection
    # (nothing to do — it disappears when the user doc is removed)
    await db.sent_reminders.delete_many({"user_id": uid})

    # 2) Shared content — anonymise so other users' tracking/attendance still works
    await db.dances.update_many(
        {"created_by": uid},
        {"$set": {"created_by": "", "created_by_name": "Deleted user"}},
    )
    await db.classes.update_many(
        {"instructor_id": uid},
        {"$set": {"instructor_id": "", "instructor_name": "Deleted user"}},
    )

    # 3) The user itself
    await db.users.delete_one({"user_id": uid})

    logger.info("account deletion: %s (%s)", email, uid)
    return {"ok": True, "message": "Account and personal data deleted."}
