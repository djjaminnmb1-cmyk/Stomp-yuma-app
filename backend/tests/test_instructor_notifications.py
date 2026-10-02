"""Backend tests for the instructor-notification fan-out ledger.

Verifies that creating classes or publishing events writes an
``instructor_notifications`` row for every user who follows the posting
instructor (via ``users.instructor_ids``), and that the ledger is
idempotent (unique on user + entity_type + entity_id).

The push relay (``core.push_service.send_push``) is best-effort and may
401 in preview — we only assert on ledger presence.
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

from _creds import (  # SEC-001 remediation — passwords from .env
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    ERIN_EMAIL,
    ERIN_PASSWORD,
    JAMIN_EMAIL,
    JAMIN_PASSWORD,
)

def _load_frontend_backend_url() -> str:
    p = "/app/frontend/.env"
    if os.path.exists(p):
        with open(p) as fh:
            for line in fh:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    return ""


BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").strip().rstrip("/")
    or os.environ.get("EXPO_BACKEND_URL", "").strip().rstrip("/")
    or _load_frontend_backend_url()
)
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not resolvable"
API = f"{BASE_URL}/api"


def _load_backend_env_var(key: str) -> str:
    if os.environ.get(key):
        return os.environ[key]
    p = "/app/backend/.env"
    if os.path.exists(p):
        with open(p) as fh:
            for line in fh:
                if line.startswith(f"{key}="):
                    return line.split("=", 1)[1].strip().strip('"')
    raise KeyError(key)


MONGO_URL = _load_backend_env_var("MONGO_URL")
DB_NAME = _load_backend_env_var("DB_NAME")

ERIN_EMAIL = "erinboroughs@gmail.com"
ERIN_PW = ERIN_PASSWORD

CREATED_CLASS_IDS: list[str] = []
CREATED_EVENT_IDS: list[str] = []
CREATED_USER_IDS: list[str] = []


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def erin_auth(api):
    r = api.post(f"{API}/auth/login", json={"email": ERIN_EMAIL, "password": ERIN_PW})
    assert r.status_code == 200, f"Erin login failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        "token": data["token"],
        "user_id": data["user"]["user_id"],
        "headers": {
            "Authorization": f"Bearer {data['token']}",
            "Content-Type": "application/json",
        },
    }


@pytest.fixture(scope="module")
def dance_ids(api, erin_auth):
    r = api.get(f"{API}/dances", headers=erin_auth["headers"])
    # /dances may or may not require auth; try both
    if r.status_code != 200:
        r = api.get(f"{API}/dances")
    assert r.status_code == 200, f"/dances failed: {r.status_code} {r.text[:200]}"
    docs = r.json()
    if isinstance(docs, dict):
        docs = docs.get("dances", []) or docs.get("items", [])
    assert docs, "No dances seeded"
    return [d["id"] for d in docs[:2]]


def _mk_dancer(api, erin_uid: str, follows_erin: bool) -> dict:
    """Register a fresh dancer; optionally point instructor_ids at Erin."""
    email = f"TEST_dancer_{uuid.uuid4().hex[:8]}@example.com"
    pw = "DancerPass1!"
    r = api.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": pw,
            "name": "Test Dancer",
            "accepted_terms_version": "2026-06-24",
        },
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    uid = data["user"]["user_id"]
    token = data["token"]
    CREATED_USER_IDS.append(uid)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if follows_erin:
        r2 = api.put(
            f"{API}/auth/me/instructors",
            headers=headers,
            json={"instructor_ids": [erin_uid], "main_instructor_id": erin_uid},
        )
        assert r2.status_code == 200, f"save_instructors failed: {r2.status_code} {r2.text}"
    return {"user_id": uid, "token": token, "headers": headers, "email": email}


@pytest.fixture(scope="module")
def follower(api, erin_auth):
    return _mk_dancer(api, erin_auth["user_id"], follows_erin=True)


@pytest.fixture(scope="module")
def non_follower(api, erin_auth):
    return _mk_dancer(api, erin_auth["user_id"], follows_erin=False)


# ---------------- Mongo helpers ----------------
def _mongo():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


async def _find_ledger(user_id: str, entity_type: str, entity_id: str) -> dict | None:
    db = _mongo()
    return await db.instructor_notifications.find_one(
        {"user_id": user_id, "entity_type": entity_type, "entity_id": entity_id},
        {"_id": 0},
    )


async def _count_ledger(entity_type: str, entity_id: str) -> int:
    db = _mongo()
    return await db.instructor_notifications.count_documents(
        {"entity_type": entity_type, "entity_id": entity_id}
    )


# ---------------- Tests ----------------
def _future_date(days: int = 14) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y-%m-%d")


class TestClassFanOut:
    def test_create_class_writes_ledger_for_follower(
        self, api, erin_auth, dance_ids, follower, non_follower
    ):
        payload = {
            "date": _future_date(14),
            "session_label": "TEST Beginner Boots",
            "dance_ids": dance_ids,
            "notes": "test class",
        }
        r = api.post(f"{API}/classes", headers=erin_auth["headers"], json=payload)
        assert r.status_code == 200, f"create class: {r.status_code} {r.text}"
        doc = r.json()
        cid = doc["id"]
        CREATED_CLASS_IDS.append(cid)

        # Give the background fan-out a moment even though it's awaited
        time.sleep(0.5)

        row = _run(_find_ledger(follower["user_id"], "class", cid))
        assert row is not None, "Follower must have a ledger row for the new class"
        assert row["instructor_id"] == erin_auth["user_id"]
        assert row["entity_type"] == "class"
        assert row["entity_id"] == cid
        assert "sent_at" in row

        # Non-follower must NOT be notified
        non_row = _run(
            _find_ledger(non_follower["user_id"], "class", cid)
        )
        assert non_row is None, "Non-follower should NOT have a ledger row"

    def test_second_class_creates_second_ledger_row(
        self, api, erin_auth, dance_ids, follower
    ):
        payload = {
            "date": _future_date(15),
            "session_label": "TEST Second Class",
            "dance_ids": dance_ids,
        }
        r = api.post(f"{API}/classes", headers=erin_auth["headers"], json=payload)
        assert r.status_code == 200
        cid = r.json()["id"]
        CREATED_CLASS_IDS.append(cid)
        time.sleep(0.5)
        assert _run(_find_ledger(follower["user_id"], "class", cid)) is not None

    def test_past_dated_class_no_ledger(
        self, api, erin_auth, dance_ids, follower
    ):
        payload = {
            "date": "2020-01-01",
            "session_label": "TEST Past Class",
            "dance_ids": dance_ids,
        }
        r = api.post(f"{API}/classes", headers=erin_auth["headers"], json=payload)
        assert r.status_code == 200
        cid = r.json()["id"]
        CREATED_CLASS_IDS.append(cid)
        time.sleep(0.5)
        # Should be zero for the follower AND overall
        assert _run(_find_ledger(follower["user_id"], "class", cid)) is None
        assert _run(_count_ledger("class", cid)) == 0


class TestIdempotency:
    def test_duplicate_ledger_insert_raises(self, follower):
        """Manually attempt to insert a duplicate row and expect a
        duplicate-key error — proves the unique index is protecting us."""
        assert CREATED_CLASS_IDS, "need a class from prior test"
        cid = CREATED_CLASS_IDS[0]
        from pymongo.errors import DuplicateKeyError
        import asyncio

        async def _try():
            db = _mongo()
            with pytest.raises(DuplicateKeyError):
                await db.instructor_notifications.insert_one({
                    "user_id": follower["user_id"],
                    "entity_type": "class",
                    "entity_id": cid,
                    "instructor_id": "dup-test",
                    "sent_at": "2026-01-01T00:00:00Z",
                })

        asyncio.get_event_loop().run_until_complete(_try())


class TestEventFanOut:
    def test_published_event_writes_ledger(
        self, api, erin_auth, follower, non_follower
    ):
        payload = {
            "name": "TEST Workshop",
            "description": "for testing",
            "event_type": "workshop",
            "skill_level": "Beginner",
            "date": _future_date(21),
            "address": "123 Main St",
            "city": "Yuma",
            "state": "AZ",
            "zip_code": "85364",
            "country": "US",
            "is_published": True,
        }
        r = api.post(f"{API}/events", headers=erin_auth["headers"], json=payload)
        assert r.status_code == 200, f"create event: {r.status_code} {r.text}"
        doc = r.json()
        eid = doc["id"]
        CREATED_EVENT_IDS.append(eid)
        time.sleep(0.5)
        row = _run(_find_ledger(follower["user_id"], "event", eid))
        assert row is not None, "Follower must have ledger row for published event"
        assert row["instructor_id"] == erin_auth["user_id"]
        assert _run(_find_ledger(non_follower["user_id"], "event", eid)) is None

    def test_draft_event_no_ledger_then_publish_flips_it(
        self, api, erin_auth, follower
    ):
        # 1) Draft
        payload = {
            "name": "TEST Draft Event",
            "description": "draft",
            "event_type": "workshop",
            "skill_level": "All levels",
            "date": _future_date(22),
            "address": "456 Main St",
            "city": "Yuma",
            "state": "AZ",
            "zip_code": "85364",
            "country": "US",
            "is_published": False,
        }
        r = api.post(f"{API}/events", headers=erin_auth["headers"], json=payload)
        assert r.status_code == 200
        eid = r.json()["id"]
        CREATED_EVENT_IDS.append(eid)
        time.sleep(0.5)
        assert _run(_find_ledger(follower["user_id"], "event", eid)) is None

        # 2) Publish -> ledger row appears
        publish_payload = {**payload, "is_published": True}
        r2 = api.patch(
            f"{API}/events/{eid}",
            headers=erin_auth["headers"],
            json=publish_payload,
        )
        assert r2.status_code == 200, f"publish: {r2.status_code} {r2.text}"
        time.sleep(0.5)
        row = _run(_find_ledger(follower["user_id"], "event", eid))
        assert row is not None, "Publish flip must write a ledger row"

        # 3) Idempotency: another PATCH (still published) — no extra rows.
        pre_count = _run(_count_ledger("event", eid))
        edited = {**publish_payload, "description": "edited desc"}
        r3 = api.patch(
            f"{API}/events/{eid}", headers=erin_auth["headers"], json=edited
        )
        assert r3.status_code == 200
        time.sleep(0.5)
        post_count = _run(_count_ledger("event", eid))
        assert post_count == pre_count, (
            f"No new ledger rows on subsequent PATCH; before={pre_count} after={post_count}"
        )

    def test_past_event_no_ledger(self, api, erin_auth, follower):
        payload = {
            "name": "TEST Past Event",
            "event_type": "workshop",
            "skill_level": "All levels",
            "date": "2020-01-01",
            "address": "1 Old St",
            "city": "Yuma",
            "state": "AZ",
            "zip_code": "85364",
            "country": "US",
            "is_published": True,
        }
        r = api.post(f"{API}/events", headers=erin_auth["headers"], json=payload)
        assert r.status_code == 200
        eid = r.json()["id"]
        CREATED_EVENT_IDS.append(eid)
        time.sleep(0.5)
        assert _run(_find_ledger(follower["user_id"], "event", eid)) is None


async def _find_feed_row(user_id: str, kind: str, entity_id: str) -> dict | None:
    db = _mongo()
    return await db.notification_events.find_one(
        {
            "user_id": user_id,
            "kind": kind,
            "metadata.entity_id": entity_id,
        },
        {"_id": 0},
    )


async def _find_lib_broadcast_row(user_id: str, entity_id: str) -> dict | None:
    """The library_broadcast ledger uses the ``library_broadcasts``
    collection to dedupe its own send. If a follower appears in there
    for a class they ALSO got a follower push for, it would mean the
    skip_user_ids plumbing broke and the phone would buzz twice."""
    db = _mongo()
    for coll in ("library_broadcasts", "library_broadcast_log"):
        row = await db[coll].find_one(
            {
                "user_id": user_id,
                "entity_type": "class",
                "entity_id": entity_id,
            },
            {"_id": 0},
        )
        if row:
            return row
    return None


class TestFeedCenterLogging:
    """Every follower push must also land in the in-app Notification
    Center so the user can scroll back after the OS banner fades."""

    def test_new_class_writes_feed_row(
        self, api, erin_auth, dance_ids, follower
    ):
        payload = {
            "date": _future_date(16),
            "session_label": "TEST Feed Logging Class",
            "dance_ids": dance_ids,
        }
        r = api.post(f"{API}/classes", headers=erin_auth["headers"], json=payload)
        assert r.status_code == 200
        cid = r.json()["id"]
        CREATED_CLASS_IDS.append(cid)
        time.sleep(0.5)

        row = _run(_find_feed_row(follower["user_id"], "new_class", cid))
        assert row is not None, "Follower must have a notification feed row"
        assert row["title"], "Feed row must have a title"
        assert cid in str(row.get("metadata", {})), "entity_id must be in metadata"
        assert row["deeplink"].startswith("/classes"), (
            f"Class feed row should deeplink to /classes, got {row['deeplink']!r}"
        )

    def test_new_event_writes_feed_row(
        self, api, erin_auth, follower
    ):
        payload = {
            "name": "TEST Feed Logging Event",
            "description": "feed test",
            "event_type": "workshop",
            "skill_level": "Beginner",
            "date": _future_date(23),
            "address": "123 Feed Rd",
            "city": "Yuma",
            "state": "AZ",
            "zip_code": "85364",
            "country": "US",
            "is_published": True,
        }
        r = api.post(f"{API}/events", headers=erin_auth["headers"], json=payload)
        assert r.status_code == 200
        eid = r.json()["id"]
        CREATED_EVENT_IDS.append(eid)
        time.sleep(0.5)

        row = _run(_find_feed_row(follower["user_id"], "new_event", eid))
        assert row is not None, "Follower must have a notification feed row for event"
        assert row["deeplink"] == f"/events/{eid}", (
            f"Event feed row deeplink mismatch: {row['deeplink']!r}"
        )


class TestNoDoublePushDedupe:
    """Followers who got the instructor-fan-out push MUST NOT also get
    the library-wide "new class" broadcast push — otherwise their phone
    buzzes twice for the same class.

    The route passes the follower-recipients list as ``skip_user_ids``
    to ``broadcast_new_class``; this test proves that plumbing works."""

    def test_follower_not_library_broadcast_on_class_create(
        self, api, erin_auth, dance_ids, follower
    ):
        payload = {
            "date": _future_date(17),
            "session_label": "TEST Dedupe Class",
            "dance_ids": dance_ids,
        }
        r = api.post(f"{API}/classes", headers=erin_auth["headers"], json=payload)
        assert r.status_code == 200
        cid = r.json()["id"]
        CREATED_CLASS_IDS.append(cid)
        time.sleep(0.5)

        # Follower MUST have the instructor-fan-out push ledger row.
        assert _run(_find_ledger(follower["user_id"], "class", cid)) is not None

        # Follower MUST NOT have a library-broadcast ledger row (dedupe worked).
        lib_row = _run(_find_lib_broadcast_row(follower["user_id"], cid))
        assert lib_row is None, (
            f"Follower was ALSO library-broadcast — double push!\n"
            f"  lib_row={lib_row!r}"
        )


# ---------------- Cleanup ----------------
@pytest.fixture(scope="module", autouse=True)
def _cleanup():
    yield
    import asyncio

    async def _do():
        db = _mongo()
        if CREATED_CLASS_IDS:
            await db.classes.delete_many({"id": {"$in": CREATED_CLASS_IDS}})
            await db.instructor_notifications.delete_many(
                {"entity_type": "class", "entity_id": {"$in": CREATED_CLASS_IDS}}
            )
            await db.notification_events.delete_many(
                {"kind": "new_class", "metadata.entity_id": {"$in": CREATED_CLASS_IDS}}
            )
        if CREATED_EVENT_IDS:
            await db.events.delete_many({"id": {"$in": CREATED_EVENT_IDS}})
            await db.instructor_notifications.delete_many(
                {"entity_type": "event", "entity_id": {"$in": CREATED_EVENT_IDS}}
            )
            await db.notification_events.delete_many(
                {"kind": "new_event", "metadata.entity_id": {"$in": CREATED_EVENT_IDS}}
            )
        if CREATED_USER_IDS:
            await db.users.delete_many({"user_id": {"$in": CREATED_USER_IDS}})
            await db.instructor_notifications.delete_many(
                {"user_id": {"$in": CREATED_USER_IDS}}
            )
            await db.notification_events.delete_many(
                {"user_id": {"$in": CREATED_USER_IDS}}
            )

    try:
        asyncio.get_event_loop().run_until_complete(_do())
    except Exception as e:
        print(f"cleanup issue: {e}")


# ---------------- Small sync helper for awaited motor calls ----------------
def _run(coro):
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)
