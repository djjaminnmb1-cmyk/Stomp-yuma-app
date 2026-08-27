"""Central config module.

Loads env vars from `backend/.env` on first import and exposes typed
constants used throughout the app. Every other module (routes/, services/,
core/*) should import from this module rather than reading ``os.environ``
directly — that way there's a single choke point that validates critical
values (like a strong `JWT_SECRET`) at startup.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# `core/config.py` is at /app/backend/core/config.py — go up one to /app/backend
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")

# ---------------- Mongo ----------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# ---------------- JWT ----------------
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

# ---------------- Roles ----------------
ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.environ.get(
        "ADMIN_EMAILS",
        "admin@stompinground.com,erinboroughs@gmail.com,luvtowork247@yahoo.com",
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
# Stricter privilege than general "instructor" (which is code-gated).
STEP_SHEET_EDITOR_EMAILS = {
    e.strip().lower()
    for e in os.environ.get(
        "STEP_SHEET_EDITOR_EMAILS",
        "erinboroughs@gmail.com,luvtowork247@yahoo.com",
    ).split(",")
    if e.strip()
}
# Shared secret that unlocks self-serve instructor role.
INSTRUCTOR_CODE = os.environ.get("INSTRUCTOR_CODE", "").strip()

# ---------------- Push (Emergent relay) ----------------
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")

# ---------------- SMTP email ----------------
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587") or 587)
SMTP_USERNAME = os.environ.get("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.environ.get("SMTP_FROM", "").strip() or SMTP_USERNAME
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "").strip().rstrip("/")

# ---------------- Password reset ----------------
RESET_TOKEN_TTL_MIN = 15
RESET_RATE_LIMIT_PER_15MIN = 3

# ---------------- Suggestion quotas ----------------
SUGGESTION_QUOTA_PER_DAY = 15
SUGGESTION_IMAGE_QUOTA_PER_DAY = 8

# ---------------- Emergent Google Auth ----------------
EMERGENT_AUTH_SESSION_URL = os.environ.get("EMERGENT_AUTH_SESSION_URL", "").strip()
