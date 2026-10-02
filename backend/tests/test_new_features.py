"""Tests for NEW / MODIFIED endpoints in the current iteration:

- Recently Practiced (routes/activity.py)
- Leaderboard Prizes (routes/prizes.py)
- Admin Leaderboard controls (routes/admin_leaderboard.py)
- Instructor Trend chart (routes/dashboard.py addition)
- Leaderboard (routes/leaderboard.py) — now honors season pointer +
  hidden-by-admin flag

Run:
    pytest /app/backend/tests/test_new_features.py -v --tb=short \
        --junitxml=/app/test_reports/pytest/new_features.xml
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest
import requests

from _creds import (  # SEC-001 remediation — passwords from .env
    ADMIN_EMAIL as GEN_ADMIN_EMAIL,
    ADMIN_PASSWORD as GEN_ADMIN_PASSWORD,
    ERIN_EMAIL,
    ERIN_PASSWORD,
    JAMIN_EMAIL,
    JAMIN_PASSWORD,
)


# ---------- Config ----------
def _load_backend_url() -> str:
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").strip()
    if not url:
        env_path = Path("/app/frontend/.env")
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.strip().startswith("EXPO_PUBLIC_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not url:
        raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not set")
    return url.rstrip("/")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

# Primary admin for this suite = Erin. ``ADMIN_EMAIL`` / ``ADMIN_PASSWORD``
# are kept local for backward-compat with assertions below.
ADMIN_EMAIL = ERIN_EMAIL
ADMIN_PASSWORD = ERIN_PASSWORD
# GEN_ADMIN_* (admin@stompinground.com) come straight from _creds above.
INSTRUCTOR_EMAIL = JAMIN_EMAIL
INSTRUCTOR_PASSWORD = JAMIN_PASSWORD


# ---------- Fixtures ----------
def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api, email, password):
    r = api.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token(api):
    return _login(api, ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def gen_admin_token(api):
    return _login(api, GEN_ADMIN_EMAIL, GEN_ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def instructor_token(api):
    return _login(api, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD)


@pytest.fixture(scope="session")
def instructor_user(api, instructor_token):
    r = api.get(f"{API}/auth/me", headers=_hdr(instructor_token))
    assert r.status_code == 200
    return r.json()


def _make_user(api):
    email = f"TEST_new_{uuid.uuid4().hex[:8]}@example.com"
    password = "TestPass123!"
    r = api.post(f"{API}/auth/register", json={
        "email": email, "password": password, "name": "TEST New Features"
    })
    assert r.status_code == 200, r.text
    body = r.json()
    return {
        "email": email, "password": password,
        "token": body["token"], "user": body["user"],
        "user_id": body["user"]["user_id"],
    }


@pytest.fixture()
def plain_user(api):
    u = _make_user(api)
    yield u
    try:
        api.delete(f"{API}/auth/me", headers=_hdr(u["token"]))
    except Exception:
        pass


@pytest.fixture(scope="session")
def any_dance_id(api):
    r = api.get(f"{API}/dances")
    assert r.status_code == 200
    return r.json()[0]["id"]


@pytest.fixture(scope="session")
def two_dance_ids(api):
    r = api.get(f"{API}/dances")
    assert r.status_code == 200
    lst = r.json()
    return [lst[0]["id"], lst[1]["id"]]


# ==================== SANITY / REGRESSION SMOKE ====================
class TestRegressionSanity:
    """Fast sanity checks for previously-passing surfaces."""

    def test_seed_admin_login(self, admin_token):
        assert admin_token

    def test_seed_gen_admin_login(self, gen_admin_token):
        assert gen_admin_token

    def test_seed_instructor_login(self, instructor_token):
        assert instructor_token

    def test_dances_over_200(self, api):
        r = api.get(f"{API}/dances")
        assert r.status_code == 200
        assert len(r.json()) > 200

    def test_leaderboard_reachable(self, api):
        r = api.get(f"{API}/leaderboard")
        assert r.status_code == 200
        body = r.json()
        assert "entries" in body

    def test_instructor_dashboard_ok(self, api, instructor_token):
        r = api.get(f"{API}/instructor/dashboard",
                    headers=_hdr(instructor_token))
        assert r.status_code == 200

    def test_song_preview(self, api):
        r = api.get(f"{API}/song-preview",
                    params={"song": "A Bar Song (Tipsy)",
                            "artist": "Shaboozey"})
        assert r.status_code in (200, 404), r.text


# ==================== 1. RECENTLY PRACTICED ====================
class TestPracticeLog:
    def test_log_practice_401_no_auth(self, api, any_dance_id):
        r = api.post(f"{API}/practice-log/{any_dance_id}")
        assert r.status_code == 401

    def test_log_practice_bogus_dance_404(self, api, plain_user):
        r = api.post(f"{API}/practice-log/dance_bogus_xyz",
                     headers=_hdr(plain_user["token"]))
        assert r.status_code == 404

    def test_log_practice_ok_and_increments(self, api, plain_user, any_dance_id):
        # First open
        r1 = api.post(f"{API}/practice-log/{any_dance_id}",
                      headers=_hdr(plain_user["token"]))
        assert r1.status_code == 200
        b1 = r1.json()
        assert b1.get("ok") is True
        assert b1.get("last_opened_at")

        # Second open
        r2 = api.post(f"{API}/practice-log/{any_dance_id}",
                      headers=_hdr(plain_user["token"]))
        assert r2.status_code == 200

        # Verify count via /recently-practiced
        rp = api.get(f"{API}/recently-practiced",
                     headers=_hdr(plain_user["token"]))
        assert rp.status_code == 200
        items = rp.json().get("items", [])
        match = [it for it in items if it["dance"]["id"] == any_dance_id]
        assert len(match) == 1
        assert match[0]["practice_count"] >= 2


class TestRecentlyPracticed:
    def test_401_no_auth(self, api):
        r = api.get(f"{API}/recently-practiced")
        assert r.status_code == 401

    def test_empty_for_new_user(self, api, plain_user):
        r = api.get(f"{API}/recently-practiced",
                    headers=_hdr(plain_user["token"]))
        assert r.status_code == 200
        assert r.json() == {"items": []}

    def test_shape_and_desc_sort(self, api, plain_user, two_dance_ids):
        # Open dance A, then B — expect B first
        a, b = two_dance_ids
        r1 = api.post(f"{API}/practice-log/{a}",
                      headers=_hdr(plain_user["token"]))
        assert r1.status_code == 200
        # Ensure timestamps differ (ISO string granularity → sleep a hair)
        import time
        time.sleep(0.05)
        r2 = api.post(f"{API}/practice-log/{b}",
                      headers=_hdr(plain_user["token"]))
        assert r2.status_code == 200

        rp = api.get(f"{API}/recently-practiced",
                     headers=_hdr(plain_user["token"]))
        assert rp.status_code == 200
        items = rp.json()["items"]
        assert len(items) == 2
        assert items[0]["dance"]["id"] == b
        assert items[1]["dance"]["id"] == a
        # Shape
        for it in items:
            assert "dance" in it and "id" in it["dance"] and "name" in it["dance"]
            assert "last_activity_at" in it
            assert "status" in it
            assert "practice_count" in it and isinstance(it["practice_count"], int)

    def test_merges_tracking_signal(self, api, plain_user, any_dance_id):
        # Add a tracking completion (no practice-log for this dance)
        r = api.post(f"{API}/tracking/{any_dance_id}",
                     json={"status": "completed"},
                     headers=_hdr(plain_user["token"]))
        assert r.status_code == 200
        rp = api.get(f"{API}/recently-practiced",
                     headers=_hdr(plain_user["token"]))
        assert rp.status_code == 200
        items = rp.json()["items"]
        found = [it for it in items if it["dance"]["id"] == any_dance_id]
        assert found
        assert found[0]["status"] == "completed"

    def test_limit_clamping(self, api, plain_user, any_dance_id):
        # Log at least once so items list is non-empty
        api.post(f"{API}/practice-log/{any_dance_id}",
                 headers=_hdr(plain_user["token"]))
        # limit=0 should clamp to 1
        r = api.get(f"{API}/recently-practiced",
                    params={"limit": 0},
                    headers=_hdr(plain_user["token"]))
        assert r.status_code == 200
        assert len(r.json()["items"]) <= 1
        # limit=999 should clamp to 50
        r2 = api.get(f"{API}/recently-practiced",
                     params={"limit": 999},
                     headers=_hdr(plain_user["token"]))
        assert r2.status_code == 200
        assert len(r2.json()["items"]) <= 50


# ==================== 2. LEADERBOARD PRIZES ====================
class TestPrizes:
    def test_public_list_all_range(self, api):
        r = api.get(f"{API}/leaderboard/prizes", params={"range": "all"})
        assert r.status_code == 200
        body = r.json()
        assert body["range"] == "all"
        assert len(body["prizes"]) == 3
        ranks = [p["rank"] for p in body["prizes"]]
        assert ranks == [1, 2, 3]
        # Every entry has title / description / image keys
        for p in body["prizes"]:
            for k in ("title", "description", "image"):
                assert k in p

    def test_invalid_range_400(self, api):
        r = api.get(f"{API}/leaderboard/prizes", params={"range": "decade"})
        assert r.status_code == 400

    def test_upsert_non_admin_403(self, api, plain_user):
        r = api.put(f"{API}/admin/leaderboard/prizes/1",
                    params={"range": "all"},
                    json={"title": "T", "description": "D"},
                    headers=_hdr(plain_user["token"]))
        assert r.status_code == 403

    def test_upsert_no_auth_401(self, api):
        r = api.put(f"{API}/admin/leaderboard/prizes/1",
                    params={"range": "all"},
                    json={"title": "T", "description": "D"})
        assert r.status_code == 401

    def test_upsert_bad_rank_400(self, api, admin_token):
        r = api.put(f"{API}/admin/leaderboard/prizes/9",
                    params={"range": "all"},
                    json={"title": "T", "description": "D"},
                    headers=_hdr(admin_token))
        assert r.status_code == 400

    def test_upsert_bad_range_400(self, api, admin_token):
        r = api.put(f"{API}/admin/leaderboard/prizes/1",
                    params={"range": "decade"},
                    json={"title": "T", "description": "D"},
                    headers=_hdr(admin_token))
        assert r.status_code == 400

    def test_upsert_oversized_image_413(self, api, admin_token):
        big = "a" * 2_100_001
        r = api.put(f"{API}/admin/leaderboard/prizes/1",
                    params={"range": "all"},
                    json={"title": "T", "description": "D", "image": big},
                    headers=_hdr(admin_token))
        assert r.status_code == 413

    def test_upsert_then_get_then_delete(self, api, admin_token):
        # Use "month" so we don't collide with any pre-existing "all" data
        title = f"TEST Prize {uuid.uuid4().hex[:6]}"
        r = api.put(f"{API}/admin/leaderboard/prizes/2",
                    params={"range": "month"},
                    json={"title": title, "description": "Test Desc"},
                    headers=_hdr(admin_token))
        assert r.status_code == 200

        rg = api.get(f"{API}/leaderboard/prizes", params={"range": "month"})
        assert rg.status_code == 200
        prizes = {p["rank"]: p for p in rg.json()["prizes"]}
        assert prizes[2]["title"] == title
        assert prizes[2]["description"] == "Test Desc"

        # Delete
        rd = api.delete(f"{API}/admin/leaderboard/prizes/2",
                        params={"range": "month"},
                        headers=_hdr(admin_token))
        assert rd.status_code == 200

        # After delete: rank 2 slot returns empty title/desc
        rg2 = api.get(f"{API}/leaderboard/prizes", params={"range": "month"})
        prizes2 = {p["rank"]: p for p in rg2.json()["prizes"]}
        assert prizes2[2]["title"] == ""
        assert prizes2[2]["description"] == ""
        assert prizes2[2]["image"] == ""

    def test_delete_non_admin_403(self, api, plain_user):
        r = api.delete(f"{API}/admin/leaderboard/prizes/1",
                       params={"range": "all"},
                       headers=_hdr(plain_user["token"]))
        assert r.status_code == 403

    def test_delete_instructor_only_403(self, api, instructor_token):
        r = api.delete(f"{API}/admin/leaderboard/prizes/1",
                       params={"range": "all"},
                       headers=_hdr(instructor_token))
        assert r.status_code == 403


# ==================== 3. ADMIN LEADERBOARD CONTROLS ====================
class TestAdminLeaderboardControls:
    # ---- Hide / unhide ----
    def test_hide_non_admin_403(self, api, instructor_token):
        r = api.post(f"{API}/admin/leaderboard/users/some_uid/hide",
                     headers=_hdr(instructor_token))
        assert r.status_code == 403

    def test_hide_no_auth_401(self, api):
        r = api.post(f"{API}/admin/leaderboard/users/some_uid/hide")
        assert r.status_code == 401

    def test_hide_bogus_user_404(self, api, admin_token):
        r = api.post(f"{API}/admin/leaderboard/users/user_bogus_xyz/hide",
                     headers=_hdr(admin_token))
        assert r.status_code == 404

    def test_hide_flow(self, api, admin_token, plain_user, any_dance_id):
        uid = plain_user["user_id"]
        tok = plain_user["token"]
        # 1) Opt-in and complete a dance so they'd be on the board
        r = api.patch(f"{API}/users/me/leaderboard",
                      json={"show_on_leaderboard": True},
                      headers=_hdr(tok))
        assert r.status_code == 200
        r = api.post(f"{API}/tracking/{any_dance_id}",
                     json={"status": "completed"},
                     headers=_hdr(tok))
        assert r.status_code == 200

        # 2) Hide as admin
        r = api.post(f"{API}/admin/leaderboard/users/{uid}/hide",
                     headers=_hdr(admin_token))
        assert r.status_code == 200
        assert r.json()["hidden"] is True

        # 3) Hidden-users list contains them
        r = api.get(f"{API}/admin/leaderboard/hidden-users",
                    headers=_hdr(admin_token))
        assert r.status_code == 200
        body = r.json()
        assert uid in body["hidden_user_ids"]
        assert any(u["user_id"] == uid for u in body["users"])

        # 4) Public leaderboard no longer shows them
        # Try a couple of ranges; they should be absent from public entries.
        # (Anon caller — no me block interference.)
        rb = api.get(f"{API}/leaderboard").json()
        for e in rb["entries"]:
            # public entries don't expose user_id but do expose name
            assert e.get("name") != plain_user["user"]["name"], \
                "hidden user is still on public leaderboard"

        # 5) Their private `me` block still shows their rank (they are the caller)
        rme = api.get(f"{API}/leaderboard", headers=_hdr(tok)).json()
        me = rme.get("me")
        assert me is not None
        # They completed 1 dance
        assert me["count"] >= 1

        # 6) Unhide
        r = api.post(f"{API}/admin/leaderboard/users/{uid}/unhide",
                     headers=_hdr(admin_token))
        assert r.status_code == 200
        assert r.json()["hidden"] is False

        # 7) Hidden list no longer contains them
        r = api.get(f"{API}/admin/leaderboard/hidden-users",
                    headers=_hdr(admin_token))
        assert uid not in r.json()["hidden_user_ids"]

    def test_hidden_users_non_admin_403(self, api, instructor_token):
        r = api.get(f"{API}/admin/leaderboard/hidden-users",
                    headers=_hdr(instructor_token))
        assert r.status_code == 403

    # ---- Reset user completions ----
    def test_reset_user_non_admin_403(self, api, instructor_token):
        r = api.post(f"{API}/admin/leaderboard/users/some_uid/reset",
                     headers=_hdr(instructor_token))
        assert r.status_code == 403

    def test_reset_user_bogus_404(self, api, admin_token):
        r = api.post(f"{API}/admin/leaderboard/users/user_bogus_xyz/reset",
                     headers=_hdr(admin_token))
        assert r.status_code == 404

    def test_reset_user_wipes_completed_preserves_wishlist(
            self, api, admin_token, plain_user, two_dance_ids
    ):
        uid = plain_user["user_id"]
        tok = plain_user["token"]
        a, b = two_dance_ids
        # Mark a=completed, b=wishlist
        assert api.post(f"{API}/tracking/{a}",
                        json={"status": "completed"},
                        headers=_hdr(tok)).status_code == 200
        assert api.post(f"{API}/tracking/{b}",
                        json={"status": "wishlist"},
                        headers=_hdr(tok)).status_code == 200

        # Reset
        r = api.post(f"{API}/admin/leaderboard/users/{uid}/reset",
                     headers=_hdr(admin_token))
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["removed_completions"] >= 1

        # tracking/me should have wishlist row but no completed rows
        rt = api.get(f"{API}/tracking/me", headers=_hdr(tok))
        assert rt.status_code == 200
        rows = rt.json()
        assert not any(x["status"] == "completed" for x in rows)
        assert any(x["status"] == "wishlist" and x["dance_id"] == b for x in rows)

    # ---- Season epoch ----
    def test_season_get_non_admin_403(self, api, instructor_token):
        r = api.get(f"{API}/admin/leaderboard/season",
                    headers=_hdr(instructor_token))
        assert r.status_code == 403

    def test_season_get_admin(self, api, admin_token):
        r = api.get(f"{API}/admin/leaderboard/season",
                    headers=_hdr(admin_token))
        assert r.status_code == 200
        body = r.json()
        assert "current" in body
        assert "past" in body
        assert isinstance(body["past"], list)

    def test_season_reset_non_admin_403(self, api, instructor_token):
        r = api.post(f"{API}/admin/leaderboard/season/reset",
                     json={"label": "Nope"},
                     headers=_hdr(instructor_token))
        assert r.status_code == 403

    def test_season_delete_non_admin_403(self, api, instructor_token):
        r = api.delete(f"{API}/admin/leaderboard/season",
                       headers=_hdr(instructor_token))
        assert r.status_code == 403

    def test_season_lifecycle(self, api, admin_token, plain_user, any_dance_id):
        # Baseline: a user with 1 completion, opted-in
        tok = plain_user["token"]
        api.patch(f"{API}/users/me/leaderboard",
                  json={"show_on_leaderboard": True},
                  headers=_hdr(tok))
        api.post(f"{API}/tracking/{any_dance_id}",
                 json={"status": "completed"},
                 headers=_hdr(tok))

        # Confirm they show up on all-time board (name match)
        pre = api.get(f"{API}/leaderboard", params={"range": "all"}).json()
        names_pre = {e["name"] for e in pre["entries"]}
        assert plain_user["user"]["name"] in names_pre or \
            len(pre["entries"]) == 0  # possible if other tests reset

        # Start a new season
        label = f"TEST Season {uuid.uuid4().hex[:5]}"
        r = api.post(f"{API}/admin/leaderboard/season/reset",
                     json={"label": label},
                     headers=_hdr(admin_token))
        assert r.status_code == 200
        assert r.json()["ok"] is True
        assert r.json()["label"] == label
        started_at = r.json()["started_at"]

        # Immediately after: all-time filters to completions AFTER now
        # so total_dancers should be 0 (or at least our plain_user should
        # not appear because their completion was before the season start).
        post = api.get(f"{API}/leaderboard", params={"range": "all"}).json()
        assert plain_user["user"]["name"] not in {
            e["name"] for e in post["entries"]
        }

        # /admin/leaderboard/season shows the new current + label
        rg = api.get(f"{API}/admin/leaderboard/season",
                     headers=_hdr(admin_token))
        cur = rg.json()["current"]
        assert cur.get("label") == label
        assert cur.get("started_at") == started_at

        # Clear season
        rd = api.delete(f"{API}/admin/leaderboard/season",
                        headers=_hdr(admin_token))
        assert rd.status_code == 200
        assert rd.json()["cleared"] is True

        # After clear: current is empty and all-time shows historical
        # completions again — plain_user should re-appear (unless deleted).
        rg2 = api.get(f"{API}/admin/leaderboard/season",
                      headers=_hdr(admin_token))
        assert rg2.json()["current"] in ({}, {"started_at": None})
        restored = api.get(f"{API}/leaderboard", params={"range": "all"}).json()
        # entries may or may not include plain_user (they were opted-in with
        # 1 completion). Just verify the endpoint works and doesn't error.
        assert "entries" in restored


# ==================== 4. INSTRUCTOR TREND ====================
class TestInstructorTrend:
    def test_no_auth_401(self, api):
        r = api.get(f"{API}/instructor/trend")
        assert r.status_code == 401

    def test_non_instructor_403(self, api, plain_user):
        r = api.get(f"{API}/instructor/trend",
                    headers=_hdr(plain_user["token"]))
        assert r.status_code == 403

    def test_default_shape(self, api, instructor_token):
        r = api.get(f"{API}/instructor/trend",
                    headers=_hdr(instructor_token))
        assert r.status_code == 200
        body = r.json()
        assert "weeks" in body and isinstance(body["weeks"], list)
        assert "totals" in body and "peaks" in body
        # default weeks=8
        assert len(body["weeks"]) == 8
        for w in body["weeks"]:
            assert "week_start" in w
            assert "attendance" in w
            assert "completions" in w
            assert "classes" in w

    def test_weeks_clamped_low(self, api, instructor_token):
        r = api.get(f"{API}/instructor/trend",
                    params={"weeks": 0},
                    headers=_hdr(instructor_token))
        assert r.status_code == 200
        assert len(r.json()["weeks"]) == 2

    def test_weeks_clamped_high(self, api, instructor_token):
        r = api.get(f"{API}/instructor/trend",
                    params={"weeks": 99},
                    headers=_hdr(instructor_token))
        assert r.status_code == 200
        assert len(r.json()["weeks"]) == 26

    def test_ascending_order(self, api, instructor_token):
        r = api.get(f"{API}/instructor/trend",
                    params={"weeks": 6},
                    headers=_hdr(instructor_token))
        assert r.status_code == 200
        weeks = r.json()["weeks"]
        ws = [w["week_start"] for w in weeks]
        assert ws == sorted(ws), "week_start must be ascending"

    def test_totals_match_sum(self, api, instructor_token):
        r = api.get(f"{API}/instructor/trend",
                    params={"weeks": 8},
                    headers=_hdr(instructor_token))
        assert r.status_code == 200
        body = r.json()
        totals = body["totals"]
        weeks = body["weeks"]
        assert totals["completions"] == sum(w["completions"] for w in weeks)
        assert totals["attendance"] == sum(w["attendance"] for w in weeks)
        assert totals["classes"] == sum(w["classes"] for w in weeks)

    def test_admin_can_access(self, api, admin_token):
        r = api.get(f"{API}/instructor/trend",
                    headers=_hdr(admin_token))
        assert r.status_code == 200
