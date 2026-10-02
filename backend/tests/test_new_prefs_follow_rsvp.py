"""Backend tests for the three new backlog features:

1. Notification preferences  (GET/PATCH /api/users/me/notification-prefs)
2. Instructor one-tap follow (POST/DELETE /api/instructors/{id}/follow)
3. Event RSVP                (POST/GET/DELETE /api/events/{id}/rsvp[/me])
4. Fan-out prefs integration (class ledger honours class_alerts)

Uses live backend behind EXPO_PUBLIC_BACKEND_URL. Creates disposable
TEST_* users and deletes them + their side-effects at teardown.

Push relay may 401 in preview — we only assert on ledger rows and
API return shapes, never on delivery.
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


# ---------------- Config ----------------
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

CREATED_USER_IDS: list[str] = []
CREATED_EVENT_IDS: list[str] = []
CREATED_CLASS_IDS: list[str] = []


# ---------------- Mongo helpers ----------------
def _mongo():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


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


async def _find_ledger(user_id: str, entity_type: str, entity_id: str):
    db = _mongo()
    return await db.instructor_notifications.find_one(
        {"user_id": user_id, "entity_type": entity_type, "entity_id": entity_id},
        {"_id": 0},
    )


async def _get_user_doc(user_id: str) -> dict | None:
    db = _mongo()
    return await db.users.find_one({"user_id": user_id}, {"_id": 0})


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


def _mk_dancer(api) -> dict:
    email = f"TEST_dancer_{uuid.uuid4().hex[:8]}@example.com"
    pw = "DancerPass1!"
    r = api.post(
        f"{API}/auth/register",
        json={"email": email, "password": pw, "name": "Test Dancer"},
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    uid = data["user"]["user_id"]
    token = data["token"]
    CREATED_USER_IDS.append(uid)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    return {"user_id": uid, "token": token, "headers": headers, "email": email}


@pytest.fixture(scope="module")
def dancer(api):
    return _mk_dancer(api)


@pytest.fixture(scope="module")
def dancer2(api):
    return _mk_dancer(api)


@pytest.fixture(scope="module")
def dance_ids(api, erin_auth):
    r = api.get(f"{API}/dances", headers=erin_auth["headers"])
    if r.status_code != 200:
        r = api.get(f"{API}/dances")
    assert r.status_code == 200, f"/dances failed: {r.status_code}"
    docs = r.json()
    if isinstance(docs, dict):
        docs = docs.get("dances", []) or docs.get("items", [])
    assert docs, "No dances seeded"
    return [d["id"] for d in docs[:2]]


def _future_date(days: int = 14) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y-%m-%d")


# ============================================================
# 1. Notification preferences
# ============================================================
class TestNotificationPrefs:
    def test_default_first_read_all_true(self, api, dancer):
        r = api.get(f"{API}/users/me/notification-prefs", headers=dancer["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "prefs" in body and "categories" in body
        prefs = body["prefs"]
        expected = {
            "class_alerts", "event_alerts", "choreographer_alerts",
            "mention_alerts", "reminder_alerts",
        }
        assert set(prefs.keys()) == expected
        assert all(v is True for v in prefs.values()), f"defaults not True: {prefs}"
        assert set(body["categories"]) == expected

    def test_patch_single_field_merges(self, api, dancer):
        r = api.patch(
            f"{API}/users/me/notification-prefs",
            headers=dancer["headers"],
            json={"event_alerts": False},
        )
        assert r.status_code == 200, r.text
        prefs = r.json()["prefs"]
        assert prefs["event_alerts"] is False
        # Others unchanged
        for k in ("class_alerts", "choreographer_alerts", "mention_alerts", "reminder_alerts"):
            assert prefs[k] is True, f"{k} unexpectedly changed"
        # Persist verification via GET
        r2 = api.get(f"{API}/users/me/notification-prefs", headers=dancer["headers"])
        assert r2.json()["prefs"]["event_alerts"] is False

    def test_patch_multi_fields(self, api, dancer):
        r = api.patch(
            f"{API}/users/me/notification-prefs",
            headers=dancer["headers"],
            json={"class_alerts": True, "mention_alerts": False},
        )
        assert r.status_code == 200
        prefs = r.json()["prefs"]
        assert prefs["class_alerts"] is True
        assert prefs["mention_alerts"] is False
        # event_alerts from previous test stays False
        assert prefs["event_alerts"] is False
        assert prefs["choreographer_alerts"] is True
        assert prefs["reminder_alerts"] is True

    def test_patch_unknown_field_silently_dropped(self, api, dancer):
        r = api.patch(
            f"{API}/users/me/notification-prefs",
            headers=dancer["headers"],
            json={"foobar": True, "reminder_alerts": False},
        )
        assert r.status_code == 200, r.text
        prefs = r.json()["prefs"]
        assert "foobar" not in prefs
        assert prefs["reminder_alerts"] is False


# ============================================================
# 2. Instructor follow toggle
# ============================================================
class TestInstructorFollow:
    def test_follow_erin(self, api, erin_auth, dancer2):
        erin_id = erin_auth["user_id"]
        r = api.post(
            f"{API}/instructors/{erin_id}/follow",
            headers=dancer2["headers"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["is_following"] is True
        assert isinstance(body["follower_count"], int)
        assert body["follower_count"] >= 1
        # Persist verification: user.instructor_ids contains erin
        doc = _run(_get_user_doc(dancer2["user_id"]))
        assert erin_id in (doc.get("instructor_ids") or [])

    def test_follow_idempotent(self, api, erin_auth, dancer2):
        erin_id = erin_auth["user_id"]
        r1 = api.post(f"{API}/instructors/{erin_id}/follow", headers=dancer2["headers"])
        count1 = r1.json()["follower_count"]
        r2 = api.post(f"{API}/instructors/{erin_id}/follow", headers=dancer2["headers"])
        assert r2.status_code == 200
        assert r2.json()["is_following"] is True
        assert r2.json()["follower_count"] == count1, "duplicate follow bumped count"

    def test_public_profile_shows_follow_state(self, api, erin_auth, dancer2):
        erin_id = erin_auth["user_id"]
        r = api.get(f"{API}/users/{erin_id}", headers=dancer2["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("is_following_as_instructor") is True
        assert isinstance(body.get("instructor_follower_count"), int)
        assert body["instructor_follower_count"] >= 1

    def test_unfollow_clears_main_instructor(self, api, erin_auth, dancer2):
        erin_id = erin_auth["user_id"]
        # First set erin as main_instructor via PATCH
        r_set = api.patch(
            f"{API}/auth/me/main-instructor",
            headers=dancer2["headers"],
            json={"instructor_id": erin_id},
        )
        assert r_set.status_code == 200, r_set.text
        pre = _run(_get_user_doc(dancer2["user_id"]))
        assert pre.get("main_instructor_id") == erin_id

        # Now unfollow
        r = api.delete(
            f"{API}/instructors/{erin_id}/follow", headers=dancer2["headers"]
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["is_following"] is False
        assert isinstance(body["follower_count"], int)

        # user doc: instructor_ids no longer contains erin, main_instructor_id unset
        post = _run(_get_user_doc(dancer2["user_id"]))
        assert erin_id not in (post.get("instructor_ids") or [])
        assert not post.get("main_instructor_id"), (
            f"main_instructor_id should be unset, got {post.get('main_instructor_id')}"
        )

        # Public profile now shows is_following_as_instructor=False
        r2 = api.get(f"{API}/users/{erin_id}", headers=dancer2["headers"])
        assert r2.status_code == 200
        assert r2.json().get("is_following_as_instructor") is False

    def test_follow_unknown_user_404(self, api, dancer2):
        r = api.post(
            f"{API}/instructors/{uuid.uuid4()}/follow", headers=dancer2["headers"]
        )
        assert r.status_code == 404, r.text

    def test_follow_non_instructor_400(self, api, dancer, dancer2):
        # dancer is a plain user (non-instructor). dancer2 follows dancer -> 400
        r = api.post(
            f"{API}/instructors/{dancer['user_id']}/follow",
            headers=dancer2["headers"],
        )
        assert r.status_code == 400, r.text


# ============================================================
# 3. Event RSVP
# ============================================================
@pytest.fixture(scope="module")
def test_event(api, erin_auth):
    payload = {
        "name": "TEST RSVP Event",
        "description": "rsvp testing",
        "event_type": "workshop",
        "skill_level": "Beginner",
        "date": _future_date(30),
        "address": "1 RSVP Rd",
        "city": "Yuma",
        "state": "AZ",
        "zip_code": "85364",
        "country": "US",
        "is_published": True,
    }
    r = api.post(f"{API}/events", headers=erin_auth["headers"], json=payload)
    assert r.status_code == 200, f"create event: {r.status_code} {r.text}"
    eid = r.json()["id"]
    CREATED_EVENT_IDS.append(eid)
    return eid


class TestEventRSVP:
    def test_rsvp_going(self, api, dancer, test_event):
        r = api.post(
            f"{API}/events/{test_event}/rsvp",
            headers=dancer["headers"],
            json={"status": "going"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["status"] == "going"
        assert body["counts"]["going"] == 1
        assert body["counts"]["maybe"] == 0
        assert body["counts"]["declined"] == 0

    def test_rsvp_upsert_to_maybe(self, api, dancer, test_event):
        r = api.post(
            f"{API}/events/{test_event}/rsvp",
            headers=dancer["headers"],
            json={"status": "maybe"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "maybe"
        assert body["counts"] == {"going": 0, "maybe": 1, "declined": 0}

    def test_get_my_rsvp(self, api, dancer, test_event):
        r = api.get(
            f"{API}/events/{test_event}/rsvp/me", headers=dancer["headers"]
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "maybe"
        assert body["counts"]["maybe"] == 1

    def test_delete_rsvp(self, api, dancer, test_event):
        r = api.delete(
            f"{API}/events/{test_event}/rsvp", headers=dancer["headers"]
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["counts"] == {"going": 0, "maybe": 0, "declined": 0}
        # Verify GET shows empty status
        r2 = api.get(
            f"{API}/events/{test_event}/rsvp/me", headers=dancer["headers"]
        )
        assert r2.json()["status"] == ""

    def test_invalid_status_400(self, api, dancer, test_event):
        r = api.post(
            f"{API}/events/{test_event}/rsvp",
            headers=dancer["headers"],
            json={"status": "waffle"},
        )
        assert r.status_code == 400, r.text

    def test_unknown_event_404(self, api, dancer):
        r = api.post(
            f"{API}/events/{uuid.uuid4()}/rsvp",
            headers=dancer["headers"],
            json={"status": "going"},
        )
        assert r.status_code == 404, r.text


# ============================================================
# 4. Fan-out prefs integration (class_alerts filter)
# ============================================================
class TestFanoutPrefs:
    def test_muted_class_alerts_skips_ledger(
        self, api, erin_auth, dance_ids
    ):
        # Fresh dancer that follows Erin
        d = _mk_dancer(api)
        r_follow = api.post(
            f"{API}/instructors/{erin_auth['user_id']}/follow",
            headers=d["headers"],
        )
        assert r_follow.status_code == 200, r_follow.text

        # Mute class_alerts
        r_mute = api.patch(
            f"{API}/users/me/notification-prefs",
            headers=d["headers"],
            json={"class_alerts": False},
        )
        assert r_mute.status_code == 200
        assert r_mute.json()["prefs"]["class_alerts"] is False

        # Erin creates a new class
        payload = {
            "date": _future_date(45),
            "session_label": "TEST Muted Class",
            "dance_ids": dance_ids,
        }
        r_c = api.post(
            f"{API}/classes", headers=erin_auth["headers"], json=payload
        )
        assert r_c.status_code == 200, r_c.text
        cid = r_c.json()["id"]
        CREATED_CLASS_IDS.append(cid)
        time.sleep(0.5)

        # No ledger row for muted dancer
        row = _run(_find_ledger(d["user_id"], "class", cid))
        assert row is None, f"muted dancer should NOT get a ledger row: {row}"

        # Flip class_alerts back
        r_un = api.patch(
            f"{API}/users/me/notification-prefs",
            headers=d["headers"],
            json={"class_alerts": True},
        )
        assert r_un.status_code == 200
        assert r_un.json()["prefs"]["class_alerts"] is True

        # Erin creates another class
        payload2 = {
            "date": _future_date(46),
            "session_label": "TEST Unmuted Class",
            "dance_ids": dance_ids,
        }
        r_c2 = api.post(
            f"{API}/classes", headers=erin_auth["headers"], json=payload2
        )
        assert r_c2.status_code == 200
        cid2 = r_c2.json()["id"]
        CREATED_CLASS_IDS.append(cid2)
        time.sleep(0.5)

        # Ledger row present now
        row2 = _run(_find_ledger(d["user_id"], "class", cid2))
        assert row2 is not None, "unmuted dancer must receive a ledger row"
        assert row2["instructor_id"] == erin_auth["user_id"]


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
        if CREATED_EVENT_IDS:
            await db.events.delete_many({"id": {"$in": CREATED_EVENT_IDS}})
            await db.instructor_notifications.delete_many(
                {"entity_type": "event", "entity_id": {"$in": CREATED_EVENT_IDS}}
            )
            await db.event_rsvps.delete_many(
                {"event_id": {"$in": CREATED_EVENT_IDS}}
            )
        if CREATED_USER_IDS:
            await db.users.delete_many({"user_id": {"$in": CREATED_USER_IDS}})
            await db.instructor_notifications.delete_many(
                {"user_id": {"$in": CREATED_USER_IDS}}
            )
            await db.event_rsvps.delete_many(
                {"user_id": {"$in": CREATED_USER_IDS}}
            )

    try:
        asyncio.get_event_loop().run_until_complete(_do())
    except Exception as e:
        print(f"cleanup issue: {e}")
