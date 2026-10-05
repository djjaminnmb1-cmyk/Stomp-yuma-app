"""One-shot DB purge for the Apple App Review seeded accounts.

Mirrors the sweep done by ``routes/auth.py::delete_my_account`` but
operates directly on the DB (no HTTP session required) and skips the
"last admin" guard — safe because the three real admins
(erinboroughs, admin@stompinground, luvtowork247) remain.

Idempotent: a second run on an already-clean DB prints "0 found" for
each account and exits 0.
"""
import asyncio
import logging
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("purge")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

TARGET_EMAILS = [
    "reviewer@stompinground.com",
    "adminreview@stompinground.com",
    "samplecontent@stompinground.com",
]
DEMO_MESSAGE_ID = "msg_apple_review_demo"


async def _purge_user(db, uid: str, email: str) -> dict:
    """Replica of the key cleanup paths in `delete_my_account`."""
    stats = {}

    # Direct deletes — one row per collection
    for coll in (
        "sessions",
        "password_reset_tokens",
        "tracking",
        "attendance",
        "practice_sessions",
        "suggestions",
        "instructor_messages",
        "sent_reminders",
        "user_badges",
        "practice_daily",
        "event_rsvps",
    ):
        res = await db[coll].delete_many({"user_id": uid})
        if res.deleted_count:
            stats[coll] = res.deleted_count

    # Service purge_user helpers — each one owns multiple collections.
    import sys
    sys.path.insert(0, "/app/backend")
    for mod_name in (
        "services.social",
        "services.choreographer_follows",
        "services.chat_mentions",
        "services.chat_reads",
        "services.chat_reactions",
        "services.instructor_notifications",
        "services.library_broadcast",
        "services.notification_feed",
        "services.dotd_streak",
        "services.weekly_digest",
    ):
        try:
            mod = __import__(mod_name, fromlist=["purge_user"])
            await mod.purge_user(uid)
            stats[mod_name] = "called"
        except Exception as e:
            logger.warning(f"  {mod_name}.purge_user({uid}) failed: {e}")

    # Anonymise content authored by this user (if any) rather than
    # delete it — matches the account-delete contract.
    r = await db.dances.update_many(
        {"created_by": uid},
        {"$set": {"created_by": "", "created_by_name": "Deleted user"}},
    )
    if r.modified_count:
        stats["dances_anonymised"] = r.modified_count
    r = await db.classes.update_many(
        {"instructor_id": uid},
        {"$set": {"instructor_id": "", "instructor_name": "Deleted user"}},
    )
    if r.modified_count:
        stats["classes_anonymised"] = r.modified_count

    # Finally the user doc itself.
    r = await db.users.delete_one({"user_id": uid})
    if r.deleted_count:
        stats["users"] = r.deleted_count

    return stats


async def main():
    db = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
    print(f"\nPurging Apple review seeds from DB {DB_NAME!r}...\n")

    for email in TARGET_EMAILS:
        user = await db.users.find_one({"email": email}, {"user_id": 1, "email": 1})
        if not user:
            print(f"✓ {email}: no row (nothing to do)")
            continue
        uid = user["user_id"]
        print(f"→ {email} (user_id={uid})")
        stats = await _purge_user(db, uid, email)
        for coll, n in stats.items():
            print(f"   {coll}: {n}")
        print(f"   DONE")

    # Explicitly nuke the demo chat message by its canonical id in
    # case it was authored under a different user_id (e.g. a prior
    # re-seed) that doesn't match any of the 3 target emails.
    r = await db.instructor_messages.delete_one({"id": DEMO_MESSAGE_ID})
    print(f"\n→ demo chat message {DEMO_MESSAGE_ID!r}: deleted={r.deleted_count}")

    # Also nuke any lingering reactions / mentions / notification rows
    # that referenced the demo message.
    r = await db.chat_reactions.delete_many({"message_id": DEMO_MESSAGE_ID})
    print(f"→ chat_reactions for demo msg: {r.deleted_count}")
    r = await db.chat_mentions.delete_many({"message_id": DEMO_MESSAGE_ID})
    print(f"→ chat_mentions for demo msg: {r.deleted_count}")
    r = await db.notification_events.delete_many(
        {"metadata.entity_id": DEMO_MESSAGE_ID}
    )
    print(f"→ notification_events for demo msg: {r.deleted_count}")

    # Sanity-check — none of the target emails should resolve to a row now.
    print("\nFinal check:")
    for email in TARGET_EMAILS:
        user = await db.users.find_one({"email": email}, {"user_id": 1})
        print(f"  {email}: {'STILL PRESENT ✗' if user else 'gone ✓'}")

    print("\nDone.")


asyncio.run(main())
