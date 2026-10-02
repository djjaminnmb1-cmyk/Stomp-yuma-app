"""Tests for Reactions v2.7 pack refresh + reactors endpoint.

Covers:
  * GET  /api/feed/reaction-kinds  – exactly [high_five, dancer, yeehaw, heart]
  * POST /api/feed/{event_id}/reactions/clap  – 400 (retired)
  * DELETE /api/feed/{event_id}/reactions/clap – 200 (legacy cleanup)
  * POST /api/feed/{event_id}/reactions/dancer – 200 + counts increment
  * DELETE dancer toggles it back off
  * GET  /api/feed/{event_id}/reactors[?kind=X&limit=N] – shape/filter/auth
  * Regression: high_five / yeehaw / heart still POST/DELETE ok
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

CURRENT_KINDS = {"high_five", "dancer", "yeehaw", "heart"}
CURRENT_EMOJI = {
    "high_five": "🙌",
    "dancer": "🕺",
    "yeehaw": "🤠",
    "heart": "❤️",
}


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _login(sess, email, pw):
    r = sess.post(f"{BASE}/api/auth/login",
                  json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    j = r.json()
    tok = j.get("token") or j.get("session_token") or j.get("access_token")
    assert tok, j
    return tok


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def erin_token(s):
    return _login(s, *ERIN)


@pytest.fixture(scope="module")
def jamin_token(s):
    return _login(s, *JAMIN)


@pytest.fixture(scope="module")
def event_id(s, erin_token):
    r = s.get(f"{BASE}/api/dances?limit=1", headers=_hdr(erin_token))
    assert r.status_code == 200
    body = r.json()
    dances = body if isinstance(body, list) else (body.get("dances") or body.get("items") or [])
    assert dances, "no dances seeded"
    dance_id = dances[0].get("id") or dances[0].get("dance_id")
    tr = s.post(f"{BASE}/api/tracking/{dance_id}",
                headers=_hdr(erin_token), json={"status": "completed"})
    assert tr.status_code in (200, 201), tr.text
    fr = s.get(f"{BASE}/api/feed?limit=30", headers=_hdr(erin_token))
    assert fr.status_code == 200
    for e in fr.json().get("events", []):
        if e.get("type") == "completion" and e.get("id"):
            return e["id"]
    pytest.skip("Could not create completion feed event")


# ---------- Reaction kinds pack refresh ----------
class TestReactionKindsV27:
    def test_kinds_exactly_four_current(self, s, erin_token):
        # /api/feed/reaction-kinds returns exactly the 4 new kinds (no clap)
        r = s.get(f"{BASE}/api/feed/reaction-kinds", headers=_hdr(erin_token))
        assert r.status_code == 200
        payload = r.json()
        kinds = payload.get("kinds", [])
        assert len(kinds) == 4, f"expected 4 kinds, got {len(kinds)}: {kinds}"
        got_kinds = {k["kind"] for k in kinds}
        assert got_kinds == CURRENT_KINDS, f"kinds mismatch: {got_kinds}"
        # clap must NOT be present
        assert "clap" not in got_kinds

    def test_kinds_have_correct_emoji_and_label(self, s, erin_token):
        # each entry has emoji + label; dancer/heart/high_five/yeehaw emojis correct
        r = s.get(f"{BASE}/api/feed/reaction-kinds", headers=_hdr(erin_token))
        for k in r.json()["kinds"]:
            assert k.get("emoji"), k
            assert k.get("label"), k
            assert k["emoji"] == CURRENT_EMOJI[k["kind"]]


# ---------- Clap retirement ----------
class TestClapRetired:
    def test_post_clap_rejected(self, s, erin_token, event_id):
        # POST clap must return 400 — no new clap rows allowed
        r = s.post(f"{BASE}/api/feed/{event_id}/reactions/clap",
                   headers=_hdr(erin_token))
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_delete_clap_still_allowed(self, s, erin_token, event_id):
        # Legacy DELETE for clap still returns 200 (cleanup path)
        r = s.delete(f"{BASE}/api/feed/{event_id}/reactions/clap",
                     headers=_hdr(erin_token))
        assert r.status_code == 200, f"expected 200 legacy cleanup, got {r.status_code}"
        body = r.json()
        assert body.get("ok") is True
        assert "clap" not in body["reactions"]["mine"]


# ---------- Dancer reaction ----------
class TestDancerReaction:
    def test_add_dancer_increments(self, s, erin_token, event_id):
        # First remove to reset (idempotent)
        s.delete(f"{BASE}/api/feed/{event_id}/reactions/dancer",
                 headers=_hdr(erin_token))
        r = s.post(f"{BASE}/api/feed/{event_id}/reactions/dancer",
                   headers=_hdr(erin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["created"] is True
        assert "dancer" in body["reactions"]["mine"]
        assert body["reactions"]["counts"].get("dancer", 0) >= 1

    def test_delete_dancer_toggles_off(self, s, erin_token, event_id):
        # ensure it's added
        s.post(f"{BASE}/api/feed/{event_id}/reactions/dancer",
               headers=_hdr(erin_token))
        d = s.delete(f"{BASE}/api/feed/{event_id}/reactions/dancer",
                     headers=_hdr(erin_token))
        assert d.status_code == 200
        body = d.json()
        assert body["removed"] is True
        assert "dancer" not in body["reactions"]["mine"]


# ---------- Reactors endpoint ----------
class TestReactorsEndpoint:
    def test_reactors_shape(self, s, erin_token, jamin_token, event_id):
        # Seed two reactions from different users on same event
        s.post(f"{BASE}/api/feed/{event_id}/reactions/heart",
               headers=_hdr(erin_token))
        s.post(f"{BASE}/api/feed/{event_id}/reactions/dancer",
               headers=_hdr(jamin_token))
        r = s.get(f"{BASE}/api/feed/{event_id}/reactors",
                  headers=_hdr(erin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        # Required top-level keys
        assert body.get("event_id") == event_id
        assert body.get("kind") is None  # no kind filter
        assert "reactors" in body and isinstance(body["reactors"], list)
        assert body.get("count") == len(body["reactors"])
        assert body["count"] >= 2
        # Each reactor has required fields
        for row in body["reactors"]:
            for k in ("user_id", "name", "picture", "is_instructor",
                      "kind", "emoji", "created_at"):
                assert k in row, f"missing {k} in reactor row: {row}"
            assert isinstance(row["is_instructor"], bool)

    def test_reactors_kind_filter(self, s, erin_token, event_id):
        # Filter to heart only — should include Erin's heart, not other kinds
        r = s.get(f"{BASE}/api/feed/{event_id}/reactors?kind=heart",
                  headers=_hdr(erin_token))
        assert r.status_code == 200
        body = r.json()
        assert body["kind"] == "heart"
        for row in body["reactors"]:
            assert row["kind"] == "heart"

    def test_reactors_invalid_kind_400(self, s, erin_token, event_id):
        r = s.get(f"{BASE}/api/feed/{event_id}/reactors?kind=nope",
                  headers=_hdr(erin_token))
        assert r.status_code == 400, r.text

    def test_reactors_requires_auth(self, s, event_id):
        r = s.get(f"{BASE}/api/feed/{event_id}/reactors")
        assert r.status_code in (401, 403)

    def test_reactors_limit_capped(self, s, erin_token, event_id):
        # limit=1 should return at most 1 reactor
        r = s.get(f"{BASE}/api/feed/{event_id}/reactors?limit=1",
                  headers=_hdr(erin_token))
        assert r.status_code == 200
        body = r.json()
        assert len(body["reactors"]) <= 1


# ---------- Regression: other kinds still work ----------
class TestReactionRegression:
    @pytest.mark.parametrize("kind", ["high_five", "yeehaw", "heart"])
    def test_add_and_remove(self, s, erin_token, event_id, kind):
        # add
        r = s.post(f"{BASE}/api/feed/{event_id}/reactions/{kind}",
                   headers=_hdr(erin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert kind in body["reactions"]["mine"]
        # remove
        d = s.delete(f"{BASE}/api/feed/{event_id}/reactions/{kind}",
                     headers=_hdr(erin_token))
        assert d.status_code == 200
        assert d.json()["ok"] is True

    def test_feed_hydrates_reactions(self, s, erin_token, event_id):
        # POST yeehaw, then confirm feed hydrates it
        s.post(f"{BASE}/api/feed/{event_id}/reactions/yeehaw",
               headers=_hdr(erin_token))
        r = s.get(f"{BASE}/api/feed?limit=30", headers=_hdr(erin_token))
        assert r.status_code == 200
        events = r.json().get("events", [])
        target = next((e for e in events if e["id"] == event_id), None)
        assert target, "event missing from feed"
        rx = target.get("reactions", {})
        assert "counts" in rx and "mine" in rx
        assert "yeehaw" in rx["mine"]
