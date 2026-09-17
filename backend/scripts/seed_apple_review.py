"""Seed Apple App Review test accounts and demo content.

Idempotent — safe to run against prod multiple times. Creates:

  1. ``reviewer@stompinground.com`` (regular dancer, instructor-flagged
     so they can also demo the chat report flow). ``accepted_terms_version``
     is INTENTIONALLY set to the previous version string so the first
     login trips the TermsGate and shows the Apple reviewer the "Updated
     Terms" screen.
  2. ``adminreview@stompinground.com`` (admin, instructor, terms
     up-to-date). Used to demo the moderation queue in ``/admin/moderation``.
  3. A pinned demo message in the instructor chat from a placeholder
     "Sample User" account so the reviewer has something concrete to
     long-press → Report / Block.

Run:
    python -m backend.scripts.seed_apple_review
    # OR from anywhere:
    python /app/backend/scripts/seed_apple_review.py
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Allow running as a script (no -m)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# ---- Deferred imports (must happen AFTER load_dotenv) -----------------
from core.database import db  # noqa: E402
from core.security import hash_password  # noqa: E402


REVIEWER_EMAIL = "reviewer@stompinground.com"
REVIEWER_PASSWORD = "AppleReview!2026"

ADMIN_REVIEWER_EMAIL = "adminreview@stompinground.com"
ADMIN_REVIEWER_PASSWORD = "AppleReview!2026#"

SAMPLE_USER_EMAIL = "samplecontent@stompinground.com"
SAMPLE_USER_PASSWORD = "SampleContent!2026"

CURRENT_TERMS_VERSION = "2026-06-24"
STALE_TERMS_VERSION = "2025-01-01"  # ← intentionally OLD so gate trips
DEMO_MESSAGE_ID = "msg_apple_review_demo"
DEMO_MESSAGE_TEXT = (
    "This is sample content for App Review — long-press me to "
    "Report or Block. (Seeded via seed_apple_review.py)"
)


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


async def _upsert_user(
    *,
    email: str,
    password: str,
    name: str,
    is_admin: bool,
    is_instructor: bool,
    accepted_terms_version: str,
) -> str:
    """Insert or update a user, returning the user_id."""
    email_lc = email.lower()
    existing = await db.users.find_one({"email": email_lc}, {"_id": 0})
    now = _iso()
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"email": email_lc},
            {
                "$set": {
                    "name": name,
                    "password_hash": hash_password(password),
                    "is_admin": is_admin,
                    "is_instructor": is_instructor,
                    "auth_provider": "email",
                    "accepted_terms_version": accepted_terms_version,
                    "accepted_terms_at": (
                        now if accepted_terms_version else ""
                    ),
                    # Ensure the account isn't in a suspended/banned
                    # state left over from a previous demo run.
                    "is_suspended": False,
                    "suspend_until": "",
                    "is_banned": False,
                    "moderation_reason": "",
                }
            },
        )
        print(f"  ✓ Updated existing user: {email_lc}  ({user_id})")
        return user_id

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one(
        {
            "user_id": user_id,
            "email": email_lc,
            "name": name,
            "picture": "",
            "is_admin": is_admin,
            "is_instructor": is_instructor,
            "auth_provider": "email",
            "password_hash": hash_password(password),
            "accepted_terms_version": accepted_terms_version,
            "accepted_terms_at": now if accepted_terms_version else "",
            "created_at": now,
        }
    )
    print(f"  ✓ Created new user:      {email_lc}  ({user_id})")
    return user_id


async def _upsert_demo_chat_message(sample_user_id: str, sample_name: str):
    """Ensure the demo message exists in the instructor chat.

    Uses a fixed ``id`` so re-running the script overwrites (not
    duplicates) the demo row.
    """
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
    print(f"  ✓ Demo chat message ensured (id={DEMO_MESSAGE_ID})")


async def main() -> None:
    print("=== Seeding Apple App Review accounts ===")
    print()

    # 1. Regular reviewer — instructor flag ON so they can view chat,
    #    ``accepted_terms_version`` set to an OLD value on purpose.
    reviewer_id = await _upsert_user(
        email=REVIEWER_EMAIL,
        password=REVIEWER_PASSWORD,
        name="App Reviewer",
        is_admin=False,
        is_instructor=True,
        accepted_terms_version=STALE_TERMS_VERSION,
    )

    # 2. Admin reviewer — full moderator, terms up-to-date so they can
    #    hit the moderation queue without going through the gate.
    admin_id = await _upsert_user(
        email=ADMIN_REVIEWER_EMAIL,
        password=ADMIN_REVIEWER_PASSWORD,
        name="Apple Admin Reviewer",
        is_admin=True,
        is_instructor=True,
        accepted_terms_version=CURRENT_TERMS_VERSION,
    )

    # 3. Sample content author — the "user" whose message the reviewer
    #    will long-press and Report/Block. Never signs in.
    sample_id = await _upsert_user(
        email=SAMPLE_USER_EMAIL,
        password=SAMPLE_USER_PASSWORD,
        name="Sample User",
        is_admin=False,
        is_instructor=True,
        accepted_terms_version=CURRENT_TERMS_VERSION,
    )

    # 4. Demo message in the chat.
    await _upsert_demo_chat_message(sample_id, "Sample User")

    print()
    print("=== Done. Reviewer credentials ===")
    print(f"  Dancer:  {REVIEWER_EMAIL}    /  {REVIEWER_PASSWORD}")
    print(f"  Admin:   {ADMIN_REVIEWER_EMAIL}    /  {ADMIN_REVIEWER_PASSWORD}")
    print()
    print("Now open /app/APPLE_REVIEW_NOTES.md and paste the Reviewer")
    print("Notes block into App Store Connect before resubmitting.")
    print()
    print(f"  reviewer_id: {reviewer_id}")
    print(f"  admin_id:    {admin_id}")
    print(f"  sample_id:   {sample_id}")


if __name__ == "__main__":
    asyncio.run(main())
