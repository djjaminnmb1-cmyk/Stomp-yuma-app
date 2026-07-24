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
    Returns True on success. On failure (or when SMTP isn't configured yet), logs
    the message body so the operator can inspect the reset link during setup."""
    if not _smtp_configured():
        logger.warning(
            "[EMAIL:UNCONFIGURED] to=%s subject=%r\n%s",
            to, subject, text,
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
        logger.info("[EMAIL:SENT] to=%s subject=%r", to, subject)
        return True
    except Exception as e:
        logger.error(
            "[EMAIL:FAILED] to=%s subject=%r err=%s\n(body follows so ops can act):\n%s",
            to, subject, e, text,
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


def make_jwt(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
        "iat": datetime.now(timezone.utc),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def upsert_user(email: str, name: str, picture: str = "", provider: str = "email",
                      password_hash: Optional[str] = None) -> dict:
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


def user_to_out(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "picture": u.get("picture", ""),
        "is_admin": bool(u.get("is_admin")),
        "is_instructor": bool(u.get("is_admin")) or bool(u.get("is_instructor")),
        "auth_provider": u.get("auth_provider", "email"),
    }


def dance_to_out(d: dict) -> dict:
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
        "created_by": d.get("created_by", ""),
        "created_by_name": d.get("created_by_name", ""),
        "created_at": d.get("created_at", ""),
    }


# ---------------- Auth Routes ----------------
@api_router.post("/auth/register")
async def register(inp: RegisterIn):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing and existing.get("password_hash"):
        raise HTTPException(400, "Email already registered")
    user = await upsert_user(inp.email, inp.name, provider="email",
                             password_hash=hash_password(inp.password))
    token = make_jwt(user["user_id"])
    return {"token": token, "user": user_to_out(user)}


@api_router.post("/auth/login")
async def login(inp: LoginIn):
    user = await db.users.find_one({"email": inp.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(401, "Invalid credentials")
    if not verify_password(inp.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = make_jwt(user["user_id"])
    return {"token": token, "user": user_to_out(user)}


@api_router.post("/auth/google-session")
async def google_session(inp: GoogleSessionIn):
    async with httpx.AsyncClient(timeout=15) as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
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
    session_token = data.get("session_token")
    if session_token:
        await db.user_sessions.insert_one({
            "session_token": session_token,
            "user_id": user["user_id"],
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        })
        return {"token": session_token, "user": user_to_out(user)}
    # Fallback JWT
    return {"token": make_jwt(user["user_id"]), "user": user_to_out(user)}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user_to_out(user)


# ---------------- Password Reset ----------------
@api_router.post("/auth/forgot-password")
async def forgot_password(inp: ForgotPasswordIn):
    """Always returns 200 (no user-enumeration).
    If the email exists AND has a password (i.e. not a Google-only account) AND
    the caller has not exceeded 3 requests in the last 15 minutes, a reset link
    is emailed with a 15-minute single-use token."""
    email = inp.email.lower().strip()
    generic_ok = {"ok": True, "message": "If that email exists, a reset link has been sent."}

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

    base = APP_PUBLIC_URL or "https://stompin-yuma-app.preview.emergentagent.com"
    reset_url = f"{base}/reset-password?token={raw}"
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
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"password_hash": new_hash}})
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

    if scope in ("mine", "all"):
        user = await get_current_user(authorization)
        if scope == "mine":
            query["created_by"] = user["user_id"]
        elif scope == "all" and not user.get("is_admin"):
            raise HTTPException(403, "Admin only")
    else:
        query["is_published"] = True

    docs = await db.dances.find(query, {"_id": 0}).sort("name", 1).to_list(2000)
    return [dance_to_out(d) for d in docs]


@api_router.get("/dances/{dance_id}")
async def get_dance(dance_id: str):
    d = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    return dance_to_out(d)


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
    if not (doc.get("youtube_url") or "").strip():
        doc["youtube_url"] = youtube_search_url(f"{doc['name']} {doc.get('choreographer','')} line dance")
    # New dances start as DRAFT unless publisher explicitly sets is_published True
    if doc.get("is_published") is None:
        doc["is_published"] = False
    await db.dances.insert_one(doc)
    doc.pop("_id", None)
    return dance_to_out(doc)


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
            "step_sheet": (row.step_sheet or "").strip(),
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
    # Only owner or admin can update
    owner_id = existing.get("created_by")
    if owner_id and owner_id != user["user_id"] and not user.get("is_admin"):
        raise HTTPException(403, "Not allowed")
    updates = inp.dict()
    if updates.get("is_published") is None:
        updates["is_published"] = existing.get("is_published", True)
    await db.dances.update_one({"id": dance_id}, {"$set": updates})
    d = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    return dance_to_out(d)


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
    return dance_to_out(d)


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
    return dance_to_out(d)


@api_router.delete("/dances/{dance_id}")
async def delete_dance(dance_id: str, admin: dict = Depends(require_admin)):
    await db.dances.delete_one({"id": dance_id})
    return {"ok": True}


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
@api_router.post("/suggestions")
async def submit_suggestion(inp: SuggestionIn, user: dict = Depends(get_current_user)):
    if not inp.dance_name or not inp.dance_name.strip():
        raise HTTPException(400, "Dance name is required")
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
async def list_suggestions(admin: dict = Depends(require_admin)):
    docs = await db.suggestions.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api_router.put("/suggestions/{sug_id}/status")
async def update_suggestion_status(
    sug_id: str, status: str, admin: dict = Depends(require_admin)
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
    if doc["instructor_id"] != user["user_id"] and not user.get("is_admin"):
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
    await db.classes.update_one({"id": class_id}, {"$set": updates})
    return {**doc, **updates}


@api_router.delete("/classes/{class_id}")
async def delete_class(class_id: str, user: dict = Depends(get_current_user)):
    doc = await db.classes.find_one({"id": class_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if doc["instructor_id"] != user["user_id"] and not user.get("is_admin"):
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

    # Backfill step_sheet & choreographer_country on existing docs (idempotent)
    seed_by_name = {d[0]: d for d in SEED_DANCES}
    async for existing in db.dances.find({}, {"_id": 0}):
        updates = {}
        if not existing.get("step_sheet") or not existing.get("choreographer_country"):
            seed = seed_by_name.get(existing["name"])
            if seed:
                _, _, country, _, _, _, _, _, _, step_sheet = seed
                if not existing.get("step_sheet"):
                    updates["step_sheet"] = step_sheet
                if not existing.get("choreographer_country"):
                    updates["choreographer_country"] = country
        # Any existing dance without is_published is a seed dance → publish it
        if "is_published" not in existing:
            updates["is_published"] = True
        if updates:
            await db.dances.update_one({"id": existing["id"]}, {"$set": updates})

    # Seed dances if empty; otherwise add any new dances not yet present.
    existing_names = {d["name"] async for d in db.dances.find({}, {"name": 1})}
    to_insert = []
    for (name, chor, country, song, artist, diff, bpm, cnt, yt, step) in SEED_DANCES:
        if name in existing_names:
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
            "step_sheet": step,
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
        existing = await db.users.find_one({"email": email})
        if existing:
            updates = {}
            if want_admin and not existing.get("is_admin"):
                updates["is_admin"] = True
            if want_instructor and not existing.get("is_instructor"):
                updates["is_instructor"] = True
            if not existing.get("password_hash"):
                pw = _env_password_for(email) or _secrets.token_urlsafe(12)
                updates["password_hash"] = hash_password(pw)
                if not _env_password_for(email):
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
        pw = _env_password_for(email) or _secrets.token_urlsafe(12)
        if not _env_password_for(email):
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
