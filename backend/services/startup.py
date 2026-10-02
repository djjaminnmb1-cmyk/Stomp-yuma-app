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
from core.security import hash_password, upsert_user
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
        # User-level blocks (mutual invisibility). Indexes live in
        # ``services/blocks.py`` so anywhere that touches the collection
        # picks up the same shape.
        from services.blocks import ensure_indexes as ensure_block_indexes
        await ensure_block_indexes()
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

    # NEW-FEATURE INDEXES — isolated in their own try/except blocks so
    # a conflict in the legacy indexes above (e.g. the pre-existing
    # ``event_id_1`` unique index on activity_events) can never skip
    # the follow-graph / mention / drift-scan setups underneath.
    try:
        from services.choreographer_follows import (
            backfill_choreographer_keys,
            ensure_indexes as ensure_chor_indexes,
        )
        await ensure_chor_indexes()
        # Idempotent one-shot: populates ``choreographer_key`` on any
        # dance doc that's missing it (or has a stale value after the
        # normaliser evolves). Runs in ~1-2s against the current
        # ~1200-doc library, then becomes a no-op on subsequent boots.
        try:
            written = await backfill_choreographer_keys()
            if written:
                logger.info(
                    f"choreographer_key backfill wrote {written} row(s)"
                )
        except Exception as e:
            logger.warning(f"choreographer_key backfill skipped: {e}")
    except Exception as e:
        logger.warning(f"choreographer_follows index issue: {e}")
    try:
        from services.chat_mentions import (
            ensure_indexes as ensure_mention_indexes,
        )
        await ensure_mention_indexes()
    except Exception as e:
        logger.warning(f"chat_mentions index issue: {e}")
    try:
        from services.chat_reads import (
            ensure_indexes as ensure_chat_read_indexes,
        )
        await ensure_chat_read_indexes()
    except Exception as e:
        logger.warning(f"chat_reads index issue: {e}")
    try:
        from services.chat_reactions import (
            ensure_indexes as ensure_chat_reaction_indexes,
        )
        await ensure_chat_reaction_indexes()
    except Exception as e:
        logger.warning(f"chat_reactions index issue: {e}")
    try:
        from services.link_previews import (
            ensure_indexes as ensure_link_preview_indexes,
        )
        await ensure_link_preview_indexes()
    except Exception as e:
        logger.warning(f"link_previews index issue: {e}")
    # One-off migration: strip any persisted ``parent`` snippet from
    # legacy reply docs (pre-thread-fix). New POSTs never write it;
    # GET reads defensively pop it; this migration removes the field
    # entirely so a future maintainer can drop the defensive pop
    # without regressing anything. Idempotent — becomes a no-op after
    # the first successful run.
    try:
        res = await db.instructor_messages.update_many(
            {"parent": {"$exists": True}},
            {"$unset": {"parent": ""}},
        )
        if getattr(res, "modified_count", 0):
            logger.info(
                f"chat threads migration: stripped persisted `parent` "
                f"from {res.modified_count} legacy row(s)"
            )
    except Exception as e:
        logger.warning(f"chat threads migration skipped: {e}")
    try:
        from services.refresh_recommendations import (
            ensure_indexes as ensure_drift_indexes,
        )
        await ensure_drift_indexes()
    except Exception as e:
        logger.warning(f"drift_flags index issue: {e}")
    try:
        from services.instructor_notifications import (
            ensure_indexes as ensure_inst_notif_indexes,
        )
        await ensure_inst_notif_indexes()
    except Exception as e:
        logger.warning(f"instructor_notifications index issue: {e}")
    try:
        from services.library_broadcast import (
            ensure_indexes as ensure_library_broadcast_indexes,
        )
        await ensure_library_broadcast_indexes()
    except Exception as e:
        logger.warning(f"library_broadcasts index issue: {e}")
    try:
        from services.notification_feed import (
            ensure_indexes as ensure_notif_feed_indexes,
        )
        await ensure_notif_feed_indexes()
    except Exception as e:
        logger.warning(f"notification_feed index issue: {e}")
    try:
        from services.dotd_streak import (
            ensure_indexes as ensure_dotd_streak_indexes,
        )
        await ensure_dotd_streak_indexes()
    except Exception as e:
        logger.warning(f"dotd_opens index issue: {e}")
    try:
        # Event RSVPs — one row per (event, user); upsert-based.
        await db.event_rsvps.create_index(
            [("event_id", 1), ("user_id", 1)],
            unique=True,
            name="uniq_event_user_rsvp",
        )
        await db.event_rsvps.create_index(
            [("user_id", 1)], name="rsvp_by_user"
        )
    except Exception as e:
        logger.warning(f"event_rsvps index issue: {e}")
    try:
        from services.dance_library_sync import (
            ensure_indexes as ensure_sync_indexes,
        )
        await ensure_sync_indexes()
    except Exception as e:
        logger.warning(f"dance_sync_log index issue: {e}")

    # NOTE (deployment policy): the boot path is not allowed to
    # delete existing DB records — even legacy duplicates. The
    # ``choreographer_follows`` collection now has a unique
    # ``(user_id, choreographer_key)`` index (see line 112 above) so
    # new duplicates cannot form. The one-off
    # ``deduplicate_existing_rows()`` cleanup remains available as a
    # module function and can be triggered by an admin route if a
    # legacy environment ever needs it — but we don't call it on
    # every boot any more.

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
        # Every dance write path stamps a canonical ``choreographer_key``
        # so ``list_choreographers`` / ``get_choreographer_detail`` can
        # index into the same string without an aggregate-time
        # normalisation pass. See services/choreographer_follows.py.
        from services.choreographer_follows import inject_choreographer_key
        for _row in to_insert:
            inject_choreographer_key(_row)
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

    Passwords are ONLY set at FIRST CREATION — never overwritten on
    subsequent boots. This lets an operator rotate any seeded admin's
    password via the app (or a one-off admin tool) and have that change
    stick across restarts. ``SEED_PW_*`` env vars still seed a fresh
    install, but after that they're advisory only.

    If a brand-new account is being seeded and no ``SEED_PW_*`` env var
    is provided, a random 16-char one-time password is generated and
    written to the DB — but NEVER logged in plaintext. The operator
    must trigger a password-reset flow to obtain a working credential.
    That way, boot logs are safe to share for debugging.
    """
    env_pw = _env_password_for(email)
    existing = await db.users.find_one({"email": email})
    if existing:
        updates: dict = {}
        if want_admin and not existing.get("is_admin"):
            updates["is_admin"] = True
        if want_instructor and not existing.get("is_instructor"):
            updates["is_instructor"] = True
        # Only seed a password if the account was migrated from an
        # OAuth-only sign-up and never got a local hash. Never overwrite
        # an existing password — that's the operator's to manage.
        if not existing.get("password_hash"):
            pw = env_pw or _secrets.token_urlsafe(16)
            updates["password_hash"] = hash_password(pw)
            if not env_pw:
                logger.warning(
                    "Seeded account %s had no local password; issued a "
                    "random one. Use the forgot-password flow to set a "
                    "new one — the plaintext is NOT logged.",
                    email,
                )
        if not existing.get("name") and display:
            updates["name"] = display
        if updates:
            await db.users.update_one({"email": email}, {"$set": updates})
        return
    # No existing record -> create one
    pw = env_pw or _secrets.token_urlsafe(16)
    if not env_pw:
        logger.warning(
            "Seeded new account %s with a random password. Use the "
            "forgot-password flow to set a new one — the plaintext "
            "is NOT logged.",
            email,
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
    """Composite startup: indexes → dance seed → account seed → App Review seed."""
    await _ensure_indexes()
    await _seed_dances()
    await _seed_accounts()
    # Apple App Review 1.2 UGC — reviewer accounts + demo chat message.
    # Remove this call (and the file) once Apple approves the build.
    from services.apple_review_seed import seed_apple_review_accounts
    await seed_apple_review_accounts()
