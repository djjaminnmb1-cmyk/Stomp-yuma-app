"""One-shot startup work: index creation + seed data + admin/instructor
account bootstrap.

Called from ``server.py`` on FastAPI ``startup`` event. All operations are
idempotent — safe to run on every boot.
"""
from __future__ import annotations

import json as _json
import logging
import os
import secrets as _secrets
import uuid
from pathlib import Path
from typing import Optional

from core.config import ADMIN_EMAILS, INSTRUCTOR_EMAILS
from core.database import db
from core.reset_tokens import ensure_reset_indexes
from core.security import hash_password, upsert_user, verify_password
from core.time_helpers import now_iso

logger = logging.getLogger(__name__)

_ROOT_DIR = Path(__file__).parent.parent  # /app/backend


async def _ensure_indexes() -> None:
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        # Sign in with Apple stores the stable subject on the user doc.
        # Sparse so email/password + Google users (which have no
        # ``apple_sub``) don't collide on the unique constraint.
        await db.users.create_index(
            "apple_sub", unique=True, sparse=True
        )
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.dances.create_index("name")
        await db.tracking.create_index(
            [("user_id", 1), ("dance_id", 1)], unique=True
        )
        await db.classes.create_index("date")
        await db.attendance.create_index(
            [("user_id", 1), ("class_id", 1)], unique=True
        )
        await db.practice_sessions.create_index(
            [("user_id", 1), ("dance_id", 1)], unique=True
        )
        await db.practice_sessions.create_index("last_opened_at")
        await db.leaderboard_prizes.create_index(
            [("range", 1), ("rank", 1)], unique=True
        )
        await db.leaderboard_state.create_index("key", unique=True)
        await db.leaderboard_seasons.create_index("started_at")
        await db.sent_reminders.create_index("key", unique=True)
        await db.instructor_messages.create_index("created_at")
        await db.user_badges.create_index(
            [("user_id", 1), ("badge_id", 1)], unique=True
        )
        await db.user_badges.create_index("user_id")
        await db.practice_daily.create_index(
            [("user_id", 1), ("day", 1)], unique=True
        )
        await db.practice_daily.create_index([("user_id", 1), ("day", -1)])
        # Social graph
        await db.follows.create_index(
            [("follower_id", 1), ("followee_id", 1)], unique=True
        )
        await db.follows.create_index("followee_id")
        # Activity feed events
        await db.activity_events.create_index([("user_id", 1), ("created_at", -1)])
        await db.activity_events.create_index("created_at")
        await db.activity_events.create_index("event_id")
        # Feed reactions (one per user per event per kind)
        await db.feed_reactions.create_index(
            [("user_id", 1), ("event_id", 1), ("kind", 1)], unique=True
        )
        await db.feed_reactions.create_index("event_id")
        # Feed reports (moderation queue)
        await db.feed_reports.create_index(
            [("reporter_id", 1), ("event_id", 1)], unique=True
        )
        await db.feed_reports.create_index([("status", 1), ("created_at", -1)])
        # Suggestions targeted at a specific instructor
        await db.suggestions.create_index(
            [("target_instructor_id", 1), ("created_at", -1)]
        )
        # Events + geocoding
        await db.events.create_index([("date", 1)])
        await db.events.create_index([("instructor_id", 1)])
        # 2dsphere index enables ``$near`` queries. Sparse so events with
        # no coordinates (geocoding failed) don't break the index.
        await db.events.create_index(
            [("location", "2dsphere")], sparse=True
        )
        await db.geocode_cache.create_index("key", unique=True)
    except Exception as e:
        logger.warning(f"Index issue: {e}")

    # Password reset indexes (idempotent)
    await ensure_reset_indexes()


async def _seed_dances() -> None:
    """Backfill missing fields on existing docs + insert any new SEED_DANCES
    rows not already present. Honors ``dance_blocklist.json`` so operator
    prunes stick across restarts.
    """
    # Late import so the seed module (large tuples) is only touched on startup.
    from seed_dances import SEED_DANCES  # noqa: WPS433

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

    # Load blocklist (names permanently excluded from re-seeding)
    blocklist: set[str] = set()
    try:
        _bl_path = _ROOT_DIR / "dance_blocklist.json"
        if _bl_path.exists():
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
            "youtube_url": (
                f"https://www.youtube.com/results?search_query="
                f"{yt.replace(' ', '+')}"
            ),
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


def _env_password_for(email: str) -> Optional[str]:
    key = "SEED_PW_" + email.replace("@", "_").replace(".", "_").upper()
    val = os.environ.get(key, "").strip()
    return val or None


async def _seed_account(
    email: str,
    display: str,
    want_admin: bool,
    want_instructor: bool,
) -> None:
    """Ensure a user record exists for a whitelisted email.

    No passwords are hard-coded here. For each seeded email:
    - If the account already has a ``password_hash``, DO NOT touch it,
      unless a matching ``SEED_PW_*`` env var is set (in which case sync it).
    - Otherwise generate a random one-time password and log it ONCE so the
      operator can hand it to the owner. The user should reset on first login.
    """
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
            if not (
                env_pw
                and existing.get("password_hash")
                and verify_password(env_pw, existing["password_hash"])
            ):
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


async def _seed_accounts() -> None:
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


async def run_startup() -> None:
    """Composite startup: indexes → dance seed → account seed."""
    await _ensure_indexes()
    await _seed_dances()
    await _seed_accounts()
