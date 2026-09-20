"""Apple App Review 1.2 UGC — reviewer account + demo content seed.

Called from ``services/startup.run_startup`` so a fresh backend boot on
production always has the two reviewer accounts + the pinned demo
chat message Apple's reviewer needs to run the demos in
``/app/APPLE_REVIEW_NOTES.md``.

Idempotent: safe to run every boot. Passwords are RE-APPLIED on every
boot (unlike the general operator-account seed in ``startup.py``)
because these are demo credentials Apple must be able to log in with
regardless of any manual rotation — an operator who rotates them
would immediately fail the App Review demo.

CREDENTIALS
-----------
Passwords are read from environment variables — never hard-coded here.
Set the following in ``backend/.env`` (or the equivalent secret store
on prod) to enable the seed. If any of them is unset the corresponding
account is silently skipped so a misconfigured deploy never blocks
boot:

    SEED_PW_REVIEWER_STOMPINGROUND_COM
    SEED_PW_ADMINREVIEW_STOMPINGROUND_COM
    SEED_PW_SAMPLECONTENT_STOMPINGROUND_COM

Values must MATCH the passwords documented in
``/app/APPLE_REVIEW_NOTES.md`` verbatim so Apple's reviewer can log in.

REMOVING THIS AFTER APPLE APPROVES
----------------------------------
Once App Review clears the build:
  1. Delete the ``await seed_apple_review_accounts()`` line from
     ``services/startup.run_startup``.
  2. Delete the three ``SEED_PW_*STOMPINGROUND_COM`` lines from
     ``backend/.env``.
  3. Delete the three reviewer accounts (``reviewer@``, ``adminreview@``,
     ``samplecontent@stompinground.com``) from the production
     ``users`` collection.
  4. Delete the demo chat message (``id = msg_apple_review_demo``) from
     ``instructor_messages``.
  5. Optionally remove this file.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone

from core.database import db
from core.security import hash_password
from core.terms import TERMS_VERSION

logger = logging.getLogger(__name__)

# Reviewer identity — emails / display names / roles can safely live in
# source (they're not secrets and Apple's reviewer needs to see them
# documented). Passwords are pulled from env — see docstring above.
REVIEWER_EMAIL = "reviewer@stompinground.com"
ADMIN_REVIEWER_EMAIL = "adminreview@stompinground.com"
SAMPLE_USER_EMAIL = "samplecontent@stompinground.com"

# The reviewer's terms are pinned to a stale value so Demo 1B (the
# "existing user hits the Updated Terms gate") demo is reproducible
# without a fresh account. Any value that is NOT the current
# ``TERMS_VERSION`` will do — we use an ISO date so it's obvious.
STALE_TERMS_VERSION = "2025-01-01"

DEMO_MESSAGE_ID = "msg_apple_review_demo"
DEMO_MESSAGE_TEXT = (
    "This is sample content for App Review — long-press me to Report or "
    "Block. (Seeded via services/apple_review_seed.py)"
)


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _env_password_for(email: str) -> str:
    """Env-var lookup — same convention as ``services/startup._seed_account``.

    e.g. ``reviewer@stompinground.com`` → ``SEED_PW_REVIEWER_STOMPINGROUND_COM``.
    Returns an empty string when the env var is unset, so callers can
    branch on truthiness to skip seeding cleanly.
    """
    key = (
        "SEED_PW_"
        + email.replace("@", "_").replace(".", "_").replace("-", "_").upper()
    )
    return (os.environ.get(key) or "").strip()


async def _upsert_reviewer_account(
    *,
    email: str,
    password: str,
    name: str,
    is_admin: bool,
    is_instructor: bool,
    accepted_terms_version: str,
) -> str:
    """Upsert a reviewer account.

    Unlike the operator-account seed in ``services/startup.py`` this
    ALWAYS re-applies the password — these are demo credentials Apple
    must be able to log in with regardless of any manual rotation.
    """
    email_lc = email.lower()
    now = _iso()
    existing = await db.users.find_one({"email": email_lc}, {"_id": 0})
    payload = {
        "name": name,
        "password_hash": hash_password(password),
        "is_admin": is_admin,
        "is_instructor": is_instructor,
        "auth_provider": "email",
        "accepted_terms_version": accepted_terms_version,
        "accepted_terms_at": (
            now if accepted_terms_version and accepted_terms_version != STALE_TERMS_VERSION else ""
        ),
        # Ensure the account isn't in a suspended/banned state left
        # over from a previous demo run.
        "is_suspended": False,
        "suspend_until": "",
        "is_banned": False,
        "moderation_reason": "",
        # Reset pwd_ver so any old tokens issued to a previous password
        # are immediately invalidated on re-seed. (Login always issues
        # fresh JWTs so this is a belt-and-suspenders.)
        "pwd_ver": int((existing or {}).get("pwd_ver") or 0) + 1,
    }
    if existing:
        await db.users.update_one({"email": email_lc}, {"$set": payload})
        return existing["user_id"]
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one(
        {
            "user_id": user_id,
            "email": email_lc,
            "picture": "",
            "created_at": now,
            **payload,
        }
    )
    return user_id


async def _upsert_demo_chat_message(sample_user_id: str, sample_name: str) -> None:
    now = _iso()
    await db.instructor_messages.update_one(
        {"id": DEMO_MESSAGE_ID},
        {
            "$set": {
                "id": DEMO_MESSAGE_ID,
                "user_id": sample_user_id,
                "user_name": sample_name,
                "message": DEMO_MESSAGE_TEXT,
                "created_at": now,
            }
        },
        upsert=True,
    )


async def seed_apple_review_accounts() -> None:
    """Idempotent — creates / refreshes the App Review reviewer accounts.

    Safe to call on every backend boot; runs in <100ms once the
    accounts exist. When ANY of the three ``SEED_PW_*STOMPINGROUND_COM``
    env vars is unset the corresponding account is skipped — no
    hard-coded fallback lives in source, so a fresh clone without the
    env vars is a no-op.
    """
    reviewer_pw = _env_password_for(REVIEWER_EMAIL)
    admin_pw = _env_password_for(ADMIN_REVIEWER_EMAIL)
    sample_pw = _env_password_for(SAMPLE_USER_EMAIL)

    if not (reviewer_pw and admin_pw and sample_pw):
        logger.info(
            "Apple Review seed skipped — one or more of "
            "SEED_PW_REVIEWER_STOMPINGROUND_COM / "
            "SEED_PW_ADMINREVIEW_STOMPINGROUND_COM / "
            "SEED_PW_SAMPLECONTENT_STOMPINGROUND_COM not set."
        )
        return

    try:
        # 1. Dancer reviewer — instructor-flagged (needed to reach the
        #    instructor chat where the demo message lives), terms
        #    intentionally STALE so Demo 1B trips the gate.
        await _upsert_reviewer_account(
            email=REVIEWER_EMAIL,
            password=reviewer_pw,
            name="App Reviewer",
            is_admin=False,
            is_instructor=True,
            accepted_terms_version=STALE_TERMS_VERSION,
        )
        # 2. Admin reviewer — terms current, admin + instructor.
        await _upsert_reviewer_account(
            email=ADMIN_REVIEWER_EMAIL,
            password=admin_pw,
            name="Apple Admin Reviewer",
            is_admin=True,
            is_instructor=True,
            accepted_terms_version=TERMS_VERSION,
        )
        # 3. Sample user (never signs in) — author of the demo message
        #    the reviewer will long-press to Report / Block.
        sample_id = await _upsert_reviewer_account(
            email=SAMPLE_USER_EMAIL,
            password=sample_pw,
            name="Sample User",
            is_admin=False,
            is_instructor=True,
            accepted_terms_version=TERMS_VERSION,
        )
        # 4. The pinned demo chat message.
        await _upsert_demo_chat_message(sample_id, "Sample User")
        logger.info(
            "Apple Review seed complete: %s, %s, %s + demo message %s",
            REVIEWER_EMAIL,
            ADMIN_REVIEWER_EMAIL,
            SAMPLE_USER_EMAIL,
            DEMO_MESSAGE_ID,
        )
    except Exception:
        # Never crash boot over a demo-seed hiccup — log & continue so
        # the rest of the app is still available.
        logger.exception("Apple Review seed failed")
