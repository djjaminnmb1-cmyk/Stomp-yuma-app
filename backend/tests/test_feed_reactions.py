"""Tests for Phase 3 extension: Feed reactions endpoints.

Covers:
  * GET  /api/feed/reaction-kinds  – catalog with emoji/label
  * POST /api/feed/{event_id}/reactions/{kind}  – idempotent add + shape
  * DELETE /api/feed/{event_id}/reactions/{kind}  – idempotent remove
  * Validation: unknown kind => 400, missing event => ok:true w/ empty counts
  * Feed hydration: /api/feed?limit=N returns reactions:{counts,mine} per event
  * Auth: unauthenticated => 401/403 on the three reaction endpoints
"""

from __future__ import annotations

import os
import uuid
import pytest
import requests


from _creds import (  # SEC-001 remediation — passwords from .env
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    ERIN_EMAIL,
    ERIN_PASSWORD,
    JAMIN_EMAIL,
    JAMIN_PASSWORD,
)
BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

ERIN = ("erinboroughs@gmail.com", ERIN_PASSWORD)
JAMIN = ("luvtowork247@yahoo.com", JAMIN_PASSWORD)

REACTION_KINDS = {"high_five", "dancer", "yeehaw", "heart"}


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _login(s: requests.Session, email: str, password: str) -> str:
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("session_token") or r.json().get("access_token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def erin_token(s):
    return _login(s, *ERIN)


@pytest.fixture(scope="module")
def jamin_token(s):
    return _login(s, *JAMIN)


@pytest.fixture(scope="module")
def fresh_user(s):
    """Register a brand-new regular user."""
    tag = uuid.uuid4().hex[:8]
    email = f"TEST_reactor_{tag}@example.com"
    pw = "ReactPass123!"
    r = s.post(f"{BASE}/api/auth/register",
               json={"email": email, "password": pw, "name": f"TEST Reactor {tag}"},
               timeout=20)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("session_token")
    uid = (data.get("user") or {}).get("user_id") or data.get("user_id")
    assert tok, data
    return {"token": tok, "user_id": uid, "email": email}


# ---------- catalog ----------
class TestReactionCatalog:
    def test_kinds_endpoint(self, s, erin_token):
        r = s.get(f"{BASE}/api/feed/reaction-kinds", headers=_hdr(erin_token))
        assert r.status_code == 200
        payload = r.json()
        kinds = payload.get("kinds", [])
        assert len(kinds) == 4
        got = {k["kind"] for k in kinds}
        assert got == REACTION_KINDS
        for k in kinds:
            assert k.get("emoji"), k
            assert k.get("label"), k

    def test_kinds_requires_auth(self, s):
        r = s.get(f"{BASE}/api/feed/reaction-kinds")
        assert r.status_code in (401, 403), r.status_code


# ---------- helper: guarantee a feed event ----------
def _ensure_completion_event(s, tok):
    """Complete any dance to create a completion event (idempotent server-side)."""
    r = s.get(f"{BASE}/api/dances?limit=1", headers=_hdr(tok))
    assert r.status_code == 200, r.text
    body = r.json()
    if isinstance(body, list):
        dances = body
    elif isinstance(body, dict):
        dances = body.get("dances") or body.get("items") or []
    else:
        dances = []
    assert dances, "no dances seeded"
    dance_id = dances[0].get("id") or dances[0].get("dance_id")
    assert dance_id, dances[0]
    # Mark completed via tracking endpoint (path-based dance id)
    tr = s.post(f"{BASE}/api/tracking/{dance_id}",
                headers=_hdr(tok),
                json={"status": "completed"})
    assert tr.status_code in (200, 201), tr.text
    # Now fetch feed and grab a completion event id
    fr = s.get(f"{BASE}/api/feed?limit=30", headers=_hdr(tok))
    assert fr.status_code == 200, fr.text
    events = fr.json().get("events", [])
    for e in events:
        if e.get("type") == "completion" and e.get("id"):
            return e["id"]
    pytest.skip("Could not create/find a completion feed event")


@pytest.fixture(scope="module")
def event_id(s, erin_token):
    return _ensure_completion_event(s, erin_token)


# ---------- reactions add / remove / idempotency ----------
class TestReactionToggle:
    def test_add_returns_shape(self, s, erin_token, event_id):
        r = s.post(f"{BASE}/api/feed/{event_id}/reactions/high_five",
                   headers=_hdr(erin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert isinstance(body.get("created"), bool)
        assert "reactions" in body
        rx = body["reactions"]
        assert isinstance(rx.get("counts"), dict)
        assert isinstance(rx.get("mine"), list)
        assert "high_five" in rx["mine"]
        assert rx["counts"].get("high_five", 0) >= 1

    def test_add_is_idempotent(self, s, erin_token, event_id):
        r1 = s.post(f"{BASE}/api/feed/{event_id}/reactions/high_five",
                    headers=_hdr(erin_token))
        c1 = r1.json()["reactions"]["counts"].get("high_five", 0)
        r2 = s.post(f"{BASE}/api/feed/{event_id}/reactions/high_five",
                    headers=_hdr(erin_token))
        assert r2.status_code == 200
        b2 = r2.json()
        assert b2["ok"] is True
        assert b2["created"] is False  # second add should NOT create
        c2 = b2["reactions"]["counts"].get("high_five", 0)
        assert c1 == c2, f"counts changed on duplicate add: {c1} -> {c2}"

    def test_delete_removes(self, s, erin_token, event_id):
        # ensure it's present
        s.post(f"{BASE}/api/feed/{event_id}/reactions/dancer",
               headers=_hdr(erin_token))
        d1 = s.delete(f"{BASE}/api/feed/{event_id}/reactions/dancer",
                      headers=_hdr(erin_token))
        assert d1.status_code == 200, d1.text
        b1 = d1.json()
        assert b1["ok"] is True
        assert b1["removed"] is True
        assert "dancer" not in b1["reactions"]["mine"]

    def test_delete_is_idempotent(self, s, erin_token, event_id):
        d2 = s.delete(f"{BASE}/api/feed/{event_id}/reactions/dancer",
                      headers=_hdr(erin_token))
        assert d2.status_code == 200
        body = d2.json()
        assert body["ok"] is True
        assert body["removed"] is False
        assert "dancer" not in body["reactions"]["mine"]
        assert isinstance(body["reactions"]["counts"], dict)


class TestReactionValidation:
    def test_unknown_kind_400(self, s, erin_token, event_id):
        r = s.post(f"{BASE}/api/feed/{event_id}/reactions/rocket",
                   headers=_hdr(erin_token))
        assert r.status_code == 400, r.text

    def test_unknown_kind_delete_400(self, s, erin_token, event_id):
        r = s.delete(f"{BASE}/api/feed/{event_id}/reactions/rocket",
                     headers=_hdr(erin_token))
        assert r.status_code == 400, r.text

    def test_missing_event_returns_empty(self, s, erin_token):
        bogus = f"evt_{uuid.uuid4().hex[:12]}"
        r = s.post(f"{BASE}/api/feed/{bogus}/reactions/heart",
                   headers=_hdr(erin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        # add_reaction returns False (event not found) => created False
        assert body["created"] is False
        assert body["reactions"]["counts"] == {}


class TestReactionAuth:
    def test_post_requires_auth(self, s, event_id):
        r = s.post(f"{BASE}/api/feed/{event_id}/reactions/heart")
        assert r.status_code in (401, 403)

    def test_delete_requires_auth(self, s, event_id):
        r = s.delete(f"{BASE}/api/feed/{event_id}/reactions/heart")
        assert r.status_code in (401, 403)


# ---------- feed hydration ----------
class TestFeedHydration:
    def test_feed_has_reactions_field(self, s, erin_token, event_id):
        # Guarantee a reaction exists so 'mine' is populated
        s.post(f"{BASE}/api/feed/{event_id}/reactions/yeehaw",
               headers=_hdr(erin_token))
        r = s.get(f"{BASE}/api/feed?limit=10", headers=_hdr(erin_token))
        assert r.status_code == 200, r.text
        events = r.json().get("events", [])
        assert events, "empty feed for erin"
        target = next((e for e in events if e["id"] == event_id), None)
        assert target, "seeded event not visible in erin's feed"
        rx = target.get("reactions")
        assert isinstance(rx, dict)
        assert "counts" in rx and "mine" in rx
        assert "yeehaw" in rx["mine"]

    def test_different_users_see_different_mine(
            self, s, erin_token, fresh_user, event_id):
        # Erin reacts with heart, fresh user follows Erin, reacts with dancer.
        s.post(f"{BASE}/api/feed/{event_id}/reactions/heart",
               headers=_hdr(erin_token))
        # fresh user follows erin so event shows in their feed
        me_r = s.get(f"{BASE}/api/auth/me", headers=_hdr(erin_token))
        erin_uid = me_r.json().get("user_id") or (me_r.json().get("user") or {}).get("user_id")
        assert erin_uid, me_r.text
        f = s.post(f"{BASE}/api/follows/{erin_uid}",
                   headers=_hdr(fresh_user["token"]))
        assert f.status_code == 200, f.text
        # fresh reacts with dancer on same event
        cr = s.post(f"{BASE}/api/feed/{event_id}/reactions/dancer",
                    headers=_hdr(fresh_user["token"]))
        assert cr.status_code == 200
        # Now fetch feed for both viewers
        e_feed = s.get(f"{BASE}/api/feed?limit=30",
                       headers=_hdr(erin_token)).json()["events"]
        n_feed = s.get(f"{BASE}/api/feed?limit=30",
                       headers=_hdr(fresh_user["token"])).json()["events"]
        e_evt = next((e for e in e_feed if e["id"] == event_id), None)
        n_evt = next((e for e in n_feed if e["id"] == event_id), None)
        assert e_evt and n_evt, "event missing in a viewer's feed"
        # Erin should see heart in her 'mine'; fresh should see dancer in his 'mine'
        assert "heart" in e_evt["reactions"]["mine"]
        assert "dancer" in n_evt["reactions"]["mine"]
        # Their 'mine' arrays should differ
        assert set(e_evt["reactions"]["mine"]) != set(n_evt["reactions"]["mine"])
        # counts should include both users' reactions
        counts = e_evt["reactions"]["counts"]
        assert counts.get("heart", 0) >= 1
        assert counts.get("dancer", 0) >= 1
