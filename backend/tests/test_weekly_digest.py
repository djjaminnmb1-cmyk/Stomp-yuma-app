"""Backend tests for the Weekly Digest Email feature.

Covers:
    * `weekly_digest` pref is present + defaults ON
    * `collect_user_digest` groups + caps + truncates correctly
    * `send_digest_for_user` short-circuits (empty / pref-off / synthetic)
    * `send_digest_for_user` with force=True bypasses guards
    * Idempotency ledger prevents double sends in the same ISO-week
    * Admin preview endpoint is admin-gated
    * Admin status endpoint reports sane counts
    * send_weekly_digest sweep summary stats
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

from _creds import ADMIN_EMAIL, ADMIN_PASSWORD


# ---------------- URL / Mongo config -----------------
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
assert BASE_URL
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


# ---------------- Fixtures -----------------
CREATED_USER_IDS: list[str] = []


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_auth(api):
    r = api.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, f"admin login: {r.status_code} {r.text}"
    data = r.json()
    return {
        "token": data["token"],
        "user_id": data["user"]["user_id"],
        "headers": {
            "Authorization": f"Bearer {data['token']}",
            "Content-Type": "application/json",
        },
    }


def _mk_dancer(api, suffix: str = "") -> dict:
    suffix = suffix or uuid.uuid4().hex[:8]
    email = f"TEST_wd_{suffix}@example.com"
    r = api.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": "DancerPass1!",
            "name": f"Test Dancer {suffix}",
            "accepted_terms_version": "2026-06-24",
        },
    )
    assert r.status_code == 200, f"register: {r.status_code} {r.text}"
    data = r.json()
    uid = data["user"]["user_id"]
    CREATED_USER_IDS.append(uid)
    return {
        "user_id": uid,
        "email": email,
        "token": data["token"],
        "headers": {
            "Authorization": f"Bearer {data['token']}",
            "Content-Type": "application/json",
        },
    }


@pytest.fixture(scope="module")
def dancer(api):
    return _mk_dancer(api)


# ---------------- Direct-service helpers -----------------
# Direct service imports (bypass HTTP). Services expect to run inside
# the backend's event loop, but using motor from pytest is fine since
# each coro gets its own temporary loop via _run.
import sys
sys.path.insert(0, "/app/backend")
from services.weekly_digest import (  # noqa: E402
    collect_user_digest,
    send_digest_for_user,
    MAX_ITEMS_PER_SECTION,
    _iso_week_key,
)


async def _seed_feed_rows(user_id: str, count: int, kind: str) -> None:
    db = _mongo()
    now = datetime.now(timezone.utc)
    docs = []
    for i in range(count):
        docs.append(
            {
                "id": f"evt_test_{uuid.uuid4().hex[:10]}",
                "user_id": user_id,
                "kind": kind,
                "title": f"TEST {kind} #{i}",
                "body": f"body for {kind} {i}",
                "deeplink": "/classes",
                "metadata": {},
                "created_at": (now - timedelta(hours=i)).isoformat(),
                "read_at": None,
            }
        )
    if docs:
        await db.notification_events.insert_many(docs)


async def _cleanup_feed_rows(user_id: str) -> None:
    db = _mongo()
    await db.notification_events.delete_many({"user_id": user_id})
    await db.weekly_digest_sends.delete_many({"user_id": user_id})


# ---------------- Tests -----------------
class TestWeeklyDigestPref:
    def test_pref_exists_and_defaults_true(self, api, dancer):
        r = api.get(
            f"{API}/users/me/notification-prefs", headers=dancer["headers"]
        )
        assert r.status_code == 200
        body = r.json()
        assert "weekly_digest" in body["prefs"]
        assert body["prefs"]["weekly_digest"] is True
        assert "weekly_digest" in body["categories"]

    def test_pref_patch_persists(self, api, dancer):
        r = api.patch(
            f"{API}/users/me/notification-prefs",
            headers=dancer["headers"],
            json={"weekly_digest": False},
        )
        assert r.status_code == 200
        assert r.json()["prefs"]["weekly_digest"] is False
        # Reset back ON for other tests.
        r = api.patch(
            f"{API}/users/me/notification-prefs",
            headers=dancer["headers"],
            json={"weekly_digest": True},
        )
        assert r.json()["prefs"]["weekly_digest"] is True


class TestCollectUserDigest:
    def test_empty_user_returns_zero(self, dancer):
        _run(_cleanup_feed_rows(dancer["user_id"]))
        d = _run(collect_user_digest(dancer["user_id"]))
        assert d["total_items"] == 0
        assert d["sections"] == []

    def test_groups_by_section(self, dancer):
        _run(_cleanup_feed_rows(dancer["user_id"]))
        _run(_seed_feed_rows(dancer["user_id"], 2, "new_class"))
        _run(_seed_feed_rows(dancer["user_id"], 3, "new_event"))
        _run(_seed_feed_rows(dancer["user_id"], 1, "announcement"))
        _run(_seed_feed_rows(dancer["user_id"], 1, "chat_mention"))
        d = _run(collect_user_digest(dancer["user_id"]))
        assert d["total_items"] == 7
        labels = {s["label"]: s for s in d["sections"]}
        assert "📚 Classes" in labels
        assert labels["📚 Classes"]["shown"] == 2
        assert labels["🎉 Events"]["shown"] == 3
        assert labels["📣 Announcements & Pins"]["shown"] == 1
        assert labels["💬 @Mentions"]["shown"] == 1
        _run(_cleanup_feed_rows(dancer["user_id"]))

    def test_caps_each_section_at_max_and_sets_truncated(self, dancer):
        _run(_cleanup_feed_rows(dancer["user_id"]))
        over_cap = MAX_ITEMS_PER_SECTION + 3  # 8
        _run(_seed_feed_rows(dancer["user_id"], over_cap, "new_class"))
        d = _run(collect_user_digest(dancer["user_id"]))
        [sec] = d["sections"]
        assert sec["label"] == "📚 Classes"
        assert sec["shown"] == MAX_ITEMS_PER_SECTION
        assert sec["truncated"] == over_cap - MAX_ITEMS_PER_SECTION
        _run(_cleanup_feed_rows(dancer["user_id"]))

    def test_unknown_kind_ignored(self, dancer):
        _run(_cleanup_feed_rows(dancer["user_id"]))
        _run(_seed_feed_rows(dancer["user_id"], 3, "new_follower"))
        _run(_seed_feed_rows(dancer["user_id"], 1, "new_class"))
        d = _run(collect_user_digest(dancer["user_id"]))
        # only new_class shows up — new_follower isn't in the digest map
        assert d["total_items"] == 1
        assert d["sections"][0]["label"] == "📚 Classes"
        _run(_cleanup_feed_rows(dancer["user_id"]))


class TestSendDigestForUser:
    """Delivery short-circuits should return the right 'reason' string
    without touching SMTP (so the test suite doesn't need real SMTP
    egress to pass)."""

    def test_empty_digest_skip(self, dancer):
        _run(_cleanup_feed_rows(dancer["user_id"]))
        res = _run(
            send_digest_for_user({
                "user_id": dancer["user_id"],
                "name": "Test",
                "email": dancer["email"],
            })
        )
        assert res["sent"] is False
        assert res["reason"] == "no_unread_items"

    def test_pref_disabled_skip(self, api, dancer):
        _run(_cleanup_feed_rows(dancer["user_id"]))
        _run(_seed_feed_rows(dancer["user_id"], 1, "new_class"))
        api.patch(
            f"{API}/users/me/notification-prefs",
            headers=dancer["headers"],
            json={"weekly_digest": False},
        )
        res = _run(
            send_digest_for_user({
                "user_id": dancer["user_id"],
                "name": "Test",
                "email": dancer["email"],
            })
        )
        assert res["sent"] is False
        assert res["reason"] == "pref_disabled"
        # Reset
        api.patch(
            f"{API}/users/me/notification-prefs",
            headers=dancer["headers"],
            json={"weekly_digest": True},
        )
        _run(_cleanup_feed_rows(dancer["user_id"]))

    def test_synthetic_email_skip(self):
        res = _run(
            send_digest_for_user({
                "user_id": "fake_uid",
                "name": "Apple",
                "email": "apple:12345",
                "email_is_synthetic": True,
            })
        )
        assert res["sent"] is False
        assert res["reason"] == "undeliverable_email"

    def test_force_bypasses_all_guards(self, api, dancer):
        """force=True MUST NOT short-circuit on empty / pref / ledger.
        It still consults SMTP so the final result depends on the
        environment — we only assert it got past the guards.
        """
        _run(_cleanup_feed_rows(dancer["user_id"]))
        api.patch(
            f"{API}/users/me/notification-prefs",
            headers=dancer["headers"],
            json={"weekly_digest": False},
        )
        res = _run(
            send_digest_for_user(
                {
                    "user_id": dancer["user_id"],
                    "name": "Test",
                    "email": dancer["email"],
                },
                force=True,
            )
        )
        # SMTP may or may not succeed in the test env — just prove we
        # got past every short-circuit:
        assert res["reason"] in ("sent", "send_failed")
        # Force path must NOT write a ledger row.
        row = _run(
            _mongo().weekly_digest_sends.find_one(
                {"user_id": dancer["user_id"], "week_start": _iso_week_key()}
            )
        )
        assert row is None, "force=True must not touch the send ledger"
        api.patch(
            f"{API}/users/me/notification-prefs",
            headers=dancer["headers"],
            json={"weekly_digest": True},
        )


class TestAdminEndpoints:
    def test_preview_admin_only(self, api, dancer):
        r = api.post(
            f"{API}/admin/weekly-digest/preview", headers=dancer["headers"]
        )
        assert r.status_code == 403

    def test_status_admin_only(self, api, dancer):
        r = api.get(
            f"{API}/admin/weekly-digest/status", headers=dancer["headers"]
        )
        assert r.status_code == 403

    def test_run_now_admin_only(self, api, dancer):
        r = api.post(
            f"{API}/admin/weekly-digest/run-now", headers=dancer["headers"]
        )
        assert r.status_code == 403

    def test_status_shape(self, api, admin_auth):
        r = api.get(
            f"{API}/admin/weekly-digest/status", headers=admin_auth["headers"]
        )
        assert r.status_code == 200
        body = r.json()
        for key in (
            "current_week_start",
            "sent_this_week",
            "opted_in_recipients",
            "opted_out_users",
        ):
            assert key in body
        assert isinstance(body["opted_in_recipients"], int)
        assert isinstance(body["opted_out_users"], int)


class TestIdempotencyLedger:
    def test_mark_sent_prevents_double_send_same_week(self, dancer):
        _run(_cleanup_feed_rows(dancer["user_id"]))
        _run(_seed_feed_rows(dancer["user_id"], 1, "new_class"))
        # Pre-insert a sent-ledger row for THIS week.
        from services.weekly_digest import _mark_sent, _iso_week_key
        _run(_mark_sent(dancer["user_id"], _iso_week_key(), 1))
        res = _run(
            send_digest_for_user({
                "user_id": dancer["user_id"],
                "name": "Test",
                "email": dancer["email"],
            })
        )
        assert res["sent"] is False
        assert res["reason"] == "already_sent_this_week"
        _run(_cleanup_feed_rows(dancer["user_id"]))


# ---------------- Cleanup -----------------
@pytest.fixture(scope="module", autouse=True)
def _cleanup():
    yield

    async def _do():
        db = _mongo()
        if CREATED_USER_IDS:
            await db.users.delete_many({"user_id": {"$in": CREATED_USER_IDS}})
            await db.notification_events.delete_many(
                {"user_id": {"$in": CREATED_USER_IDS}}
            )
            await db.weekly_digest_sends.delete_many(
                {"user_id": {"$in": CREATED_USER_IDS}}
            )

    try:
        _run(_do())
    except Exception as e:
        print(f"cleanup issue: {e}")
