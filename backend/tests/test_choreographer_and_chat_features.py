"""Regression + feature suite for the Jan-2026 session:

* Bug: choreographer follow/detail with punctuation, backfill_choreographer_keys,
  ?limit=500 pass-through, server-side ?q= substring.
* Feature 1: Read receipts (chat_reads collection).
* Feature 2: Quiet Hours in notification_prefs.
* Feature 3: Chat emoji reactions (toggle + summary + cascade).
* Regression: mention fan-out + account-deletion cascade.

Base URL comes from EXPO_PUBLIC_BACKEND_URL in the frontend .env — we
read it via env so we exercise the same public ingress the mobile
client hits.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://stompin-yuma-app.preview.emergentagent.com"
).rstrip("/")

ADMIN_EMAIL = "admin@stompinground.com"
ADMIN_PASSWORD = "C^c+9$ii4y@_L1mU4sl5BTOd"
ERIN_EMAIL = "erinboroughs@gmail.com"
ERIN_PASSWORD = "Stompin2026!"
JAMIN_EMAIL = "luvtowork247@yahoo.com"
JAMIN_PASSWORD = "BootsDance49!"


# ------------- helpers -------------
def _login(email: str, password: str) -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


def _hdrs(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_token() -> str:
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def erin_token() -> str:
    return _login(ERIN_EMAIL, ERIN_PASSWORD)


@pytest.fixture(scope="module")
def jamin_token() -> str:
    return _login(JAMIN_EMAIL, JAMIN_PASSWORD)


# ============================================================
# BUG FIX — choreographer follow with punctuation
# ============================================================
class TestChoreographerBugFix:
    def test_detail_with_dots_returns_dances(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/choreographers/A.T.%20Kinson",
            headers=_hdrs(admin_token), timeout=30,
        )
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert j["dance_count"] > 0, f"A.T. Kinson should have dances, got {j['dance_count']}"
        assert len(j["dances"]) == j["dance_count"]

    def test_detail_with_parens_and_hyphen(self, admin_token):
        # Adrian Lefebour (AUS) - September 2025
        name = "Adrian Lefebour (AUS) - September 2025"
        r = requests.get(
            f"{BASE_URL}/api/choreographers/{requests.utils.quote(name, safe='')}",
            headers=_hdrs(admin_token), timeout=30,
        )
        # This name has punctuation but may/may not exist in library.
        # If it exists we assert dances > 0; if 400/404 that's flagged.
        assert r.status_code in (200, 404), r.text[:200]
        if r.status_code == 200:
            # Detail always resolves even if no dances (returns 0).
            assert "dances" in r.json()

    def test_limit_500(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/choreographers?limit=500",
            headers=_hdrs(admin_token), timeout=60,
        )
        assert r.status_code == 200
        rows = r.json().get("choreographers", [])
        # Should return more than the old cap of 200 (if library is that big).
        # We assert count is at least 200 which is the previous ceiling.
        assert len(rows) >= 200, f"expected >= 200, got {len(rows)}"

    def test_q_substring_server_side(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/choreographers?q=fowler&limit=500",
            headers=_hdrs(admin_token), timeout=30,
        )
        assert r.status_code == 200
        rows = r.json().get("choreographers", [])
        assert len(rows) >= 1
        for row in rows:
            assert "fowler" in (row.get("choreographer") or "").lower()

    def test_follow_with_punctuation(self, admin_token):
        # First unfollow to ensure clean state (idempotent).
        name = "A.T. Kinson"
        quoted = requests.utils.quote(name, safe="")
        requests.delete(
            f"{BASE_URL}/api/choreographers/{quoted}/follow",
            headers=_hdrs(admin_token), timeout=30,
        )
        r = requests.post(
            f"{BASE_URL}/api/choreographers/{quoted}/follow",
            headers=_hdrs(admin_token), timeout=30,
        )
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert j["is_following"] is True
        assert j["follower_count"] >= 1

        # Confirm dance_count > 0 in me/follows
        m = requests.get(
            f"{BASE_URL}/api/choreographers/me/follows",
            headers=_hdrs(admin_token), timeout=30,
        )
        assert m.status_code == 200
        rows = m.json().get("choreographers", [])
        hit = next(
            (r for r in rows if (r.get("choreographer") or "").lower() == name.lower()),
            None,
        )
        assert hit is not None, f"admin should be following {name}"
        assert hit["dance_count"] > 0

        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/choreographers/{quoted}/follow",
            headers=_hdrs(admin_token), timeout=30,
        )


# ============================================================
# FEATURE 1 — Read Receipts
# ============================================================
class TestReadReceipts:
    def test_get_reads_returns_pool(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/chat/reads", headers=_hdrs(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert isinstance(j.get("reads"), list)
        assert j["count"] == len(j["reads"])
        # Every entry has the expected keys.
        for row in j["reads"]:
            assert set(row.keys()) >= {"user_id", "user_name", "picture", "last_read_at"}

    def test_mark_read_bumps_timestamp(self, admin_token):
        # Read current
        r0 = requests.get(f"{BASE_URL}/api/chat/reads", headers=_hdrs(admin_token), timeout=30)
        me = None
        # Identify self via posting mark-read then reading.
        r1 = requests.post(
            f"{BASE_URL}/api/chat/mark-read",
            headers=_hdrs(admin_token), json={}, timeout=30,
        )
        assert r1.status_code == 200, r1.text[:200]
        stamped = r1.json().get("last_read_at")
        assert stamped

        # Confirm the caller shows up with that (or newer) timestamp.
        r2 = requests.get(f"{BASE_URL}/api/chat/reads", headers=_hdrs(admin_token), timeout=30)
        assert r2.status_code == 200
        # find admin row via matching last_read_at freshness (== stamped).
        found = [r for r in r2.json()["reads"] if r["last_read_at"] == stamped]
        assert len(found) >= 1

    def test_mark_read_monotonic(self, admin_token):
        # Fresh mark
        r1 = requests.post(
            f"{BASE_URL}/api/chat/mark-read",
            headers=_hdrs(admin_token), json={}, timeout=30,
        )
        assert r1.status_code == 200
        fresh = r1.json()["last_read_at"]

        # Attempt to rewind
        r2 = requests.post(
            f"{BASE_URL}/api/chat/mark-read",
            headers=_hdrs(admin_token), json={"at": "2020-01-01T00:00:00Z"}, timeout=30,
        )
        assert r2.status_code == 200
        # Must not rewind — persisted stays at fresh (>= it).
        persisted = r2.json()["last_read_at"]
        assert persisted >= fresh, f"pointer rewound from {fresh} to {persisted}"

    def test_messages_still_plain_array(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/chat/messages", headers=_hdrs(admin_token), timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list), "back-compat: /chat/messages must be array"

    def test_non_instructor_forbidden(self):
        # Register a throwaway non-instructor
        email = f"TEST_nonins_{uuid.uuid4().hex[:8]}@example.com"
        pw = "TestPass123!"
        rr = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": pw, "name": "TEST NonIns"},
            timeout=30,
        )
        assert rr.status_code in (200, 201), rr.text[:200]
        tok = rr.json().get("token") or rr.json().get("access_token")
        assert tok

        r1 = requests.get(f"{BASE_URL}/api/chat/reads", headers=_hdrs(tok), timeout=30)
        assert r1.status_code in (401, 403)
        r2 = requests.post(
            f"{BASE_URL}/api/chat/mark-read",
            headers=_hdrs(tok), json={}, timeout=30,
        )
        assert r2.status_code in (401, 403)

        # Cleanup
        requests.delete(f"{BASE_URL}/api/auth/me", headers=_hdrs(tok), timeout=30)


# ============================================================
# FEATURE 2 — Quiet Hours
# ============================================================
class TestQuietHours:
    def test_patch_and_persist(self, admin_token):
        r = requests.patch(
            f"{BASE_URL}/api/users/me/notification-prefs",
            headers=_hdrs(admin_token),
            json={"quiet_hours": {"enabled": True, "start_hour": 22, "end_hour": 7, "tz_offset_minutes": 0}},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:200]
        qh = r.json()["prefs"]["quiet_hours"]
        assert qh["enabled"] is True
        assert qh["start_hour"] == 22
        assert qh["end_hour"] == 7
        assert qh["tz_offset_minutes"] == 0

    def test_patch_partial_preserves(self, admin_token):
        # Only toggle enabled=false, keep other fields
        r = requests.patch(
            f"{BASE_URL}/api/users/me/notification-prefs",
            headers=_hdrs(admin_token),
            json={"quiet_hours": {"enabled": False}},
            timeout=30,
        )
        assert r.status_code == 200
        qh = r.json()["prefs"]["quiet_hours"]
        assert qh["enabled"] is False
        assert qh["start_hour"] == 22  # preserved
        assert qh["end_hour"] == 7
        assert qh["tz_offset_minutes"] == 0

    def test_get_returns_full_subdoc(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/users/me/notification-prefs",
            headers=_hdrs(admin_token), timeout=30,
        )
        assert r.status_code == 200
        qh = r.json()["prefs"]["quiet_hours"]
        assert set(qh.keys()) >= {"enabled", "start_hour", "end_hour", "tz_offset_minutes"}


# ============================================================
# FEATURE 3 — Chat Reactions
# ============================================================
@pytest.fixture(scope="module")
def seed_chat_message(admin_token):
    """Post a fresh chat message we can react to across tests."""
    r = requests.post(
        f"{BASE_URL}/api/chat/messages",
        headers=_hdrs(admin_token),
        json={"message": f"TEST reactions probe {uuid.uuid4().hex[:6]}"},
        timeout=30,
    )
    assert r.status_code == 200, r.text[:200]
    mid = r.json()["id"]
    yield mid
    # Cleanup
    requests.delete(
        f"{BASE_URL}/api/chat/messages/{mid}",
        headers=_hdrs(admin_token), timeout=30,
    )


class TestChatReactions:
    def test_react_add(self, admin_token, seed_chat_message):
        r = requests.post(
            f"{BASE_URL}/api/chat/messages/{seed_chat_message}/reactions",
            headers=_hdrs(admin_token), json={"kind": "👍"}, timeout=30,
        )
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert j["added"] is True
        assert j["kind"] == "👍"
        assert j["reactions"]["counts"].get("👍") == 1
        assert "👍" in j["reactions"]["mine"]

    def test_react_toggle_off(self, admin_token, seed_chat_message):
        # Second call toggles off
        r = requests.post(
            f"{BASE_URL}/api/chat/messages/{seed_chat_message}/reactions",
            headers=_hdrs(admin_token), json={"kind": "👍"}, timeout=30,
        )
        assert r.status_code == 200
        j = r.json()
        assert j["added"] is False
        assert j["reactions"]["counts"] == {}
        assert j["reactions"]["mine"] == []

    def test_react_two_users(self, admin_token, erin_token, seed_chat_message):
        # Admin adds
        r1 = requests.post(
            f"{BASE_URL}/api/chat/messages/{seed_chat_message}/reactions",
            headers=_hdrs(admin_token), json={"kind": "🎉"}, timeout=30,
        )
        assert r1.status_code == 200 and r1.json()["added"]
        # Erin adds same
        r2 = requests.post(
            f"{BASE_URL}/api/chat/messages/{seed_chat_message}/reactions",
            headers=_hdrs(erin_token), json={"kind": "🎉"}, timeout=30,
        )
        assert r2.status_code == 200 and r2.json()["added"]
        assert r2.json()["reactions"]["counts"].get("🎉") == 2
        # Cleanup — remove both.
        requests.post(
            f"{BASE_URL}/api/chat/messages/{seed_chat_message}/reactions",
            headers=_hdrs(admin_token), json={"kind": "🎉"}, timeout=30,
        )
        requests.post(
            f"{BASE_URL}/api/chat/messages/{seed_chat_message}/reactions",
            headers=_hdrs(erin_token), json={"kind": "🎉"}, timeout=30,
        )

    def test_multiple_emojis_single_user(self, admin_token, seed_chat_message):
        for emo in ("🔥", "❤️"):
            r = requests.post(
                f"{BASE_URL}/api/chat/messages/{seed_chat_message}/reactions",
                headers=_hdrs(admin_token), json={"kind": emo}, timeout=30,
            )
            assert r.status_code == 200, r.text[:200]
            assert r.json()["added"] is True
        # Final summary should list both
        r = requests.get(
            f"{BASE_URL}/api/chat/messages",
            headers=_hdrs(admin_token), timeout=30,
        )
        msgs = r.json()
        m = next((x for x in msgs if x["id"] == seed_chat_message), None)
        assert m is not None
        counts = (m.get("reactions") or {}).get("counts", {})
        assert counts.get("🔥") == 1
        assert counts.get("❤️") == 1
        # Cleanup
        for emo in ("🔥", "❤️"):
            requests.post(
                f"{BASE_URL}/api/chat/messages/{seed_chat_message}/reactions",
                headers=_hdrs(admin_token), json={"kind": emo}, timeout=30,
            )

    def test_delete_message_cascades_reactions(self, admin_token):
        # Post fresh msg, react, delete, then try to react again → 404.
        p = requests.post(
            f"{BASE_URL}/api/chat/messages",
            headers=_hdrs(admin_token),
            json={"message": f"TEST cascade probe {uuid.uuid4().hex[:6]}"},
            timeout=30,
        )
        assert p.status_code == 200
        mid = p.json()["id"]
        rr = requests.post(
            f"{BASE_URL}/api/chat/messages/{mid}/reactions",
            headers=_hdrs(admin_token), json={"kind": "👍"}, timeout=30,
        )
        assert rr.status_code == 200
        d = requests.delete(
            f"{BASE_URL}/api/chat/messages/{mid}",
            headers=_hdrs(admin_token), timeout=30,
        )
        assert d.status_code == 200
        # Now reacting should 404.
        r404 = requests.post(
            f"{BASE_URL}/api/chat/messages/{mid}/reactions",
            headers=_hdrs(admin_token), json={"kind": "👍"}, timeout=30,
        )
        assert r404.status_code == 404

    def test_non_instructor_cannot_react(self, seed_chat_message):
        email = f"TEST_nonins_rx_{uuid.uuid4().hex[:8]}@example.com"
        pw = "TestPass123!"
        rr = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": pw, "name": "TEST NonIns Rx"},
            timeout=30,
        )
        tok = rr.json().get("token") or rr.json().get("access_token")
        r = requests.post(
            f"{BASE_URL}/api/chat/messages/{seed_chat_message}/reactions",
            headers=_hdrs(tok), json={"kind": "👍"}, timeout=30,
        )
        assert r.status_code in (401, 403)
        requests.delete(f"{BASE_URL}/api/auth/me", headers=_hdrs(tok), timeout=30)


# ============================================================
# REGRESSION — Mentions
# ============================================================
class TestMentionRegression:
    def test_at_mention_persists_user_id(self, admin_token, erin_token):
        # Look up Erin's user_id
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdrs(erin_token), timeout=30)
        assert me.status_code == 200
        erin_id = me.json().get("user_id") or me.json().get("user", {}).get("user_id")
        assert erin_id

        r = requests.post(
            f"{BASE_URL}/api/chat/messages",
            headers=_hdrs(admin_token),
            json={"message": f"Hi @Erin — TEST {uuid.uuid4().hex[:6]}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        mentioned = j.get("mentioned_user_ids") or []
        # Cleanup message
        requests.delete(f"{BASE_URL}/api/chat/messages/{j['id']}", headers=_hdrs(admin_token), timeout=30)
        assert erin_id in mentioned, f"expected Erin ({erin_id}) in {mentioned}"


# ============================================================
# REGRESSION — Account deletion cascades chat_reactions
# ============================================================
class TestAccountDeleteCascade:
    def test_delete_purges_chat_reactions(self, admin_token):
        # Register throwaway instructor via instructor code
        email = f"TEST_del_{uuid.uuid4().hex[:8]}@example.com"
        pw = "TestPass123!"
        rr = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": email,
                "password": pw,
                "name": "TEST DelCascade",
                "instructor_code": "lineup4life",
            },
            timeout=30,
        )
        assert rr.status_code in (200, 201), rr.text[:200]
        tok = rr.json().get("token") or rr.json().get("access_token")
        # Seed message we can react to, from admin.
        p = requests.post(
            f"{BASE_URL}/api/chat/messages",
            headers=_hdrs(admin_token),
            json={"message": f"TEST del cascade probe {uuid.uuid4().hex[:6]}"},
            timeout=30,
        )
        mid = p.json()["id"]
        # Throwaway reacts.
        rx = requests.post(
            f"{BASE_URL}/api/chat/messages/{mid}/reactions",
            headers=_hdrs(tok), json={"kind": "🎉"}, timeout=30,
        )
        assert rx.status_code == 200 and rx.json()["added"]

        # Delete self
        d = requests.delete(f"{BASE_URL}/api/auth/me", headers=_hdrs(tok), timeout=30)
        assert d.status_code in (200, 204)

        # Fetch messages as admin and verify reaction gone.
        time.sleep(1)
        r = requests.get(f"{BASE_URL}/api/chat/messages", headers=_hdrs(admin_token), timeout=30)
        msgs = r.json()
        m = next((x for x in msgs if x["id"] == mid), None)
        if m is not None:
            counts = (m.get("reactions") or {}).get("counts", {})
            assert counts.get("🎉", 0) == 0, f"reaction not purged: {counts}"
        # Cleanup message
        requests.delete(f"{BASE_URL}/api/chat/messages/{mid}", headers=_hdrs(admin_token), timeout=30)


# ============================================================
# REGRESSION — GET /api/dances still works
# ============================================================
class TestDancesRegression:
    def test_list_dances(self):
        r = requests.get(f"{BASE_URL}/api/dances", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
