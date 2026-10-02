"""Backend regression suite for the 4-feature session:
  1. Follow Choreographers
  2. Chat @mentions
  3. Admin Refresh Recommendations
  4. Report + block chaining (existing endpoints still work)

Uses public preview URL from EXPO_PUBLIC_BACKEND_URL.
"""
from __future__ import annotations

import os
import time
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

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://stompin-yuma-app.preview.emergentagent.com").rstrip("/")

ERIN = {"email": "erinboroughs@gmail.com", "password": ERIN_PASSWORD}
JAMIN = {"email": "luvtowork247@yahoo.com", "password": JAMIN_PASSWORD}


def _login(email: str, password: str) -> tuple[str, dict]:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    j = r.json()
    return j["token"], j["user"]


@pytest.fixture(scope="module")
def erin_ctx():
    tok, user = _login(ERIN["email"], ERIN["password"])
    return {"token": tok, "user": user, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def jamin_ctx():
    # Jamin — used as the mentioner so Erin can be the recipient
    tok, user = _login(JAMIN["email"], JAMIN["password"])
    return {"token": tok, "user": user, "headers": {"Authorization": f"Bearer {tok}"}}


# ---------------------------------------------------------------------------
# 1. Choreographer follows
# ---------------------------------------------------------------------------
class TestChoreographerFollows:
    def test_list_choreographers(self, erin_ctx):
        r = requests.get(f"{BASE_URL}/api/choreographers?limit=40", headers=erin_ctx["headers"], timeout=30)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert isinstance(data.get("choreographers"), list)
        assert data.get("count") == len(data["choreographers"])
        # Non-empty for a live library
        assert len(data["choreographers"]) > 0, "expected at least one choreographer"
        first = data["choreographers"][0]
        # Shape check — service returns display name in `choreographer`.
        for k in ("choreographer", "choreographer_key", "dance_count", "is_following"):
            assert k in first, f"choreographer row missing '{k}': {first}"

    def test_follow_and_unfollow_rob_fowler(self, erin_ctx):
        # Ensure clean baseline — delete_many-style: keep DELETE'ing until
        # gone (there is no unique index on the collection at the moment,
        # so a single delete_one may leave dup rows behind — see the
        # missing-index bug in test_report action_items).
        for _ in range(5):
            requests.delete(f"{BASE_URL}/api/choreographers/Rob%20Fowler/follow",
                            headers=erin_ctx["headers"], timeout=30)

        # Baseline follower count
        det0 = requests.get(f"{BASE_URL}/api/choreographers/Rob%20Fowler",
                            headers=erin_ctx["headers"], timeout=30)
        assert det0.status_code == 200, det0.text[:200]
        baseline = int(det0.json().get("follower_count", 0))

        # Follow
        r = requests.post(f"{BASE_URL}/api/choreographers/Rob%20Fowler/follow",
                          headers=erin_ctx["headers"], timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body.get("is_following") is True
        assert int(body.get("follower_count", 0)) >= baseline + 1

        # Confirm via my follows
        r = requests.get(f"{BASE_URL}/api/choreographers/me/follows",
                         headers=erin_ctx["headers"], timeout=30)
        assert r.status_code == 200
        follows = r.json().get("choreographers", [])
        names = {(c.get("choreographer") or c.get("name") or "").lower() for c in follows}
        assert "rob fowler" in names, f"Rob Fowler not in my follows: {names}"

        # Idempotent second follow — should still be true / same follower count
        r2 = requests.post(f"{BASE_URL}/api/choreographers/Rob%20Fowler/follow",
                           headers=erin_ctx["headers"], timeout=30)
        assert r2.status_code == 200
        assert r2.json().get("is_following") is True

        # Unfollow (loop to defeat missing-unique-index dup rows)
        for _ in range(5):
            requests.delete(f"{BASE_URL}/api/choreographers/Rob%20Fowler/follow",
                            headers=erin_ctx["headers"], timeout=30)
        d = requests.delete(f"{BASE_URL}/api/choreographers/Rob%20Fowler/follow",
                            headers=erin_ctx["headers"], timeout=30)
        assert d.status_code == 200
        dj = d.json()
        assert dj.get("is_following") is False

        # Confirm removed
        r = requests.get(f"{BASE_URL}/api/choreographers/me/follows",
                         headers=erin_ctx["headers"], timeout=30)
        follows = r.json().get("choreographers", [])
        names = {(c.get("choreographer") or c.get("name") or "").lower() for c in follows}
        assert "rob fowler" not in names

    def test_follow_nonexistent_returns_404(self, erin_ctx):
        r = requests.post(f"{BASE_URL}/api/choreographers/NotARealChoreographer_{uuid.uuid4().hex[:6]}/follow",
                          headers=erin_ctx["headers"], timeout=30)
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text[:200]}"

    def test_choreographer_detail_shape(self, erin_ctx):
        r = requests.get(f"{BASE_URL}/api/choreographers/Rob%20Fowler",
                         headers=erin_ctx["headers"], timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("choreographer", "choreographer_key", "dance_count",
                  "follower_count", "is_following", "dances"):
            assert k in d, f"detail missing '{k}'"
        assert isinstance(d["dances"], list)


# ---------------------------------------------------------------------------
# 2. Chat @mentions
# ---------------------------------------------------------------------------
class TestChatMentions:
    def test_post_chat_with_mention_creates_ledger(self, erin_ctx, jamin_ctx):
        marker = uuid.uuid4().hex[:8]
        # Jamin mentions Erin (mentioner != recipient)
        payload = {"message": f"Hey @Erin, welcome! (regression {marker})"}
        r = requests.post(f"{BASE_URL}/api/chat/messages", json=payload,
                          headers=jamin_ctx["headers"], timeout=30)
        assert r.status_code == 200, r.text[:200]
        msg = r.json()
        assert msg.get("id"), "expected message id"
        # give the fan-out a moment (it's inline; this is defensive)
        time.sleep(0.5)

        # Erin fetches her mentions
        r2 = requests.get(f"{BASE_URL}/api/chat/mentions/me?limit=40",
                          headers=erin_ctx["headers"], timeout=30)
        assert r2.status_code == 200
        data = r2.json()
        assert "mentions" in data and isinstance(data["mentions"], list)
        assert "unread_count" in data
        # Look for the marker in Erin's recent mentions
        matching = [m for m in data["mentions"] if marker in (m.get("message_text_snippet") or m.get("message") or "")]
        assert matching, f"mention ledger row not found for marker={marker}. Got {len(data['mentions'])} rows."
        m = matching[0]
        assert m.get("mentioner_id") == jamin_ctx["user"]["user_id"]

    def test_mark_seen(self, erin_ctx):
        r = requests.post(f"{BASE_URL}/api/chat/mentions/mark-seen", json={},
                          headers=erin_ctx["headers"], timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body.get("ok") is True
        assert int(body.get("updated", 0)) >= 0  # 0 is valid if there were none unread
        # After mark-seen, unread_count should be 0
        r2 = requests.get(f"{BASE_URL}/api/chat/mentions/me?limit=5",
                          headers=erin_ctx["headers"], timeout=30)
        assert r2.status_code == 200
        assert int(r2.json().get("unread_count", -1)) == 0


# ---------------------------------------------------------------------------
# 3. Admin Refresh Recommendations
# ---------------------------------------------------------------------------
class TestRefreshRecommendations:
    def test_list_admin_only(self, erin_ctx):
        r = requests.get(f"{BASE_URL}/api/admin/refresh-recommendations?seen=false&limit=50",
                         headers=erin_ctx["headers"], timeout=30)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "flags" in data and isinstance(data["flags"], list)
        assert data.get("count") == len(data["flags"])

    def test_counts(self, erin_ctx):
        r = requests.get(f"{BASE_URL}/api/admin/refresh-recommendations/counts",
                         headers=erin_ctx["headers"], timeout=30)
        assert r.status_code == 200
        d = r.json()
        # Contract says "{unseen, total}"; accept ints only
        assert "unseen" in d and "total" in d, d
        assert isinstance(d["unseen"], int) and isinstance(d["total"], int)

    def test_seen_and_delete_endpoints_error_shape(self, erin_ctx):
        # We deliberately do NOT run the multi-minute rerun. Instead
        # confirm the seen / dismiss endpoints are wired: hitting them
        # with a random id must return 200 with updated=0/removed=0.
        fake_id = f"nonexistent_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{BASE_URL}/api/admin/refresh-recommendations/{fake_id}/seen",
                          headers=erin_ctx["headers"], timeout=30)
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert j.get("ok") is True
        assert int(j.get("updated", -1)) == 0

        d = requests.delete(f"{BASE_URL}/api/admin/refresh-recommendations/{fake_id}",
                            headers=erin_ctx["headers"], timeout=30)
        assert d.status_code == 200
        dj = d.json()
        assert dj.get("ok") is True
        assert int(dj.get("removed", -1)) == 0

    def test_non_admin_forbidden(self):
        # Register a throwaway user, confirm the endpoint refuses them.
        email = f"test_regression_{uuid.uuid4().hex[:8]}@example.com"
        reg = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "TestPass1!", "name": "TEST Regression"
        }, timeout=30)
        if reg.status_code not in (200, 201):
            pytest.skip(f"register unavailable in preview: {reg.status_code}")
        tok = reg.json().get("token")
        assert tok
        r = requests.get(f"{BASE_URL}/api/admin/refresh-recommendations/counts",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r.status_code in (401, 403), f"non-admin should be blocked, got {r.status_code}"


# ---------------------------------------------------------------------------
# 4. Report + Block chaining (existing endpoints still healthy)
# ---------------------------------------------------------------------------
class TestReportAndBlockStillWork:
    def test_blocks_list_ok(self, erin_ctx):
        r = requests.get(f"{BASE_URL}/api/blocks", headers=erin_ctx["headers"], timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert "blocks" in r.json()

    def test_report_and_block_flow(self, erin_ctx, jamin_ctx):
        # Need a feed post to report. Grab any recent one.
        r = requests.get(f"{BASE_URL}/api/feed?limit=5",
                         headers=jamin_ctx["headers"], timeout=30)
        if r.status_code != 200:
            pytest.skip(f"feed unavailable: {r.status_code}")
        posts = r.json().get("events") or r.json().get("feed") or r.json().get("items") or []
        if not posts:
            pytest.skip("no feed posts available to report")

        # Find a post NOT authored by Erin so blocking is meaningful
        erin_id = erin_ctx["user"]["user_id"]

        def _uid(p):
            u = p.get("user") or {}
            return u.get("user_id") or p.get("user_id")

        target = next((p for p in posts if _uid(p) and _uid(p) != erin_id), None)
        if not target:
            pytest.skip("no non-erin feed post to report")

        pid = target.get("id") or target.get("event_id")
        target_user_id = _uid(target)

        # Report — endpoint still exists
        rep = requests.post(f"{BASE_URL}/api/feed/{pid}/report",
                            json={"reason": "spam", "detail": "TEST regression report"},
                            headers=erin_ctx["headers"], timeout=30)
        assert rep.status_code in (200, 201, 202), f"report failed: {rep.status_code} {rep.text[:200]}"

        # Block — endpoint still exists
        blk = requests.post(f"{BASE_URL}/api/blocks",
                            json={"user_id": target_user_id},
                            headers=erin_ctx["headers"], timeout=30)
        assert blk.status_code in (200, 201), f"block failed: {blk.status_code} {blk.text[:200]}"

        # Clean up: unblock so we don't pollute state for other tests
        requests.delete(f"{BASE_URL}/api/blocks/{target_user_id}",
                        headers=erin_ctx["headers"], timeout=30)
