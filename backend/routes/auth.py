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
    AppleSignInIn,
    ForgotPasswordIn,
    GoogleSessionIn,
    LoginIn,
    PreferredLanguageIn,
    RegisterIn,
    ResetPasswordIn,
    SetInstructorIn,
)
from services.apple_auth import AppleTokenError, verify_identity_token

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/auth/register")
async def register(inp: RegisterIn, request: Request):
    # Apple Guideline 1.2: users must actively accept the current
    # Terms of Use / EULA BEFORE the account is created. The mobile
    # client sends the exact version string the user checked; if it
    # doesn't match, refuse the registration with a clear code the
    # UI can react to.
    from core.terms import TERMS_VERSION
    if (inp.accepted_terms_version or "").strip() != TERMS_VERSION:
        raise HTTPException(
            400,
            {
                "code": "terms_not_accepted",
                "message": (
                    "You must read and agree to the Terms of Use and "
                    "Community Guidelines to create an account."
                ),
                "required_version": TERMS_VERSION,
            },
        )
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
    # Stamp the accepted terms version on the fresh record so we know
    # this user consented at signup time (audit + Apple review evidence).
    from core.terms import TERMS_VERSION as _TV
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {
            "$set": {
                "accepted_terms_version": _TV,
                "accepted_terms_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            }
        },
    )
    user["accepted_terms_version"] = _TV
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
        # Ping admins so they can audit the grant from the admin panel.
        # Best-effort — never block the registration response.
        try:
            from services.admin_notifications import (
                notify_admins_of_instructor_grant,
            )
            await notify_admins_of_instructor_grant(user)
        except Exception:
            logger.exception(
                "Failed to notify admins of instructor grant for %s",
                user.get("email"),
            )
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
    # Ping admins so they can audit the grant. Best-effort — must never
    # block the primary response.
    try:
        from services.admin_notifications import (
            notify_admins_of_instructor_grant,
        )
        await notify_admins_of_instructor_grant(fresh or user)
    except Exception:
        logger.exception(
            "Failed to notify admins of self-serve instructor grant for %s",
            (fresh or user).get("email"),
        )
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
    # Apple UGC 1.2 — banned users get a clear 403 at login time
    # instead of a fresh token they can't use. Suspended users get a
    # 403 with the unlock time so the UI can render a countdown.
    if user.get("is_banned"):
        raise HTTPException(
            403,
            {
                "code": "account_banned",
                "message": (
                    "Your account has been permanently removed for violating "
                    "our Community Guidelines. Contact "
                    "whereyumalinesuptodance@stompingroundyuma.org if you "
                    "believe this is an error."
                ),
            },
        )
    if user.get("is_suspended"):
        suspend_until = user.get("suspend_until")
        try:
            if suspend_until:
                until = datetime.fromisoformat(str(suspend_until).replace("Z", "+00:00"))
                if until.tzinfo is None:
                    until = until.replace(tzinfo=timezone.utc)
                if until > datetime.now(timezone.utc):
                    raise HTTPException(
                        403,
                        {
                            "code": "account_suspended",
                            "message": (
                                "Your account is temporarily suspended for "
                                "violating our Community Guidelines."
                            ),
                            "suspend_until": suspend_until,
                            "reason": user.get("moderation_reason") or "",
                        },
                    )
        except HTTPException:
            raise
        except Exception:
            logger.exception("suspend_until parse failed at login for user=%s", email)
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


@router.patch("/auth/me/language")
async def set_preferred_language(
    inp: PreferredLanguageIn,
    user: dict = Depends(get_current_user),
):
    """Persist the caller's preferred UI / notification language.

    Empty ``language`` clears the override so the client falls back to
    the device locale (matches the "System default" pill in Settings).
    Non-empty must be one of ``SUPPORTED_LANGUAGES`` — anything else
    is rejected 400 so a client bug can't smuggle in an unsupported
    tag and end up on the English fallback silently.
    """
    from core.i18n import SUPPORTED_LANGUAGES, _normalise_lang, is_supported

    raw = (inp.language or "").strip()
    if raw and not is_supported(raw):
        raise HTTPException(
            400,
            f"Unsupported language. Choose one of: {', '.join(SUPPORTED_LANGUAGES)}",
        )
    canonical = _normalise_lang(raw) if raw else ""
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"preferred_language": canonical}},
    )
    fresh = await db.users.find_one(
        {"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0}
    )
    return {"ok": True, "user": user_to_out(fresh)}


# ---------------- Sign in with Apple ----------------
@router.post("/auth/apple")
async def apple_sign_in(inp: AppleSignInIn):
    """Native Apple Sign-in.

    Flow
    ----
    1. Verify ``identity_token`` against Apple's public JWKS.
    2. Look up the user by ``apple_sub`` first (stable across name/email
       changes). Fall back to ``email`` for legacy users who signed up
       with email/password and are now linking Apple.
    3. If no user exists, create one with a synthesized name from
       ``full_name`` (only present on the very first sign-in) or the
       email local part.
    4. Return the same ``{token, user}`` shape as email/password login
       so the mobile client just re-uses its existing session logic.
    """
    try:
        claims = await verify_identity_token(inp.identity_token)
    except AppleTokenError as e:
        raise HTTPException(401, str(e))

    apple_sub: str = claims.get("sub", "")
    # Apple only includes the email on the very first sign-in AND only if
    # the user hasn't hidden it. Prefer the token's email over the body
    # payload — the token is authoritative.
    token_email = (claims.get("email") or "").lower().strip()
    body_email = (inp.email or "").lower().strip() if inp.email else ""
    email = token_email or body_email  # may still be ""
    email_verified = bool(claims.get("email_verified", True))
    if isinstance(email_verified, str):
        # Apple sometimes stringifies booleans in the token — handle
        # both "true"/"false" and the literal bool.
        email_verified = email_verified.lower() == "true"

    # 1) Existing account keyed on Apple sub — the happy path.
    user = await db.users.find_one({"apple_sub": apple_sub}, {"_id": 0})

    # 2) Legacy linking — user signed up with the same email using
    #    email/password or Google previously. We attach ``apple_sub``
    #    so subsequent Apple sign-ins hit the fast path above.
    if user is None and email:
        user = await db.users.find_one({"email": email}, {"_id": 0})
        if user is not None:
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"apple_sub": apple_sub}},
            )
            user["apple_sub"] = apple_sub

    is_new_user = False
    if user is None:
        # 3) Brand-new user. Store the private-relay email as-is so
        #    password-reset + notification flows keep working; the user
        #    can always change it later.
        name = (inp.full_name or "").strip()
        if not name and email:
            name = email.split("@")[0]
        if not name:
            name = "Dancer"
        # ``upsert_user`` centralises the email→admin/instructor
        # allowlist logic, so re-use it for consistency. Apple accounts
        # without an email fall through to a synthetic one so unique
        # indexes don't collide.
        synthetic_email = email or f"apple:{apple_sub}"
        user = await upsert_user(
            synthetic_email,
            name,
            picture="",
            provider="apple",
        )
        # Stamp the Apple-specific fields the shared helper doesn't
        # know about.
        updates: dict = {"apple_sub": apple_sub}
        if not email:
            # Mark the synthetic email so we can hide password-reset UI
            # for these users later.
            updates["email_is_synthetic"] = True
        if email and not email_verified:
            updates["email_verified"] = False
        await db.users.update_one(
            {"user_id": user["user_id"]}, {"$set": updates}
        )
        user.update(updates)
        is_new_user = True

    # Exchange the one-shot ``authorization_code`` for a durable refresh
    # token the first time we see one. Apple codes expire in ~10 min
    # and are single-use, so we only try when (a) the client sent one
    # and (b) we don't already have one on the user doc. Failures are
    # silent — sign-in still succeeds; revoke-on-delete just becomes
    # best-effort until the next fresh sign-in.
    if inp.authorization_code and not user.get("apple_refresh_token"):
        from services.apple_revoke import exchange_code_for_refresh_token

        refresh = await exchange_code_for_refresh_token(inp.authorization_code)
        if refresh:
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"apple_refresh_token": refresh}},
            )
            user["apple_refresh_token"] = refresh

    return {
        "token": make_jwt(
            user["user_id"], pwd_ver=int(user.get("pwd_ver") or 0)
        ),
        "user": user_to_out(user),
        "is_new_user": is_new_user,
    }


@router.post("/auth/apple/link")
async def apple_link(
    inp: AppleSignInIn, user: dict = Depends(get_current_user)
):
    """Link the caller's account to an Apple ID.

    Verifies the token the same way as ``/auth/apple`` — this is where
    we prove the caller actually controls the Apple account. If another
    user already has this ``apple_sub`` we refuse (409) rather than
    silently steal the association.
    """
    try:
        claims = await verify_identity_token(inp.identity_token)
    except AppleTokenError as e:
        raise HTTPException(401, str(e))
    apple_sub: str = claims.get("sub", "")
    existing = await db.users.find_one(
        {"apple_sub": apple_sub}, {"_id": 0, "user_id": 1}
    )
    if existing and existing.get("user_id") != user["user_id"]:
        raise HTTPException(
            409,
            "This Apple ID is already linked to a different SGY account.",
        )
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"apple_sub": apple_sub}}
    )
    # Same one-shot exchange as ``/auth/apple`` — get a refresh token
    # so revoke-on-delete works for this account too.
    if inp.authorization_code:
        from services.apple_revoke import exchange_code_for_refresh_token

        refresh = await exchange_code_for_refresh_token(inp.authorization_code)
        if refresh:
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"apple_refresh_token": refresh}},
            )
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"ok": True, "user": user_to_out(fresh)}


@router.post("/auth/apple/unlink")
async def apple_unlink(user: dict = Depends(get_current_user)):
    """Remove the Apple association from the caller's account.

    Refuses if the caller has no password AND no linked email — losing
    the Apple link there would lock them out. Google-only users are OK
    to unlink since they can still get in via Google.
    """
    has_password = bool(user.get("password_hash"))
    # Parenthesise the second branch so short-circuit evaluation can't
    # mask a synthetic-email account. Without the parens, ``and`` binds
    # tighter than ``or``, so a Google user with an empty email would
    # slip through. See SEC hygiene note in June 2026 audit.
    has_google_or_email = (
        user.get("auth_provider") in {"google"}
        or (
            bool(user.get("email"))
            and not user.get("email_is_synthetic")
        )
    )
    if not has_password and not has_google_or_email:
        raise HTTPException(
            400,
            "Set a password first — otherwise you won't be able to sign back in.",
        )
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$unset": {"apple_sub": ""}}
    )
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"ok": True, "user": user_to_out(fresh)}


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

    # Translate to the user's preferred language. Users who never set
    # an override see English (the DEFAULT_LANGUAGE fallback).
    from core.i18n import preferred_language_for, t as _t

    lang = preferred_language_for(user)
    subject = _t("email.reset.subject", lang)

    text_body = (
        f"{_t('email.reset.greeting', lang, name=display_name)}\n\n"
        f"{_t('email.reset.intro', lang, minutes=RESET_TOKEN_TTL_MIN)}\n\n"
        f"{reset_url}\n\n"
        f"{_t('email.reset.ignore', lang)}\n\n"
        f"{_t('email.reset.signoff', lang)}"
    )
    html_body = f"""
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#2a1f18">
        <h2 style="color:#8B2E1E">{subject}</h2>
        <p>{_t('email.reset.greeting', lang, name=display_name)}</p>
        <p>{_t('email.reset.intro', lang, minutes=RESET_TOKEN_TTL_MIN)}</p>
        <p style="text-align:center;margin:24px 0">
          <a href="{reset_url}"
             style="background:#8B2E1E;color:#fff;padding:12px 22px;border-radius:8px;
                    text-decoration:none;font-weight:700">{_t('email.reset.button', lang)}</a>
        </p>
        <p style="font-size:12px;color:#666">{_t('email.reset.copy_hint', lang)}<br/>
          <span style="word-break:break-all">{reset_url}</span></p>
        <p>{_t('email.reset.ignore', lang)}</p>
        <p>{_t('email.reset.signoff', lang)}</p>
      </div>
    """.strip()

    await send_email(email, subject, text_body, html_body)
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
    await db.user_badges.delete_many({"user_id": uid})
    await db.practice_daily.delete_many({"user_id": uid})
    # Social graph + activity feed events (both incoming + outgoing)
    from services.social import purge_user as purge_social
    await purge_social(uid)
    # Choreographer follow-graph + notification ledger — mirrors the
    # social purge so an ex-user can't leave orphan rows pointing back
    # at their user_id.
    from services.choreographer_follows import purge_user as purge_chor
    await purge_chor(uid)
    # Chat @mention rows (both sent BY and TO this user)
    from services.chat_mentions import purge_user as purge_mentions
    await purge_mentions(uid)
    # Chat read-receipt pointer
    from services.chat_reads import purge_user as purge_chat_reads
    await purge_chat_reads(uid)
    # Chat reactions authored by this user
    from services.chat_reactions import purge_user as purge_chat_reactions
    await purge_chat_reactions(uid)
    # Follower push ledger for classes/events posted BY or seen BY user
    from services.instructor_notifications import purge_user as purge_inst_notif
    await purge_inst_notif(uid)
    # Library-wide broadcast ledger (new dance / new class to all users).
    try:
        from services.library_broadcast import purge_user as purge_lib_bc
        await purge_lib_bc(uid)
    except Exception:  # pragma: no cover
        logger.exception("library_broadcast purge failed for %s", uid)
    # Notification Center feed rows for this user.
    try:
        from services.notification_feed import purge_user as purge_feed
        await purge_feed(uid)
    except Exception:  # pragma: no cover
        logger.exception("notification_feed purge failed for %s", uid)
    # DOTD streak ledger + user doc flags.
    try:
        from services.dotd_streak import purge_user as purge_dotd
        await purge_dotd(uid)
    except Exception:  # pragma: no cover
        logger.exception("dotd_streak purge failed for %s", uid)
    # Event RSVPs authored by this user
    await db.event_rsvps.delete_many({"user_id": uid})

    # 2) Shared content — anonymise so other users' tracking/attendance still works
    await db.dances.update_many(
        {"created_by": uid},
        {"$set": {"created_by": "", "created_by_name": "Deleted user"}},
    )
    await db.classes.update_many(
        {"instructor_id": uid},
        {"$set": {"instructor_id": "", "instructor_name": "Deleted user"}},
    )

    # 3) Apple Sign-In token revocation — App Store 5.1.1(v) requires
    #    apps that offer Sign in with Apple to revoke the user's
    #    Apple-side tokens when the account is deleted. We do this
    #    BEFORE deleting the user row so a network hiccup doesn't
    #    strand the refresh_token. Failure is logged and non-fatal —
    #    Apple's server-to-server "consent revoked" callback is the
    #    fallback reconciliation path.
    refresh_token = (user.get("apple_refresh_token") or "").strip()
    if refresh_token:
        try:
            from services.apple_revoke import revoke_refresh_token

            ok = await revoke_refresh_token(refresh_token)
            logger.info(
                "apple revoke on delete: user=%s ok=%s", uid, ok
            )
        except Exception as e:  # pragma: no cover — never let this
            # block deletion.
            logger.warning("apple revoke crashed for user=%s: %s", uid, e)

    # 4) The user itself
    await db.users.delete_one({"user_id": uid})

    logger.info("account deletion: %s (%s)", email, uid)
    return {"ok": True, "message": "Account and personal data deleted."}
