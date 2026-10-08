"""Regression test for SEC-001 (2026-10-05).

The security audit found that a mutual block in `services/blocks.py` +
the `$nin` filter in `routes/chat.py::list_chat` could be weaponized by
a troublemaker to disappear from an admin's live chat view. Fix: when
the viewer is an admin, SKIP the mutual-block filter so proactive
moderation stays unimpaired. Personal block preferences still apply
to admins everywhere else in the app (profile views, DM, etc.).

This test guards against regressions where a future tweak drops the
`is_admin` branch and re-introduces the moderation blind spot.
"""
from __future__ import annotations

import asyncio
import os
import uuid

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

from _creds import ADMIN_EMAIL, ADMIN_PASSWORD, JAMIN_EMAIL, JAMIN_PASSWORD


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


CREATED_MESSAGE_IDS: list[str] = []
CREATED_USER_IDS: list[str] = []
BLOCK_ROWS_TO_CLEAN: list[tuple[str, str]] = []  # (blocker, blocked)


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
    assert r.status_code == 200
    data = r.json()
    return {
        "user_id": data["user"]["user_id"],
        "token": data["token"],
        "headers": {
            "Authorization": f"Bearer {data['token']}",
            "Content-Type": "application/json",
        },
    }


@pytest.fixture(scope="module")
def jamin_auth(api):
    r = api.post(
        f"{API}/auth/login",
        json={"email": JAMIN_EMAIL, "password": JAMIN_PASSWORD},
    )
    assert r.status_code == 200
    data = r.json()
    return {
        "user_id": data["user"]["user_id"],
        "token": data["token"],
        "headers": {
            "Authorization": f"Bearer {data['token']}",
            "Content-Type": "application/json",
        },
    }


@pytest.fixture(scope="module")
def nonadmin_instructor(api):
    """Fresh non-admin instructor so we can test the "personal block
    preferences still work for ordinary users" branch."""
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_sec001_{suffix}@example.com"
    r = api.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": "Px9#tTest!",
            "name": f"Non-admin {suffix}",
            "accepted_terms_version": "2026-06-24",
        },
    )
    assert r.status_code == 200
    data = r.json()
    uid = data["user"]["user_id"]
    CREATED_USER_IDS.append(uid)
    # Promote to instructor so they can hit /chat/messages (require_instructor).

    async def _promote():
        await _mongo().users.update_one(
            {"user_id": uid},
            {"$set": {"is_instructor": True, "roles.instructor": True}},
        )
    _run(_promote())
    return {
        "user_id": uid,
        "token": data["token"],
        "headers": {
            "Authorization": f"Bearer {data['token']}",
            "Content-Type": "application/json",
        },
    }


def _post_block(api, auth, blocked_uid: str) -> None:
    r = api.post(
        f"{API}/blocks",
        headers=auth["headers"],
        json={"user_id": blocked_uid},
    )
    assert r.status_code == 200, f"block: {r.status_code} {r.text}"
    BLOCK_ROWS_TO_CLEAN.append((auth["user_id"], blocked_uid))


class TestSec001ModerationBlindSpot:
    """Admin MUST see the content of a user who blocked them; a
    non-admin MUST still have their block filter respected."""

    def test_admin_sees_canary_from_blocker(
        self, api, admin_auth, jamin_auth
    ):
        suffix = uuid.uuid4().hex[:6]
        # Jamin posts a canary.
        r = api.post(
            f"{API}/chat/messages",
            headers=jamin_auth["headers"],
            json={"message": f"TEST sec001 canary {suffix}"},
        )
        assert r.status_code == 200
        canary_id = r.json()["id"]
        CREATED_MESSAGE_IDS.append(canary_id)

        # Jamin blocks the admin.
        _post_block(api, jamin_auth, admin_auth["user_id"])

        # Admin reads chat — should see the canary despite the block.
        r = api.get(
            f"{API}/chat/messages?limit=50", headers=admin_auth["headers"]
        )
        assert r.status_code == 200
        ids = [m.get("id") for m in r.json()]
        assert canary_id in ids, (
            "SEC-001 regression: admin must see chat from users who "
            "block them so proactive moderation isn't bypassed"
        )

    def test_nonadmin_block_still_hides_canary(
        self, api, jamin_auth, nonadmin_instructor
    ):
        suffix = uuid.uuid4().hex[:6]
        r = api.post(
            f"{API}/chat/messages",
            headers=jamin_auth["headers"],
            json={"message": f"TEST sec001 nonadmin canary {suffix}"},
        )
        assert r.status_code == 200
        canary_id = r.json()["id"]
        CREATED_MESSAGE_IDS.append(canary_id)

        _post_block(api, jamin_auth, nonadmin_instructor["user_id"])

        r = api.get(
            f"{API}/chat/messages?limit=100",
            headers=nonadmin_instructor["headers"],
        )
        assert r.status_code == 200
        ids = [m.get("id") for m in r.json()]
        assert canary_id not in ids, (
            "Non-admin viewer must NOT see messages from users who "
            "blocked them (personal block preference must still work)"
        )


# ---------------- Cleanup -----------------
@pytest.fixture(scope="module", autouse=True)
def _cleanup():
    yield

    async def _do():
        db = _mongo()
        if CREATED_MESSAGE_IDS:
            await db.instructor_messages.delete_many(
                {"id": {"$in": CREATED_MESSAGE_IDS}}
            )
        if BLOCK_ROWS_TO_CLEAN:
            for blocker, blocked in BLOCK_ROWS_TO_CLEAN:
                await db.user_blocks.delete_many(
                    {"blocker_id": blocker, "blocked_id": blocked}
                )
        if CREATED_USER_IDS:
            await db.users.delete_many(
                {"user_id": {"$in": CREATED_USER_IDS}}
            )

    try:
        _run(_do())
    except Exception as e:
        print(f"cleanup issue: {e}")
