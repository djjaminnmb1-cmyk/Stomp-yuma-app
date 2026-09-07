"""Tests for the new `chat_alerts` notification-preferences category,
the chat-post fan-out helper, and the app.config.js orientation flip.

Coverage
--------
* notification_prefs endpoint exposes ``chat_alerts`` in both the prefs
  dict and the ``categories`` list.
* PATCH round-trips ``chat_alerts`` and does not clobber other keys.
* PATCH ignores unknown keys.
* POST /api/chat/messages succeeds as instructor / admin even when the
  push key is a placeholder (should not 500).
* The fan-out helper excludes: poster, users with chat_alerts=false,
  and anyone in ``already_notified``.
* Non-instructor users can still fetch / PATCH their own prefs.
* Mention flow: posting `Hi @Erin` returns a doc that includes Erin
  in ``mentioned_user_ids`` and Erin is de-duped from the chat_post
  fan-out via ``already_notified``.
* app.config.js declares ``orientation: "default"``.
"""
import asyncio
import os
import re
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get(
    "EXPO_BACKEND_URL"
)
if not BASE_URL:
    # fall back to frontend/.env
    try:
        with open("/app/frontend/.env") as fh:
            for line in fh:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"')
                    break
    except FileNotFoundError:
        pass
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
BASE_URL = BASE_URL.rstrip("/")

ADMIN_EMAIL = "admin@stompinground.com"
ADMIN_PASSWORD = "C^c+9$ii4y@_L1mU4sl5BTOd"
ERIN_EMAIL = "erinboroughs@gmail.com"
ERIN_PASSWORD = "Stompin2026!"


# ------------------------------ helpers ------------------------------
def _login(session: requests.Session, email: str, password: str) -> dict:
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("token")
    return body


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin(http):
    body = _login(http, ADMIN_EMAIL, ADMIN_PASSWORD)
    return {
        "token": body["token"],
        "user": body["user"],
        "headers": {"Authorization": f"Bearer {body['token']}"},
    }


@pytest.fixture(scope="module")
def erin(http):
    body = _login(http, ERIN_EMAIL, ERIN_PASSWORD)
    return {
        "token": body["token"],
        "user": body["user"],
        "headers": {"Authorization": f"Bearer {body['token']}"},
    }


# ------------------------ notification-prefs -------------------------
class TestNotificationPrefsChatAlerts:
    def test_get_prefs_exposes_chat_alerts(self, http, admin):
        r = http.get(
            f"{BASE_URL}/api/users/me/notification-prefs",
            headers=admin["headers"],
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "prefs" in body and "categories" in body
        assert "chat_alerts" in body["categories"], body["categories"]
        assert "chat_alerts" in body["prefs"], body["prefs"]
        # opt-out semantics: fresh users default to True
        assert isinstance(body["prefs"]["chat_alerts"], bool)

    def test_patch_chat_alerts_persists_and_does_not_clobber(self, http, admin):
        # snapshot other categories
        r0 = http.get(
            f"{BASE_URL}/api/users/me/notification-prefs",
            headers=admin["headers"],
            timeout=10,
        )
        snap = r0.json()["prefs"]

        # flip to false
        r1 = http.patch(
            f"{BASE_URL}/api/users/me/notification-prefs",
            headers=admin["headers"],
            json={"chat_alerts": False},
            timeout=10,
        )
        assert r1.status_code == 200, r1.text
        prefs = r1.json()["prefs"]
        assert prefs["chat_alerts"] is False
        # other categories preserved
        for k in (
            "class_alerts",
            "event_alerts",
            "choreographer_alerts",
            "mention_alerts",
            "reminder_alerts",
        ):
            assert prefs.get(k) == snap.get(k), (
                f"{k} was clobbered: {snap.get(k)} -> {prefs.get(k)}"
            )

        # verify GET returns false
        r2 = http.get(
            f"{BASE_URL}/api/users/me/notification-prefs",
            headers=admin["headers"],
            timeout=10,
        )
        assert r2.json()["prefs"]["chat_alerts"] is False

        # restore true
        r3 = http.patch(
            f"{BASE_URL}/api/users/me/notification-prefs",
            headers=admin["headers"],
            json={"chat_alerts": True},
            timeout=10,
        )
        assert r3.status_code == 200
        assert r3.json()["prefs"]["chat_alerts"] is True

    def test_patch_ignores_unknown_keys(self, http, admin):
        r = http.patch(
            f"{BASE_URL}/api/users/me/notification-prefs",
            headers=admin["headers"],
            json={"totally_unknown": True, "chat_alerts": True},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        prefs = r.json()["prefs"]
        assert "totally_unknown" not in prefs
        # Known ones still round-trip
        assert prefs["chat_alerts"] is True

    def test_new_user_can_read_and_toggle_chat_alerts(self, http):
        # Register a brand-new non-instructor user
        email = f"TEST_chatalerts_{uuid.uuid4().hex[:8]}@example.com"
        password = "TestPass!23"
        reg = http.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "name": "TEST chat_alerts user",
                  "password": password},
            timeout=15,
        )
        assert reg.status_code == 200, reg.text
        token = reg.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        r = http.get(
            f"{BASE_URL}/api/users/me/notification-prefs",
            headers=headers,
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["prefs"]["chat_alerts"] is True

        r2 = http.patch(
            f"{BASE_URL}/api/users/me/notification-prefs",
            headers=headers,
            json={"chat_alerts": False},
            timeout=10,
        )
        assert r2.status_code == 200
        assert r2.json()["prefs"]["chat_alerts"] is False


# --------------------------- chat POST -------------------------------
class TestChatPostEndpoint:
    def _post_and_cleanup(self, http, headers, text: str) -> dict:
        r = http.post(
            f"{BASE_URL}/api/chat/messages",
            headers=headers,
            json={"message": text},
            timeout=20,
        )
        assert r.status_code == 200, f"chat POST failed: {r.status_code} {r.text}"
        doc = r.json()
        # cleanup after
        try:
            http.delete(
                f"{BASE_URL}/api/chat/messages/{doc['id']}",
                headers=headers,
                timeout=10,
            )
        except Exception:
            pass
        return doc

    def test_admin_can_post_chat_message_no_500(self, http, admin):
        doc = self._post_and_cleanup(
            http, admin["headers"],
            f"TEST_chat_alerts admin post {uuid.uuid4().hex[:6]}",
        )
        assert doc["id"].startswith("msg_")
        assert doc["user_id"] == admin["user"]["user_id"]

    def test_instructor_post_with_placeholder_push_key(self, http, erin):
        # Even if EMERGENT_PUSH_KEY is a placeholder, POST should still 200.
        doc = self._post_and_cleanup(
            http, erin["headers"],
            f"TEST_chat_alerts erin no-push {uuid.uuid4().hex[:6]}",
        )
        assert doc["user_id"] == erin["user"]["user_id"]

    def test_mention_flow_returns_mentioned_user_ids(self, http, admin, erin):
        # Post 'Hi @Erin nice one!' as admin — Erin should show up in
        # mentioned_user_ids. We can't observe fan_out_chat_post's return
        # via HTTP, but we can verify the mention half.
        text = f"TEST_chat_alerts Hi @Erin nice one! {uuid.uuid4().hex[:6]}"
        r = http.post(
            f"{BASE_URL}/api/chat/messages",
            headers=admin["headers"],
            json={"message": text},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        try:
            # Depending on Erin's stored ``name`` we can only require this
            # if resolution succeeded. If Erin exists (she must, per creds)
            # she should resolve. Guard the assertion with a helpful msg.
            mentioned = doc.get("mentioned_user_ids") or []
            assert erin["user"]["user_id"] in mentioned, (
                f"Erin ({erin['user']['user_id']}) not in mentioned_user_ids"
                f" — resolver may have failed. Full doc: {doc}"
            )
        finally:
            http.delete(
                f"{BASE_URL}/api/chat/messages/{doc['id']}",
                headers=admin["headers"],
                timeout=10,
            )


# ----------- fan_out_chat_post service unit-level checks -------------
# We exercise the helper directly so we can inspect the returned
# recipient pool — the HTTP endpoint doesn't expose it.
@pytest.mark.asyncio
async def test_fan_out_excludes_poster_and_muted_users(admin, erin):
    import sys
    sys.path.insert(0, "/app/backend")
    from services import chat_notifications
    from services import notification_prefs as np_service

    admin_uid = admin["user"]["user_id"]
    erin_uid = erin["user"]["user_id"]

    # Baseline: erin has chat_alerts=True → should be in pool.
    await np_service.update_prefs(
        erin_uid, {**await np_service.get_prefs(erin_uid), "chat_alerts": True}
    )

    pool = await chat_notifications.fan_out_chat_post(
        message_id=f"test_msg_{uuid.uuid4().hex[:6]}",
        message_text="TEST_chat_alerts baseline",
        poster_user_id=admin_uid,
        poster_name="admin",
    )
    assert admin_uid not in pool, "Poster must not be in recipient pool"
    assert erin_uid in pool, "Erin (chat_alerts=True) should be in pool"

    # Now: mute Erin's chat_alerts → she must drop out.
    await np_service.update_prefs(
        erin_uid, {**await np_service.get_prefs(erin_uid), "chat_alerts": False}
    )
    try:
        pool2 = await chat_notifications.fan_out_chat_post(
            message_id=f"test_msg_{uuid.uuid4().hex[:6]}",
            message_text="TEST_chat_alerts muted",
            poster_user_id=admin_uid,
            poster_name="admin",
        )
        assert admin_uid not in pool2
        assert erin_uid not in pool2, (
            f"Erin muted chat_alerts but still in pool: {pool2}"
        )
    finally:
        # restore
        await np_service.update_prefs(
            erin_uid,
            {**await np_service.get_prefs(erin_uid), "chat_alerts": True},
        )

    # already_notified de-dupes.
    pool3 = await chat_notifications.fan_out_chat_post(
        message_id=f"test_msg_{uuid.uuid4().hex[:6]}",
        message_text="TEST_chat_alerts dedupe",
        poster_user_id=admin_uid,
        poster_name="admin",
        already_notified=[erin_uid],
    )
    assert erin_uid not in pool3, (
        f"already_notified must exclude erin, got: {pool3}"
    )


# -------------------- app.config.js orientation ----------------------
def test_app_config_orientation_is_default():
    with open("/app/frontend/app.config.js") as fh:
        src = fh.read()
    m = re.search(r"orientation:\s*[\"']([^\"']+)[\"']", src)
    assert m, "orientation key not found in app.config.js"
    assert m.group(1) == "default", (
        f"orientation must be 'default' (was '{m.group(1)}') to enable rotation"
    )
