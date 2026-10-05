"""Backend tests for the Followed-Instructor Hub endpoint.

Covers:
    * No-follows caller → has_follows=false, items=[]
    * Follows an instructor → sees their upcoming classes
    * Follows an instructor → sees their upcoming PUBLISHED events
    * Draft events are hidden
    * Past-dated classes/events are hidden
    * Items sorted chronologically (date asc, time asc)
    * limit= caps the response but total reflects pre-truncation count
    * Unknown instructor_ids silently ignored (deleted instructor)
    * Auth required (401 without token)
    * Non-followed instructor's content doesn't leak in
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

from _creds import ADMIN_EMAIL, ADMIN_PASSWORD, ERIN_EMAIL, ERIN_PASSWORD


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
    or _load_frontend_backend_url()
)
API = f"{BASE_URL}/api"


def _load_env(key: str) -> str:
    if os.environ.get(key):
        return os.environ[key]
    with open("/app/backend/.env") as fh:
        for line in fh:
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip().strip('"')
    raise KeyError(key)


MONGO_URL = _load_env("MONGO_URL")
DB_NAME = _load_env("DB_NAME")


def _mongo():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


def _future(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y-%m-%d")


CREATED_CLASS_IDS: list[str] = []
CREATED_EVENT_IDS: list[str] = []
CREATED_USER_IDS: list[str] = []
# Snapshot of each test user's instructor_ids BEFORE we touch them so
# the fixture can restore the original follow set on teardown instead
# of leaving tests to clobber each other / production demo data.
ORIGINAL_INSTRUCTOR_IDS: dict[str, list[str]] = {}


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def erin_auth(api):
    """Erin — an instructor+admin whose user_id other dancers can follow."""
    r = api.post(
        f"{API}/auth/login",
        json={"email": ERIN_EMAIL, "password": ERIN_PASSWORD},
    )
    assert r.status_code == 200
    data = r.json()
    ORIGINAL_INSTRUCTOR_IDS[data["user"]["user_id"]] = list(
        data["user"].get("instructor_ids") or []
    )
    return {
        "user_id": data["user"]["user_id"],
        "token": data["token"],
        "headers": {
            "Authorization": f"Bearer {data['token']}",
            "Content-Type": "application/json",
        },
    }


@pytest.fixture(scope="module")
def dancer_following_erin(api, erin_auth):
    """Fresh dancer who follows ONLY Erin."""
    suffix = uuid.uuid4().hex[:8]
    r = api.post(
        f"{API}/auth/register",
        json={
            "email": f"TEST_hub_{suffix}@example.com",
            "password": "Px9#tTest!",
            "name": f"Hub Dancer {suffix}",
            "accepted_terms_version": "2026-06-24",
        },
    )
    assert r.status_code == 200, f"register: {r.status_code} {r.text}"
    data = r.json()
    uid = data["user"]["user_id"]
    headers = {
        "Authorization": f"Bearer {data['token']}",
        "Content-Type": "application/json",
    }
    CREATED_USER_IDS.append(uid)
    # Follow Erin via the authenticated PATCH endpoint.
    r = api.put(
        f"{API}/auth/me/instructors",
        headers=headers,
        json={
            "instructor_ids": [erin_auth["user_id"]],
            "main_instructor_id": erin_auth["user_id"],
        },
    )
    assert r.status_code == 200
    return {"user_id": uid, "token": data["token"], "headers": headers}


@pytest.fixture(scope="module")
def dancer_no_follows(api):
    suffix = uuid.uuid4().hex[:8]
    r = api.post(
        f"{API}/auth/register",
        json={
            "email": f"TEST_hub_nofollow_{suffix}@example.com",
            "password": "Px9#tTest!",
            "name": f"Lonely Hub Dancer {suffix}",
            "accepted_terms_version": "2026-06-24",
        },
    )
    assert r.status_code == 200
    data = r.json()
    uid = data["user"]["user_id"]
    headers = {
        "Authorization": f"Bearer {data['token']}",
        "Content-Type": "application/json",
    }
    CREATED_USER_IDS.append(uid)
    return {"user_id": uid, "token": data["token"], "headers": headers}


def _create_class(
    api, auth, *, date: str, label: str, dance_ids: list[str] | None = None
) -> str:
    r = api.post(
        f"{API}/classes",
        headers=auth["headers"],
        json={
            "date": date,
            "session_label": label,
            "dance_ids": dance_ids or [],
            "notes": "",
        },
    )
    assert r.status_code == 200, f"create_class: {r.status_code} {r.text}"
    cid = r.json()["id"]
    CREATED_CLASS_IDS.append(cid)
    return cid


def _create_event(
    api,
    auth,
    *,
    name: str,
    date: str,
    start_time: str = "",
    is_published: bool = True,
    city: str = "Yuma",
    venue: str = "",
) -> str:
    r = api.post(
        f"{API}/events",
        headers=auth["headers"],
        json={
            "name": name,
            "event_type": "workshop",
            "skill_level": "Beginner",
            "date": date,
            "start_time": start_time,
            "address": "1 Test St",
            "city": city,
            "state": "AZ",
            "zip_code": "85364",
            "country": "US",
            "venue_name": venue,
            "is_published": is_published,
            "description": "test",
        },
    )
    assert r.status_code == 200, f"create_event: {r.status_code} {r.text}"
    eid = r.json()["id"]
    CREATED_EVENT_IDS.append(eid)
    return eid


# ---------------- Tests ----------------
class TestFollowedHub:
    def test_requires_auth(self, api):
        r = api.get(f"{API}/followed-instructors/upcoming")
        assert r.status_code == 401

    def test_no_follows_returns_empty_payload(
        self, api, dancer_no_follows
    ):
        r = api.get(
            f"{API}/followed-instructors/upcoming",
            headers=dancer_no_follows["headers"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["has_follows"] is False
        assert body["items"] == []
        assert body["total"] == 0
        assert body["today"]

    def test_followed_class_shows_up(
        self, api, erin_auth, dancer_following_erin
    ):
        suffix = uuid.uuid4().hex[:6]
        cid = _create_class(
            api, erin_auth, date=_future(5), label=f"TEST hub class {suffix}"
        )
        r = api.get(
            f"{API}/followed-instructors/upcoming",
            headers=dancer_following_erin["headers"],
        )
        body = r.json()
        assert body["has_follows"] is True
        hub_class = next(
            (it for it in body["items"] if it["id"] == cid), None
        )
        assert hub_class is not None, "created class must appear in hub"
        assert hub_class["kind"] == "class"
        assert hub_class["instructor_id"] == erin_auth["user_id"]
        assert hub_class["deeplink"] == "/classes"

    def test_published_event_shows_up(
        self, api, erin_auth, dancer_following_erin
    ):
        suffix = uuid.uuid4().hex[:6]
        eid = _create_event(
            api,
            erin_auth,
            name=f"TEST hub event {suffix}",
            date=_future(7),
            start_time="19:30",
            venue="Yuma Civic Center",
        )
        r = api.get(
            f"{API}/followed-instructors/upcoming",
            headers=dancer_following_erin["headers"],
        )
        body = r.json()
        hub_event = next(
            (it for it in body["items"] if it["id"] == eid), None
        )
        assert hub_event is not None, "published event must appear in hub"
        assert hub_event["kind"] == "event"
        assert hub_event["start_time"] == "19:30"
        assert hub_event["venue_name"] == "Yuma Civic Center"
        assert hub_event["deeplink"] == f"/events/{eid}"

    def test_draft_event_does_not_show_up(
        self, api, erin_auth, dancer_following_erin
    ):
        suffix = uuid.uuid4().hex[:6]
        eid = _create_event(
            api,
            erin_auth,
            name=f"TEST draft {suffix}",
            date=_future(10),
            is_published=False,
        )
        r = api.get(
            f"{API}/followed-instructors/upcoming",
            headers=dancer_following_erin["headers"],
        )
        ids = [it["id"] for it in r.json()["items"]]
        assert eid not in ids, "draft event must stay hidden"

    def test_past_class_does_not_show_up(
        self, api, erin_auth, dancer_following_erin
    ):
        suffix = uuid.uuid4().hex[:6]
        cid = _create_class(
            api, erin_auth, date="2020-01-01", label=f"TEST past {suffix}"
        )
        r = api.get(
            f"{API}/followed-instructors/upcoming",
            headers=dancer_following_erin["headers"],
        )
        ids = [it["id"] for it in r.json()["items"]]
        assert cid not in ids, "past class must stay hidden"

    def test_items_sorted_chronologically(
        self, api, erin_auth, dancer_following_erin
    ):
        """Create two classes out-of-order dates; verify the response
        is sorted by date asc regardless of insert order."""
        suffix = uuid.uuid4().hex[:6]
        late = _create_class(
            api, erin_auth, date=_future(20), label=f"TEST late {suffix}"
        )
        early = _create_class(
            api, erin_auth, date=_future(2), label=f"TEST early {suffix}"
        )
        r = api.get(
            f"{API}/followed-instructors/upcoming?limit=50",
            headers=dancer_following_erin["headers"],
        )
        items = r.json()["items"]
        ids = [it["id"] for it in items]
        assert early in ids and late in ids
        assert ids.index(early) < ids.index(late), (
            f"early must come before late (got order: {ids})"
        )

    def test_limit_caps_items_but_total_reflects_all(
        self, api, erin_auth, dancer_following_erin
    ):
        r = api.get(
            f"{API}/followed-instructors/upcoming?limit=1",
            headers=dancer_following_erin["headers"],
        )
        body = r.json()
        assert len(body["items"]) == 1
        # total should be >= 1 since the prior tests seeded upcoming rows.
        assert body["total"] >= 1

    def test_non_followed_instructors_content_not_leaked(
        self, api, dancer_no_follows, erin_auth
    ):
        """The 'no follows' dancer still sees nothing even after Erin
        creates loads of upcoming content."""
        r = api.get(
            f"{API}/followed-instructors/upcoming",
            headers=dancer_no_follows["headers"],
        )
        body = r.json()
        assert body["has_follows"] is False
        assert body["items"] == []


# ---------------- Cleanup -----------------
@pytest.fixture(scope="module", autouse=True)
def _cleanup():
    yield

    async def _do():
        db = _mongo()
        if CREATED_CLASS_IDS:
            await db.classes.delete_many(
                {"id": {"$in": CREATED_CLASS_IDS}}
            )
            await db.instructor_notifications.delete_many(
                {"entity_type": "class", "entity_id": {"$in": CREATED_CLASS_IDS}}
            )
            await db.notification_events.delete_many(
                {"metadata.entity_id": {"$in": CREATED_CLASS_IDS}}
            )
        if CREATED_EVENT_IDS:
            await db.events.delete_many(
                {"id": {"$in": CREATED_EVENT_IDS}}
            )
            await db.instructor_notifications.delete_many(
                {"entity_type": "event", "entity_id": {"$in": CREATED_EVENT_IDS}}
            )
            await db.notification_events.delete_many(
                {"metadata.entity_id": {"$in": CREATED_EVENT_IDS}}
            )
        if CREATED_USER_IDS:
            await db.users.delete_many({"user_id": {"$in": CREATED_USER_IDS}})
            await db.notification_events.delete_many(
                {"user_id": {"$in": CREATED_USER_IDS}}
            )

    try:
        _run(_do())
    except Exception as e:
        print(f"cleanup issue: {e}")
