from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import logging
import uuid
import hmac
import hashlib
import secrets as _secrets_mod
import bcrypt
import jwt as pyjwt
import httpx
import aiosmtplib
from email.message import EmailMessage
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta, date
from apscheduler.schedulers.asyncio import AsyncIOScheduler

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT secret is REQUIRED and must not be a well-known default.
_INSECURE_JWT_DEFAULTS = {
    "",
    "stompin-yuma-secret-change-me",
    "change-me",
    "secret",
}
JWT_SECRET = os.environ.get("JWT_SECRET", "").strip()
if not JWT_SECRET or JWT_SECRET in _INSECURE_JWT_DEFAULTS or len(JWT_SECRET) < 32:
    raise RuntimeError(
        "JWT_SECRET env var must be set to a strong random value "
        "(>=32 chars, not a known default). Generate one with: "
        "python -c 'import secrets; print(secrets.token_urlsafe(48))'"
    )
JWT_ALG = "HS256"
ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.environ.get(
        "ADMIN_EMAILS",
        "admin@stompinground.com,erinboroughs@gmail.com",
    ).split(",")
    if e.strip()
}
INSTRUCTOR_EMAILS = {
    e.strip().lower()
    for e in os.environ.get(
        "INSTRUCTOR_EMAILS",
        "luvtowork247@yahoo.com",
    ).split(",")
    if e.strip()
}
# Emails allowed to CREATE / EDIT / DELETE step sheets (both text and image).
# This is a stricter privilege than the general instructor role: any user who
# knows the studio access code can become an "instructor" (log classes, chat),
# but only the emails on this list may modify official dance step-sheet content.
STEP_SHEET_EDITOR_EMAILS = {
    e.strip().lower()
    for e in os.environ.get(
        "STEP_SHEET_EDITOR_EMAILS",
        "erinboroughs@gmail.com,luvtowork247@yahoo.com",
    ).split(",")
    if e.strip()
}
# Shared secret that unlocks self-serve instructor role for the studio's
# real instructors. Keep server-side only; never expose to the client bundle.
INSTRUCTOR_CODE = os.environ.get("INSTRUCTOR_CODE", "").strip()

# ---------------- Push notifications (Emergent relay) ----------------
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
_push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)


async def send_push(recipients: List[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    # Chunk to 100
    for i in range(0, len(recipients), 100):
        chunk = recipients[i:i + 100]
        payload: dict = {"recipients": chunk, "data": data}
        if idempotency_key:
            payload["$idempotency_key"] = f"{idempotency_key}-{i}"
        resp = await _push_client.post("/api/v1/push/trigger", json=payload)
        if resp.status_code == 401:
            logger.warning("EMERGENT_PUSH_KEY missing or invalid — skipping push")
            return
        if resp.status_code >= 500:
            logger.warning(f"Push provider unavailable: {resp.status_code}")
            return
        try:
            resp.raise_for_status()
        except Exception as e:
            logger.warning(f"Push trigger error: {e}")


# ---------------- SMTP email helper ----------------
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587") or 587)
SMTP_USERNAME = os.environ.get("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.environ.get("SMTP_FROM", "").strip() or SMTP_USERNAME
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "").strip().rstrip("/")


def _smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD and SMTP_FROM)


async def send_email(to: str, subject: str, text: str, html: Optional[str] = None) -> bool:
    """Best-effort email send via SMTP with STARTTLS.
    Returns True on success. On failure (or when SMTP isn't configured yet),
    logs ONLY a correlation-id so ops can debug without leaking the email
    body (which for password resets includes the raw reset token)."""
    corr_id = _secrets_mod.token_urlsafe(6)
    if not _smtp_configured():
        logger.warning(
            "[EMAIL:UNCONFIGURED] cid=%s to=%s subject=%r "
            "(body suppressed — contains sensitive tokens; check SMTP_* env vars)",
            corr_id, to, subject,
        )
        return False
    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USERNAME,
            password=SMTP_PASSWORD,
            start_tls=True,
            timeout=15,
        )
        logger.info("[EMAIL:SENT] cid=%s to=%s subject=%r", corr_id, to, subject)
        return True
    except Exception as e:
        # NEVER log the body — password-reset emails carry a working token.
        logger.error(
            "[EMAIL:FAILED] cid=%s to=%s subject=%r err=%s",
            corr_id, to, subject, e,
        )
        return False


# ---------------- Password reset helpers ----------------
RESET_TOKEN_TTL_MIN = 15
RESET_RATE_LIMIT_PER_15MIN = 3


def _hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _ensure_reset_indexes() -> None:
    """TTL + lookup indexes for password_reset_tokens.
    Safe to call multiple times; Motor will no-op on duplicate index specs."""
    try:
        await db.password_reset_tokens.create_index("token_hash", unique=True)
        await db.password_reset_tokens.create_index(
            "expires_at", expireAfterSeconds=0
        )
        await db.password_reset_tokens.create_index("user_id")
    except Exception as e:
        logger.warning(f"reset indexes: {e}")


app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ---------------- Models ----------------
class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    is_admin: bool = False
    is_instructor: bool = False
    auth_provider: str = "email"


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    instructor_code: Optional[str] = None  # self-serve at signup if code matches


class SetInstructorIn(BaseModel):
    instructor_code: str  # server checks against INSTRUCTOR_CODE env


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionIn(BaseModel):
    session_id: str


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


class DanceIn(BaseModel):
    name: str
    choreographer: str
    choreographer_country: Optional[str] = ""
    song: str
    artist: Optional[str] = ""
    difficulty: str  # Beginner / Improver / Intermediate / Advanced
    bpm: Optional[int] = None
    count: Optional[str] = None  # e.g. "32 count, 4 wall"
    youtube_url: Optional[str] = ""
    step_sheet: Optional[str] = ""
    step_sheet_image: Optional[str] = ""  # base64 data URL
    description: Optional[str] = ""
    tags: Optional[List[str]] = []
    is_published: Optional[bool] = None  # None = keep existing / creation default


class DanceImportRow(BaseModel):
    name: str
    choreographer: Optional[str] = ""
    song: Optional[str] = ""
    artist: Optional[str] = ""
    difficulty: Optional[str] = "Beginner"
    bpm: Optional[int] = None
    count: Optional[str] = ""
    youtube_url: Optional[str] = ""
    step_sheet: Optional[str] = ""


class DanceImportBody(BaseModel):
    dances: List[DanceImportRow]
    publish_all: bool = False


class DanceOut(DanceIn):
    id: str
    created_at: str


class TrackingIn(BaseModel):
    status: str  # completed | wishlist
    rating: Optional[int] = 0  # 0..5
    notes: Optional[str] = ""


class TrackingOut(BaseModel):
    dance_id: str
    status: str
    rating: int
    notes: str
    updated_at: str


class ClassSessionIn(BaseModel):
    date: str  # YYYY-MM-DD
    session_label: Optional[str] = ""  # e.g. "Friday Night", "Beginner Class"
    dance_ids: List[str] = []
    notes: Optional[str] = ""
    flyer_image: Optional[str] = ""  # base64 data URL, senior instructors only


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str


class ChatMessageIn(BaseModel):
    message: str


class SuggestionIn(BaseModel):
    dance_name: str
    song: Optional[str] = ""
    artist: Optional[str] = ""
    difficulty: Optional[str] = ""
    youtube_url: Optional[str] = ""
    # Direct URL to the choreographer's official step sheet (CopperKnob,
    # BootStepper, choreographer's own site, etc.). We do not host copies.
    step_sheet_url: Optional[str] = ""
    # Optional user-uploaded photo of the step sheet, base64 data URL.
    # The user must confirm it's the choreographer's official sheet.
    step_sheet_image: Optional[str] = ""
    notes: Optional[str] = ""


# ---------------- Helpers ----------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


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


async def upsert_user(email: str, name: str, picture: str = "", provider: str = "email",
                      password_hash: Optional[str] = None) -> dict:
    """Return the user record. A synthetic `_is_new_user` bool is attached so
    callers can trigger first-time UX (e.g. the fireworks overlay on register /
    first Google login). The flag is NOT persisted to the DB."""
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
        user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(401, "User not found")
        return user

    # 2) Try JWT
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user = await db.users.find_one({"user_id": payload["user_id"]},
                                       {"_id": 0, "password_hash": 0})
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


def user_to_out(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "picture": u.get("picture", ""),
        "is_admin": bool(u.get("is_admin")),
        "is_instructor": bool(u.get("is_admin")) or bool(u.get("is_instructor")),
        "can_edit_step_sheets": user_can_edit_step_sheets(u),
        "auth_provider": u.get("auth_provider", "email"),
    }


def dance_to_out(d: dict, viewer_user_id: Optional[str] = None) -> dict:
    """Serialise a dance for API responses.

    `viewer_user_id`: when supplied, `created_by` (a user_id) is only echoed
    back to the owner themselves. All other callers see it as an empty
    string — this prevents leaking internal user_ids on the public feed
    (SEC-005). `created_by_name` (display name only) is always returned.
    """
    owner_id = d.get("created_by", "") or ""
    show_owner = bool(viewer_user_id and viewer_user_id == owner_id)
    return {
        "id": d["id"],
        "name": d.get("name", ""),
        "choreographer": d.get("choreographer", ""),
        "choreographer_country": d.get("choreographer_country", ""),
        "song": d.get("song", ""),
        "artist": d.get("artist", ""),
        "difficulty": d.get("difficulty", "Beginner"),
        "bpm": d.get("bpm"),
        "count": d.get("count", ""),
        "youtube_url": d.get("youtube_url", ""),
        "step_sheet": d.get("step_sheet", ""),
        "step_sheet_image": d.get("step_sheet_image", ""),
        "description": d.get("description", ""),
        "tags": d.get("tags", []),
        "is_published": bool(d.get("is_published", True)),
        "created_by": owner_id if show_owner else "",
        "created_by_name": d.get("created_by_name", ""),
        "created_at": d.get("created_at", ""),
    }


# ---------------- Auth Routes ----------------
def _instructor_code_ok(candidate: Optional[str]) -> bool:
    """Constant-time comparison against the server-side INSTRUCTOR_CODE."""
    if not candidate or not INSTRUCTOR_CODE:
        return False
    return hmac.compare_digest(candidate.strip(), INSTRUCTOR_CODE)


@api_router.post("/auth/register")
async def register(inp: RegisterIn, request: Request):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing and existing.get("password_hash"):
        raise HTTPException(400, "Email already registered")
    # Throttle instructor-code guessing during signup (per client IP)
    if inp.instructor_code:
        ip = _client_ip(request)
        allowed, retry = _throttle_check(
            f"code:{ip}", max_hits=5, window_sec=15 * 60,
        )
        if not allowed:
            raise HTTPException(
                429,
                f"Too many attempts — please wait {int(retry)}s and try again.",
            )
    user = await upsert_user(inp.email, inp.name, provider="email",
                             password_hash=hash_password(inp.password))
    # If they entered the studio's instructor code on signup, unlock the role.
    # (Admin/whitelist status set by upsert_user is preserved — we never demote.)
    if _instructor_code_ok(inp.instructor_code) and not user.get("is_instructor"):
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"is_instructor": True}},
        )
        user["is_instructor"] = True
        # Reset the throttle on success — good actors shouldn't be penalised
        _throttle_reset(f"code:{_client_ip(request)}")
    token = make_jwt(user["user_id"], pwd_ver=int(user.get("pwd_ver") or 0))
    return {
        "token": token,
        "user": user_to_out(user),
        "is_new_user": bool(user.get("_is_new_user")),
    }


@api_router.post("/auth/set-instructor")
async def set_instructor(
    inp: SetInstructorIn,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Self-serve instructor upgrade for signed-in users.
    Requires the shared instructor access code. Admins are always instructors."""
    # Per-user + per-IP throttle: 5 attempts / 15 min per user, 20 / 15 min per IP
    ip = _client_ip(request)
    for key, cap in [(f"code-user:{user['user_id']}", 5), (f"code-ip:{ip}", 20)]:
        allowed, retry = _throttle_check(key, max_hits=cap, window_sec=15 * 60)
        if not allowed:
            raise HTTPException(
                429,
                f"Too many attempts — please wait {int(retry)}s and try again.",
            )
    if not _instructor_code_ok(inp.instructor_code):
        # Small artificial delay to blunt brute-force attempts
        await bcrypt_dummy_delay()
        raise HTTPException(400, "Invalid access code")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"is_instructor": True}},
    )
    # Success — reset the per-user throttle so future legitimate uses are free
    _throttle_reset(f"code-user:{user['user_id']}")
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"ok": True, "user": user_to_out(fresh)}


@api_router.post("/auth/login")
async def login(inp: LoginIn, request: Request):
    ip = _client_ip(request)
    email = inp.email.lower()
    # Two-key throttle: per email (blocks account brute force) + per IP
    # (blocks credential stuffing across accounts).
    for key, cap in [(f"login:{email}", 10), (f"login-ip:{ip}", 40)]:
        allowed, retry = _throttle_check(key, max_hits=cap, window_sec=15 * 60)
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
    _throttle_reset(f"login:{email}")
    token = make_jwt(user["user_id"], pwd_ver=int(user.get("pwd_ver") or 0))
    return {"token": token, "user": user_to_out(user)}


@api_router.post("/auth/google-session")
async def google_session(inp: GoogleSessionIn):
    # Emergent-managed Google Auth session-exchange URL. Required from env so
    # no environment-specific URL is baked into source. In dev/preview this is
    # set in backend/.env; production overrides it in the deploy config.
    session_url = os.environ.get("EMERGENT_AUTH_SESSION_URL", "").strip()
    if not session_url:
        raise HTTPException(
            500,
            "Server misconfigured: EMERGENT_AUTH_SESSION_URL not set",
        )
    async with httpx.AsyncClient(timeout=15) as hc:
        r = await hc.get(
            session_url,
            headers={"X-Session-ID": inp.session_id},
        )
        if r.status_code != 200:
            raise HTTPException(401, "Invalid Google session")
        data = r.json()
    email = data.get("email", "").lower()
    if not email:
        raise HTTPException(401, "No email in session")
    user = await upsert_user(email, data.get("name", ""),
                             picture=data.get("picture", ""), provider="google")
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


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user_to_out(user)


# ---------------- Password Reset ----------------
@api_router.post("/auth/forgot-password")
async def forgot_password(inp: ForgotPasswordIn, request: Request):
    """Always returns 200 (no user-enumeration).
    If the email exists AND has a password (i.e. not a Google-only account) AND
    the caller has not exceeded 3 requests in the last 15 minutes, a reset link
    is emailed with a 15-minute single-use token."""
    email = inp.email.lower().strip()
    generic_ok = {"ok": True, "message": "If that email exists, a reset link has been sent."}

    # Per-IP throttle blocks fan-out attacks where one attacker fires reset
    # requests at many emails to spam users. Keeps the DB tidy too.
    ip = _client_ip(request)
    allowed, _retry = _throttle_check(
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
    token_hash = _hash_reset_token(raw)
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


async def bcrypt_dummy_delay() -> None:
    """Constant-time-ish delay to blunt user-enumeration timing attacks."""
    try:
        bcrypt.checkpw(b"x", bcrypt.hashpw(b"x", bcrypt.gensalt(rounds=8)))
    except Exception:
        pass


# ---------------- Rate limiting (per-key sliding-window) ----------------
# Simple in-process throttling — sufficient for a single-server MVP. Keys are
# lowercased strings like "login:jamin@example.com" or "code:<user_id>" or
# "forgot:jamin@example.com". If we ever scale to multiple backend workers,
# move this to Redis / mongo TTL.
_RATE_BUCKETS: dict[str, list[float]] = {}
_RATE_BUCKETS_MAX_KEYS = 5000  # cap memory


def _throttle_check(key: str, *, max_hits: int, window_sec: float) -> tuple[bool, float]:
    """Return (allowed, retry_after_seconds).

    Records a hit if allowed. If not allowed, returns the seconds until
    the oldest hit inside the window expires.
    """
    import time as _t
    now = _t.monotonic()
    hits = _RATE_BUCKETS.get(key, [])
    # Drop old hits outside the window
    hits = [t for t in hits if now - t < window_sec]
    if len(hits) >= max_hits:
        oldest = hits[0]
        retry_after = max(0.5, window_sec - (now - oldest))
        _RATE_BUCKETS[key] = hits  # keep pruned list
        return False, retry_after
    hits.append(now)
    # Evict oldest keys if the store is bloated
    if len(_RATE_BUCKETS) > _RATE_BUCKETS_MAX_KEYS:
        # Drop half of the oldest keys
        for k in list(_RATE_BUCKETS.keys())[: len(_RATE_BUCKETS) // 2]:
            _RATE_BUCKETS.pop(k, None)
    _RATE_BUCKETS[key] = hits
    return True, 0.0


def _throttle_reset(key: str) -> None:
    _RATE_BUCKETS.pop(key, None)


def _client_ip(request: Request) -> str:
    # Trust the first hop if X-Forwarded-For is set by the ingress (kubernetes
    # proxy sets it); otherwise fall back to peer.
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return getattr(request.client, "host", "") or "unknown"


@api_router.post("/auth/reset-password")
async def reset_password(inp: ResetPasswordIn):
    if len(inp.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    token_hash = _hash_reset_token(inp.token)
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


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@api_router.delete("/auth/me")
async def delete_my_account(user: dict = Depends(get_current_user)):
    """Permanently delete the caller's account and personal data.

    Required for App Store compliance (Apple Guideline 5.1.1(v)): users who can
    create an account in-app must be able to delete it in-app.

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


# ---------------- Dance Routes ----------------
@api_router.get("/dances")
async def list_dances(
    q: Optional[str] = None,
    difficulty: Optional[str] = None,
    scope: str = "public",  # public | mine | all
    authorization: Optional[str] = Header(None),
):
    """Public feed shows only published dances. `scope=mine` returns caller's dances
    (drafts + published). `scope=all` requires admin and returns everything."""
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
# `/app/backend/dance_blocklist.json` — names that must never be re-seeded.
# `/app/backend/backups/dances_before_prune.json` — the pre-prune snapshot.
# These MUST be registered BEFORE /dances/{dance_id} so the literal paths
# aren't shadowed by the parameterized route.

_BLOCKLIST_PATH = ROOT_DIR / "dance_blocklist.json"
_BACKUP_PATH = ROOT_DIR / "backups" / "dances_before_prune.json"


def _load_blocklist() -> list[str]:
    if not _BLOCKLIST_PATH.exists():
        return []
    try:
        import json as _json
        data = _json.loads(_BLOCKLIST_PATH.read_text())
        return list(data) if isinstance(data, list) else []
    except Exception:
        return []


def _save_blocklist(names: list[str]) -> None:
    import json as _json
    _BLOCKLIST_PATH.write_text(_json.dumps(sorted(set(names)), indent=2))


def _load_backup() -> list[dict]:
    if not _BACKUP_PATH.exists():
        return []
    try:
        import json as _json
        return _json.loads(_BACKUP_PATH.read_text())
    except Exception:
        return []


@api_router.get("/dances/removed")
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


@api_router.post("/dances/restore-by-name")
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


@api_router.get("/dances/{dance_id}")
async def get_dance(dance_id: str, authorization: Optional[str] = Header(None)):
    d = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    viewer_id: Optional[str] = None
    if authorization:
        try:
            _u = await get_current_user(authorization)
            viewer_id = _u["user_id"]
        except HTTPException:
            viewer_id = None
    return dance_to_out(d, viewer_id)


def youtube_search_url(query: str) -> str:
    q = "+".join(query.strip().split())
    return f"https://www.youtube.com/results?search_query={q}"


@api_router.post("/dances")
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
        doc["youtube_url"] = youtube_search_url(f"{doc['name']} {doc.get('choreographer','')} line dance")
    # New dances start as DRAFT unless publisher explicitly sets is_published True
    if doc.get("is_published") is None:
        doc["is_published"] = False
    await db.dances.insert_one(doc)
    doc.pop("_id", None)
    return dance_to_out(doc, user["user_id"])


@api_router.post("/dances/import")
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
        if difficulty not in ("Beginner", "Improver", "Intermediate", "Advanced"):
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


@api_router.put("/dances/{dance_id}")
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
    await db.dances.update_one({"id": dance_id}, {"$set": updates})
    d = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    return dance_to_out(d, user["user_id"])


@api_router.put("/dances/{dance_id}/publish")
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


@api_router.put("/dances/{dance_id}/unpublish")
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


@api_router.delete("/dances/{dance_id}")
async def delete_dance(dance_id: str, admin: dict = Depends(require_admin)):
    await db.dances.delete_one({"id": dance_id})
    return {"ok": True}


# (Restore endpoints moved above the parameterized routes — see /dances/removed
#  and /dances/restore-by-name near the top of the dances section.)


# ---------------- Instructor Chat ----------------
@api_router.get("/chat/messages")
async def list_chat(instructor: dict = Depends(require_instructor), limit: int = 200):
    docs = await db.instructor_messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(max(1, min(limit, 500)))
    return list(reversed(docs))  # oldest → newest


@api_router.post("/chat/messages")
async def post_chat(inp: ChatMessageIn, instructor: dict = Depends(require_instructor)):
    text = (inp.message or "").strip()
    if not text:
        raise HTTPException(400, "Empty message")
    doc = {
        "id": f"msg_{uuid.uuid4().hex[:10]}",
        "user_id": instructor["user_id"],
        "user_name": instructor.get("name", ""),
        "message": text[:2000],
        "created_at": now_iso(),
    }
    await db.instructor_messages.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/chat/messages/{msg_id}")
async def delete_chat(msg_id: str, instructor: dict = Depends(require_instructor)):
    doc = await db.instructor_messages.find_one({"id": msg_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if doc["user_id"] != instructor["user_id"] and not instructor.get("is_admin"):
        raise HTTPException(403, "Not allowed")
    await db.instructor_messages.delete_one({"id": msg_id})
    return {"ok": True}


# ---------------- Tracking Routes ----------------
@api_router.get("/tracking/me")
async def my_tracking(user: dict = Depends(get_current_user)):
    docs = await db.tracking.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(2000)
    return [
        {
            "dance_id": d["dance_id"],
            "status": d.get("status", "wishlist"),
            "rating": d.get("rating", 0),
            "notes": d.get("notes", ""),
            "updated_at": d.get("updated_at", ""),
        }
        for d in docs
    ]


@api_router.post("/tracking/{dance_id}")
async def upsert_tracking(dance_id: str, inp: TrackingIn, user: dict = Depends(get_current_user)):
    if inp.status not in ("completed", "wishlist"):
        raise HTTPException(400, "Invalid status")
    dance = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not dance:
        raise HTTPException(404, "Dance not found")
    payload = {
        "user_id": user["user_id"],
        "dance_id": dance_id,
        "status": inp.status,
        "rating": max(0, min(5, int(inp.rating or 0))),
        "notes": inp.notes or "",
        "updated_at": now_iso(),
    }
    await db.tracking.update_one(
        {"user_id": user["user_id"], "dance_id": dance_id},
        {"$set": payload},
        upsert=True,
    )
    return {
        "dance_id": dance_id,
        "status": payload["status"],
        "rating": payload["rating"],
        "notes": payload["notes"],
        "updated_at": payload["updated_at"],
    }


@api_router.delete("/tracking/{dance_id}")
async def delete_tracking(dance_id: str, user: dict = Depends(get_current_user)):
    await db.tracking.delete_one({"user_id": user["user_id"], "dance_id": dance_id})
    return {"ok": True}


# ---------------- Suggestions Routes ----------------
# Per-user daily quotas — prevents any signed-in user from filling the DB
# with base64 uploads (SEC-003). Well above what any real user would submit.
SUGGESTION_QUOTA_PER_DAY = 15         # total suggestions per user per 24h
SUGGESTION_IMAGE_QUOTA_PER_DAY = 8    # of which at most 8 may carry images


@api_router.post("/suggestions")
async def submit_suggestion(inp: SuggestionIn, user: dict = Depends(get_current_user)):
    if not inp.dance_name or not inp.dance_name.strip():
        raise HTTPException(400, "Dance name is required")

    # Sanitise / cap the base64 image so a single suggestion can't OOM the DB.
    img = (inp.step_sheet_image or "").strip()
    if img and len(img) > 6_000_000:
        raise HTTPException(413, "Step sheet image is too large — please pick a smaller file.")

    # Per-user daily quota (24-hour rolling window)
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    total_today = await db.suggestions.count_documents({
        "user_id": user["user_id"],
        "created_at": {"$gte": since},
    })
    if total_today >= SUGGESTION_QUOTA_PER_DAY:
        raise HTTPException(
            429,
            f"You've reached the daily limit of {SUGGESTION_QUOTA_PER_DAY} "
            "suggestions. Please try again tomorrow.",
        )
    if img:
        images_today = await db.suggestions.count_documents({
            "user_id": user["user_id"],
            "created_at": {"$gte": since},
            "step_sheet_image": {"$ne": ""},
        })
        if images_today >= SUGGESTION_IMAGE_QUOTA_PER_DAY:
            raise HTTPException(
                429,
                f"You've reached the daily limit of "
                f"{SUGGESTION_IMAGE_QUOTA_PER_DAY} suggestions with attached "
                "photos. Send more tomorrow, or submit without a photo.",
            )

    doc = {
        "id": f"sug_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "user_name": user.get("name", ""),
        "user_email": user.get("email", ""),
        "dance_name": inp.dance_name.strip(),
        "song": (inp.song or "").strip(),
        "artist": (inp.artist or "").strip(),
        "difficulty": (inp.difficulty or "").strip(),
        "youtube_url": (inp.youtube_url or "").strip(),
        "step_sheet_url": (inp.step_sheet_url or "").strip(),
        "step_sheet_image": img,
        "notes": (inp.notes or "").strip(),
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.suggestions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/suggestions/mine")
async def my_suggestions(user: dict = Depends(get_current_user)):
    docs = await db.suggestions.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return docs


@api_router.get("/suggestions")
async def list_suggestions(reviewer: dict = Depends(require_admin_or_editor)):
    docs = await db.suggestions.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api_router.put("/suggestions/{sug_id}/status")
async def update_suggestion_status(
    sug_id: str, status: str, reviewer: dict = Depends(require_admin_or_editor)
):
    if status not in ("pending", "reviewed", "queued", "declined"):
        raise HTTPException(400, "Invalid status")
    await db.suggestions.update_one({"id": sug_id}, {"$set": {"status": status}})
    d = await db.suggestions.find_one({"id": sug_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    return d


@api_router.delete("/suggestions/{sug_id}")
async def delete_suggestion(sug_id: str, user: dict = Depends(get_current_user)):
    # Owner can delete their own; admin can delete any
    doc = await db.suggestions.find_one({"id": sug_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if doc["user_id"] != user["user_id"] and not user.get("is_admin"):
        raise HTTPException(403, "Not allowed")
    await db.suggestions.delete_one({"id": sug_id})
    return {"ok": True}


# ---------------- Classes / Instructor Log ----------------
@api_router.get("/classes")
async def list_classes(scope: str = "all", limit: int = 100):
    query: dict = {}
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if scope == "upcoming":
        query["date"] = {"$gte": today}
    elif scope == "past":
        query["date"] = {"$lt": today}
    sort_dir = 1 if scope == "upcoming" else -1
    docs = (
        await db.classes.find(query, {"_id": 0})
        .sort("date", sort_dir)
        .to_list(max(1, min(limit, 500)))
    )
    return docs


@api_router.get("/classes/{class_id}")
async def get_class(class_id: str):
    doc = await db.classes.find_one({"id": class_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@api_router.post("/classes")
async def create_class(inp: ClassSessionIn, instructor: dict = Depends(require_instructor)):
    if not inp.date:
        raise HTTPException(400, "Date is required")
    # Resolve dance names for display
    dance_docs = await db.dances.find(
        {"id": {"$in": inp.dance_ids}}, {"_id": 0}
    ).to_list(500)
    by_id = {d["id"]: d for d in dance_docs}
    resolved = [
        {
            "id": did,
            "name": by_id[did]["name"] if did in by_id else "(removed)",
            "difficulty": by_id[did].get("difficulty", "") if did in by_id else "",
        }
        for did in inp.dance_ids
    ]
    doc = {
        "id": f"class_{uuid.uuid4().hex[:10]}",
        "date": inp.date,
        "session_label": (inp.session_label or "").strip(),
        "notes": (inp.notes or "").strip(),
        "instructor_id": instructor["user_id"],
        "instructor_name": instructor.get("name", ""),
        "dance_ids": inp.dance_ids,
        "dances": resolved,
        # Flyer image: senior-instructor whitelist only. Silently blanked
        # for anyone else so the payload isn't rejected.
        "flyer_image": (inp.flyer_image or "").strip() if user_can_edit_step_sheets(instructor) else "",
        "created_at": now_iso(),
    }
    await db.classes.insert_one(doc)
    doc.pop("_id", None)

    # Fire push to all registered users if this is an upcoming class
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if inp.date >= today:
        try:
            all_users = await db.users.find({}, {"_id": 0, "user_id": 1}).to_list(5000)
            recipients = [u["user_id"] for u in all_users]
            label = doc["session_label"] or "New class"
            dance_names = ", ".join([r["name"] for r in resolved[:3]])
            more = f" +{len(resolved) - 3} more" if len(resolved) > 3 else ""
            await send_push(
                recipients=recipients,
                data={
                    "title": f"{label} · {inp.date}",
                    "message": (f"{instructor.get('name', 'An instructor')} added a new class. "
                                f"Dances: {dance_names}{more}"),
                    "action_url": f"/classes",
                },
                idempotency_key=f"class-{doc['id']}",
            )
        except Exception as e:
            logger.warning(f"Push failed (non-blocking): {e}")

    return doc


@api_router.put("/classes/{class_id}")
async def update_class(class_id: str, inp: ClassSessionIn, user: dict = Depends(get_current_user)):
    doc = await db.classes.find_one({"id": class_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    # Owner, admin, or a whitelisted editor (Erin/Jamin) may edit any class
    is_owner = doc["instructor_id"] == user["user_id"]
    if not (is_owner or user.get("is_admin") or user_can_edit_step_sheets(user)):
        raise HTTPException(403, "Not allowed")
    dance_docs = await db.dances.find(
        {"id": {"$in": inp.dance_ids}}, {"_id": 0}
    ).to_list(500)
    by_id = {d["id"]: d for d in dance_docs}
    resolved = [
        {
            "id": did,
            "name": by_id[did]["name"] if did in by_id else "(removed)",
            "difficulty": by_id[did].get("difficulty", "") if did in by_id else "",
        }
        for did in inp.dance_ids
    ]
    updates = {
        "date": inp.date,
        "session_label": (inp.session_label or "").strip(),
        "notes": (inp.notes or "").strip(),
        "dance_ids": inp.dance_ids,
        "dances": resolved,
    }
    # Flyer image: whitelist-only writes. If a non-editor tries to change it,
    # 403 out to signal the UI shouldn't have surfaced the field.
    can_edit_flyer = user_can_edit_step_sheets(user)
    incoming_flyer = (inp.flyer_image or "").strip()
    prev_flyer = (doc.get("flyer_image") or "").strip()
    if incoming_flyer != prev_flyer:
        if not can_edit_flyer:
            raise HTTPException(403, "Only Erin or Jamin can upload class flyers")
        updates["flyer_image"] = incoming_flyer
    await db.classes.update_one({"id": class_id}, {"$set": updates})
    return {**doc, **updates}


@api_router.delete("/classes/{class_id}")
async def delete_class(class_id: str, user: dict = Depends(get_current_user)):
    doc = await db.classes.find_one({"id": class_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    # Owner, admin, or a whitelisted editor (Erin/Jamin) may delete any class
    is_owner = doc["instructor_id"] == user["user_id"]
    if not (is_owner or user.get("is_admin") or user_can_edit_step_sheets(user)):
        raise HTTPException(403, "Not allowed")
    await db.classes.delete_one({"id": class_id})
    await db.attendance.delete_many({"class_id": class_id})
    return {"ok": True}


# ---------------- Attendance ----------------
@api_router.post("/classes/{class_id}/attend")
async def mark_attended(class_id: str, user: dict = Depends(get_current_user)):
    klass = await db.classes.find_one({"id": class_id}, {"_id": 0})
    if not klass:
        raise HTTPException(404, "Class not found")
    await db.attendance.update_one(
        {"user_id": user["user_id"], "class_id": class_id},
        {
            "$set": {
                "user_id": user["user_id"],
                "user_name": user.get("name", ""),
                "class_id": class_id,
                "class_date": klass.get("date", ""),
                "class_label": klass.get("session_label", ""),
                "marked_at": now_iso(),
            }
        },
        upsert=True,
    )
    return {"ok": True, "attended": True}


@api_router.delete("/classes/{class_id}/attend")
async def unmark_attended(class_id: str, user: dict = Depends(get_current_user)):
    await db.attendance.delete_one({"user_id": user["user_id"], "class_id": class_id})
    return {"ok": True, "attended": False}


@api_router.get("/attendance/me")
async def my_attendance(user: dict = Depends(get_current_user)):
    """Return list of class objects the user attended, plus a simple set of class IDs."""
    rows = await db.attendance.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("class_date", -1).to_list(500)
    ids = [r["class_id"] for r in rows]
    classes = await db.classes.find(
        {"id": {"$in": ids}}, {"_id": 0}
    ).to_list(500)
    by_id = {c["id"]: c for c in classes}
    combined = [by_id[i] for i in ids if i in by_id]
    return {"class_ids": ids, "classes": combined}


# ---------------- Push registration ----------------
@api_router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody, user: dict = Depends(get_current_user)):
    # Ignore any client-supplied user_id — bind to the authenticated caller.
    payload = body.model_dump()
    payload["user_id"] = user["user_id"]
    try:
        resp = await _push_client.post(
            "/api/v1/push/users/register", json=payload
        )
    except Exception as e:
        logger.warning(f"Push register upstream unreachable: {e}")
        raise HTTPException(502, "Push provider unavailable")
    if resp.status_code == 401:
        # Do not leak upstream config state to the client.
        logger.error("Push relay returned 401 — EMERGENT_PUSH_KEY missing or invalid")
        raise HTTPException(502, "Push provider unavailable")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}


# ---------------- Scheduled reminders ----------------
scheduler = AsyncIOScheduler(timezone="UTC")


async def send_24h_class_reminders():
    """Runs hourly. Pushes a heads-up to attendees whose 'I was there' record
    is on a class dated tomorrow. Uses per-class idempotency to avoid duplicates.
    """
    try:
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
        upcoming = await db.classes.find(
            {"date": tomorrow}, {"_id": 0}
        ).to_list(500)
        for klass in upcoming:
            # Attendees who "signed up" (marked they'll be there)
            atts = await db.attendance.find(
                {"class_id": klass["id"]}, {"_id": 0, "user_id": 1}
            ).to_list(2000)
            recipients = [a["user_id"] for a in atts]
            if not recipients:
                continue

            # Have we already sent this reminder?
            key = f"reminder-24h-{klass['id']}"
            already = await db.sent_reminders.find_one({"key": key})
            if already:
                continue

            label = klass.get("session_label") or "Line dance class"
            dance_names = ", ".join([d["name"] for d in klass.get("dances", [])[:3]])
            more = f" +{len(klass.get('dances', [])) - 3} more" if len(klass.get("dances", [])) > 3 else ""
            try:
                await send_push(
                    recipients=recipients,
                    data={
                        "title": f"Tomorrow: {label}",
                        "message": (f"See you at {klass.get('date')}! "
                                    f"Dances: {dance_names}{more}"),
                        "action_url": "/classes",
                    },
                    idempotency_key=key,
                )
                await db.sent_reminders.insert_one({
                    "key": key,
                    "class_id": klass["id"],
                    "sent_at": now_iso(),
                    "recipient_count": len(recipients),
                })
                logger.info(f"Sent 24h reminder for class {klass['id']} to {len(recipients)} attendees")
            except Exception as e:
                logger.warning(f"Reminder push failed for {klass['id']}: {e}")
    except Exception as e:
        logger.exception(f"send_24h_class_reminders crashed: {e}")


# ---------------- Venue Info ----------------
@api_router.get("/venue")
async def venue_info():
    return {
        "name": "Stompin' Ground Yuma",
        "tagline": "Yuma's home for country line dancing — all ages welcome!",
        "city": "Yuma, Arizona",
        "about": ("Stompin' Ground Yuma is a friendly community where dancers of every "
                  "age and skill level come together to learn, laugh, and boot-scoot the "
                  "night away. Grab your boots and let's dance."),
        "instructor": {
            "name": "Erin Brown",
            "role": "Line Dance Instructor",
        },
        "contact": {
            "phone": "",
            "email": "",
            "address": "Yuma, AZ",
        },
    }


@api_router.get("/")
async def root():
    return {"message": "Stompin' Ground Yuma API"}


# ---------------- Seed ----------------
from seed_dances import SEED_DANCES  # noqa: E402


@app.on_event("startup")
async def startup():
    # Indexes
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.dances.create_index("name")
        await db.tracking.create_index([("user_id", 1), ("dance_id", 1)], unique=True)
        await db.classes.create_index("date")
        await db.attendance.create_index([("user_id", 1), ("class_id", 1)], unique=True)
        await db.sent_reminders.create_index("key", unique=True)
        await db.instructor_messages.create_index("created_at")
    except Exception as e:
        logger.warning(f"Index issue: {e}")

    # Password reset indexes (idempotent)
    await _ensure_reset_indexes()

    # Backfill choreographer_country on existing docs (idempotent).
    # Step sheets are no longer seeded from source data — the app links out to
    # the choreographer's page on CopperKnob / BootStepper instead (copyright
    # safety + always-current step sheets).
    seed_by_name = {d[0]: d for d in SEED_DANCES}
    async for existing in db.dances.find({}, {"_id": 0}):
        updates = {}
        if not existing.get("choreographer_country"):
            seed = seed_by_name.get(existing["name"])
            if seed:
                _, _, country, _, _, _, _, _, _, _ = seed
                updates["choreographer_country"] = country
        # Any existing dance without is_published is a seed dance → publish it
        if "is_published" not in existing:
            updates["is_published"] = True
        if updates:
            await db.dances.update_one({"id": existing["id"]}, {"$set": updates})

    # Seed dances if empty; otherwise add any new dances not yet present.
    # A blocklist (dance_blocklist.json) lets us permanently exclude names
    # that were verified as inaccurate — restarting the backend won't undo
    # a manual cleanup.
    blocklist: set[str] = set()
    try:
        _bl_path = ROOT_DIR / "dance_blocklist.json"
        if _bl_path.exists():
            import json as _json
            blocklist = set(_json.loads(_bl_path.read_text()))
            logger.info(f"Loaded {len(blocklist)} entries from dance_blocklist.json")
    except Exception as _e:
        logger.warning(f"Could not read dance_blocklist.json: {_e}")

    existing_names = {d["name"] async for d in db.dances.find({}, {"name": 1})}
    to_insert = []
    for (name, chor, country, song, artist, diff, bpm, cnt, yt, _step) in SEED_DANCES:
        if name in existing_names or name in blocklist:
            continue
        to_insert.append({
            "id": f"dance_{uuid.uuid4().hex[:10]}",
            "name": name,
            "choreographer": chor,
            "choreographer_country": country,
            "song": song,
            "artist": artist,
            "difficulty": diff,
            "bpm": bpm,
            "count": cnt,
            "youtube_url": f"https://www.youtube.com/results?search_query={yt.replace(' ', '+')}",
            # No step sheet content — the app links out to CopperKnob / BootStepper
            "step_sheet": "",
            "step_sheet_image": "",
            "description": "",
            "tags": [],
            "is_published": True,
            "created_by": "",
            "created_by_name": "Stompin' Ground Yuma",
            "created_at": now_iso(),
        })
    if to_insert:
        await db.dances.insert_many(to_insert)
        logger.info(f"Seeded {len(to_insert)} new dances")

    # ------------------------------------------------------------------
    # Account seeding (safe)
    # ------------------------------------------------------------------
    # No passwords are hard-coded here. For each seeded email:
    #   - If the account already has a password_hash, DO NOT touch it.
    #   - If it doesn't, use a password from env `SEED_PW_<email-safe>` or
    #     generate a random one-time password and log it ONCE so the operator
    #     can hand it to the owner. The user should reset on first login.
    # Email keys for env lookup: replace @ and . with _  (upper-cased).
    import secrets as _secrets

    def _env_password_for(email: str) -> Optional[str]:
        key = "SEED_PW_" + email.replace("@", "_").replace(".", "_").upper()
        val = os.environ.get(key, "").strip()
        return val or None

    async def _seed_account(email: str, display: str, want_admin: bool, want_instructor: bool):
        env_pw = _env_password_for(email)
        existing = await db.users.find_one({"email": email})
        if existing:
            updates = {}
            if want_admin and not existing.get("is_admin"):
                updates["is_admin"] = True
            if want_instructor and not existing.get("is_instructor"):
                updates["is_instructor"] = True
            # If an operator has explicitly pinned a SEED_PW_* env var for this
            # account, always keep the on-disk hash in sync with it. This lets
            # /app/memory/test_credentials.md be the single source of truth in
            # dev/preview and never drift from what's actually stored.
            needs_hash = not existing.get("password_hash")
            if needs_hash or env_pw:
                pw = env_pw or _secrets.token_urlsafe(12)
                # Skip the rehash if the hash already matches the env pw
                if not (env_pw and existing.get("password_hash") and
                        verify_password(env_pw, existing["password_hash"])):
                    updates["password_hash"] = hash_password(pw)
                    if not env_pw:
                        logger.warning(
                            "One-time password generated for %s: %s "
                            "(share securely, force reset on first login)",
                            email, pw,
                        )
            if not existing.get("name") and display:
                updates["name"] = display
            if updates:
                await db.users.update_one({"email": email}, {"$set": updates})
            return
        # No existing record -> create one
        pw = env_pw or _secrets.token_urlsafe(12)
        if not env_pw:
            logger.warning(
                "One-time password generated for %s: %s "
                "(share securely, force reset on first login)",
                email, pw,
            )
        await upsert_user(email, display, provider="email", password_hash=hash_password(pw))
        # upsert_user already applies admin/instructor flags based on env lists;
        # nothing more to do here.

    seed_display_names = {
        "admin@stompinground.com": "Stompin' Admin",
        "erinboroughs@gmail.com": "Erin Brown",
        "luvtowork247@yahoo.com": "Jamin Brown",
    }

    for admin_email in ADMIN_EMAILS:
        await _seed_account(
            admin_email,
            seed_display_names.get(admin_email, admin_email.split("@")[0]),
            want_admin=True,
            want_instructor=True,
        )

    for inst_email in INSTRUCTOR_EMAILS:
        if inst_email in ADMIN_EMAILS:
            continue
        await _seed_account(
            inst_email,
            seed_display_names.get(inst_email, inst_email.split("@")[0]),
            want_admin=False,
            want_instructor=True,
        )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def start_scheduler():
    # Hourly reminder job. Also run once on boot to catch any missed hour.
    try:
        scheduler.add_job(
            send_24h_class_reminders,
            "interval",
            hours=1,
            id="class_24h_reminders",
            replace_existing=True,
            next_run_time=datetime.now(timezone.utc) + timedelta(seconds=30),
        )
        if not scheduler.running:
            scheduler.start()
        logger.info("Reminder scheduler started (hourly)")
    except Exception as e:
        logger.warning(f"Could not start scheduler: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    try:
        if scheduler.running:
            scheduler.shutdown(wait=False)
    except Exception:
        pass
    client.close()
