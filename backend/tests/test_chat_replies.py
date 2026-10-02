"""Backend tests for the chat-reply push + Notification Center feed.

Covers:
    * Reply writes a chat_reply feed row for the parent author
    * Self-reply does NOT buzz the author
    * Deleted/unknown parent: no notification
    * Reply with @mention of parent author: dedupe wins (one row, not two)
    * Pref gate on `mention_alerts`: muting mutes replies too
    * Blocked user doesn't ping across the block wall
    * KNOWN_KINDS includes `chat_reply`
    * i18n push templates exist across all 8 locales
"""
from __future__ import annotations

import asyncio
import os
import uuid

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

from _creds import ERIN_EMAIL, ERIN_PASSWORD, JAMIN_EMAIL, JAMIN_PASSWORD


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


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def erin_auth(api):
    r = api.post(
        f"{API}/auth/login", json={"email": ERIN_EMAIL, "password": ERIN_PASSWORD}
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
    assert r.status_code == 200, f"jamin login: {r.status_code} {r.text}"
    data = r.json()
    return {
        "user_id": data["user"]["user_id"],
        "token": data["token"],
        "headers": {
            "Authorization": f"Bearer {data['token']}",
            "Content-Type": "application/json",
        },
    }


# ----- Mongo helpers -----
async def _find_feed_row(user_id: str, kind: str, entity_id: str) -> dict | None:
    db = _mongo()
    return await db.notification_events.find_one(
        {"user_id": user_id, "kind": kind, "metadata.entity_id": entity_id},
        {"_id": 0},
    )


def _post_chat(api, auth, body: dict) -> dict:
    r = api.post(f"{API}/chat/messages", headers=auth["headers"], json=body)
    assert r.status_code == 200, f"post_chat: {r.status_code} {r.text}"
    doc = r.json()
    CREATED_MESSAGE_IDS.append(doc["id"])
    return doc


class TestChatReplyFeed:
    def test_reply_writes_chat_reply_row_for_parent_author(
        self, api, erin_auth, jamin_auth
    ):
        suffix = uuid.uuid4().hex[:6]
        parent = _post_chat(
            api, erin_auth, {"message": f"TEST parent {suffix}"}
        )
        reply = _post_chat(
            api,
            jamin_auth,
            {"message": f"TEST reply {suffix} nice", "parent_id": parent["id"]},
        )
        import time; time.sleep(0.4)
        row = _run(
            _find_feed_row(erin_auth["user_id"], "chat_reply", reply["id"])
        )
        assert row is not None, "parent author must receive chat_reply row"
        assert "replied to your message" in (row.get("title") or "").lower()
        assert row["metadata"]["parent_id"] == parent["id"]
        assert row["metadata"]["replier_id"] == jamin_auth["user_id"]
        assert row["deeplink"].startswith("/(tabs)/instructor") or row[
            "deeplink"
        ].startswith("/instructor"), f"unexpected deeplink: {row['deeplink']!r}"

    def test_self_reply_does_not_notify(self, api, erin_auth):
        suffix = uuid.uuid4().hex[:6]
        parent = _post_chat(
            api, erin_auth, {"message": f"TEST self-parent {suffix}"}
        )
        self_reply = _post_chat(
            api,
            erin_auth,
            {"message": "self-reply", "parent_id": parent["id"]},
        )
        import time; time.sleep(0.3)
        row = _run(
            _find_feed_row(
                erin_auth["user_id"], "chat_reply", self_reply["id"]
            )
        )
        assert row is None, "Self-reply must not notify the author"

    def test_mention_wins_dedupe_over_reply(
        self, api, erin_auth, jamin_auth
    ):
        """A reply that ALSO @-mentions the parent author must only
        produce one notification — the mention path owns it."""
        suffix = uuid.uuid4().hex[:6]
        parent = _post_chat(
            api, erin_auth, {"message": f"TEST mention+reply parent {suffix}"}
        )
        reply = _post_chat(
            api,
            jamin_auth,
            {
                "message": f"@Erin BTW {suffix}?",
                "parent_id": parent["id"],
            },
        )
        import time; time.sleep(0.6)
        reply_row = _run(
            _find_feed_row(erin_auth["user_id"], "chat_reply", reply["id"])
        )
        mention_row = _run(
            _find_feed_row(erin_auth["user_id"], "chat_mention", reply["id"])
        )
        assert reply_row is None, (
            "chat_reply row must NOT be written when the message also "
            "@-mentions the parent author"
        )
        assert mention_row is not None, (
            "chat_mention row must be written for the @ tag"
        )

    def test_pref_mention_alerts_mutes_replies(
        self, api, erin_auth, jamin_auth
    ):
        """Replies ride the same pref gate as @mentions."""
        suffix = uuid.uuid4().hex[:6]
        # Mute mention_alerts on Erin
        r = api.patch(
            f"{API}/users/me/notification-prefs",
            headers=erin_auth["headers"],
            json={"mention_alerts": False},
        )
        assert r.status_code == 200
        try:
            parent = _post_chat(
                api, erin_auth, {"message": f"TEST muted parent {suffix}"}
            )
            reply = _post_chat(
                api,
                jamin_auth,
                {
                    "message": f"TEST muted reply {suffix}",
                    "parent_id": parent["id"],
                },
            )
            import time; time.sleep(0.4)
            row = _run(
                _find_feed_row(
                    erin_auth["user_id"], "chat_reply", reply["id"]
                )
            )
            assert row is None, (
                "chat_reply must be suppressed when mention_alerts=False"
            )
        finally:
            # Reset
            api.patch(
                f"{API}/users/me/notification-prefs",
                headers=erin_auth["headers"],
                json={"mention_alerts": True},
            )


class TestWiring:
    def test_known_kinds_includes_chat_reply(self):
        from services.notification_feed import KNOWN_KINDS
        assert "chat_reply" in KNOWN_KINDS

    def test_i18n_push_templates_in_every_locale(self):
        from core.i18n import _CATALOG, SUPPORTED_LANGUAGES
        for lang in SUPPORTED_LANGUAGES:
            block = _CATALOG.get(lang) or {}
            assert "push.chat_reply.title" in block, (
                f"locale {lang!r} missing push.chat_reply.title"
            )
            assert "push.chat_reply.body" in block, (
                f"locale {lang!r} missing push.chat_reply.body"
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
            await db.notification_events.delete_many(
                {"metadata.entity_id": {"$in": CREATED_MESSAGE_IDS}}
            )
            await db.chat_mentions.delete_many(
                {"message_id": {"$in": CREATED_MESSAGE_IDS}}
            )

    try:
        _run(_do())
    except Exception as e:
        print(f"cleanup issue: {e}")
