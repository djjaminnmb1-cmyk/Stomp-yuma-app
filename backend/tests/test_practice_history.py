"""Phase 2 Practice History backend verification.

Covers:
  1. GET /api/practice-history?days=30 shape + contiguity + auth.
  2. GET /api/practice-history clamping (days=0, 999, "abc", empty).
  3. POST /api/practice-log/{id} → daily rollup wiring (fresh user, 3 hits
     to same day → count=3, total=3, days_active=1, best_day today).
  4. Cross-user isolation (two users same day, independent counters).
  5. Regression: POST /api/practice-log/{id} still returns badge/streak envelope.
     GET /api/recently-practiced, /api/badges, /api/streak, /api/tracking/*
     still work.
  6. DELETE /api/auth/me purges practice_daily rows for that user_id.

Run:
    pytest /app/backend/tests/test_practice_history.py -v \
        --junitxml=/app/test_reports/pytest/practice_history.xml
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

# ------------ Base URL ------------
BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
assert BASE, "EXPO_PUBLIC_BACKEND_URL must be set for tests"
BASE = BASE.rstrip("/")

ADMIN_EMAIL = "admin@stompinground.com"
ADMIN_PASSWORD = "Admin123!"


# ------------ Helpers / Fixtures ------------
@pytest.fixture(scope="session")
def sess():
    return requests.Session()


def _register(sess, prefix="TEST_ph"):
    email = f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    r = sess.post(f"{BASE}/api/auth/register", json={
        "email": email, "password": "TestPass123!", "name": "PH Test",
    })
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    j = r.json()
    return j["token"], j["user"], email


def _auth(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def dance_ids(sess):
    r = sess.get(f"{BASE}/api/dances?limit=3")
    assert r.status_code == 200
    ids = [d["id"] for d in r.json() if d.get("is_published", True)]
    assert len(ids) >= 2, "Need at least 2 published dances"
    return ids


def _today_utc() -> str:
    return datetime.now(timezone.utc).date().isoformat()


# ------------ 1. Shape + contiguity + auth ------------
class TestPracticeHistoryShape:
    def test_requires_auth(self, sess):
        r = sess.get(f"{BASE}/api/practice-history?days=30")
        assert r.status_code in (401, 403), (
            f"expected 401/403 unauthenticated, got {r.status_code} body={r.text}"
        )

    def test_shape_and_contiguity_fresh_user(self, sess):
        tok, _, _ = _register(sess)
        r = sess.get(
            f"{BASE}/api/practice-history?days=30", headers=_auth(tok)
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        # top-level keys
        assert set(body.keys()) >= {"days", "total", "days_active", "best_day"}, (
            f"missing keys: {body.keys()}"
        )
        days = body["days"]
        assert isinstance(days, list)
        assert len(days) == 30, f"expected 30 entries, got {len(days)}"
        # every entry has {date, count}
        for entry in days:
            assert set(entry.keys()) >= {"date", "count"}
            # YYYY-MM-DD format
            assert len(entry["date"]) == 10 and entry["date"][4] == "-", (
                f"bad date fmt: {entry['date']}"
            )
            datetime.strptime(entry["date"], "%Y-%m-%d")  # raises if bad

        # Ordered oldest → newest
        dates = [e["date"] for e in days]
        assert dates == sorted(dates), "days must be sorted oldest→newest"

        # Contiguous: each date exactly +1 day
        for i in range(1, len(dates)):
            prev = datetime.strptime(dates[i - 1], "%Y-%m-%d").date()
            cur = datetime.strptime(dates[i], "%Y-%m-%d").date()
            assert (cur - prev).days == 1, (
                f"gap between {prev} and {cur} — days must be contiguous"
            )

        # Newest is today (UTC)
        assert dates[-1] == _today_utc(), (
            f"last date should be today ({_today_utc()}), got {dates[-1]}"
        )
        # Oldest is today - 29
        expected_start = (
            datetime.now(timezone.utc).date() - timedelta(days=29)
        ).isoformat()
        assert dates[0] == expected_start, (
            f"first date should be today-29 ({expected_start}), got {dates[0]}"
        )

        # Fresh user: all zeros
        assert body["total"] == 0
        assert body["days_active"] == 0
        assert all(e["count"] == 0 for e in days)
        # best_day still has shape (all zeros → first day, count 0)
        assert set(body["best_day"].keys()) >= {"date", "count"}
        assert body["best_day"]["count"] == 0


# ------------ 2. Clamping ------------
class TestPracticeHistoryClamping:
    def test_days_zero_clamps_to_one(self, sess):
        tok, _, _ = _register(sess)
        r = sess.get(f"{BASE}/api/practice-history?days=0", headers=_auth(tok))
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["days"]) == 1, (
            f"days=0 should clamp to 1, got {len(body['days'])}"
        )

    def test_days_999_clamps_to_180(self, sess):
        tok, _, _ = _register(sess)
        r = sess.get(f"{BASE}/api/practice-history?days=999", headers=_auth(tok))
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["days"]) == 180, (
            f"days=999 should clamp to 180, got {len(body['days'])}"
        )

    def test_days_abc_falls_back_to_30(self, sess):
        tok, _, _ = _register(sess)
        r = sess.get(f"{BASE}/api/practice-history?days=abc", headers=_auth(tok))
        assert r.status_code == 200, r.text
        assert len(r.json()["days"]) == 30

    def test_days_empty_falls_back_to_30(self, sess):
        tok, _, _ = _register(sess)
        r = sess.get(f"{BASE}/api/practice-history?days=", headers=_auth(tok))
        assert r.status_code == 200, r.text
        assert len(r.json()["days"]) == 30

    def test_days_negative_clamps_to_one(self, sess):
        tok, _, _ = _register(sess)
        r = sess.get(f"{BASE}/api/practice-history?days=-5", headers=_auth(tok))
        assert r.status_code == 200, r.text
        assert len(r.json()["days"]) == 1


# ------------ 3. Rollup wiring ------------
class TestPracticeLogRollup:
    def test_three_hits_show_count_three_today(self, sess, dance_ids):
        tok, _, _ = _register(sess)

        # Baseline: all zeros
        r = sess.get(f"{BASE}/api/practice-history?days=7", headers=_auth(tok))
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 0
        assert body["days_active"] == 0
        assert all(e["count"] == 0 for e in body["days"])

        # Fire practice-log 3 times against valid published dance
        for i in range(3):
            r = sess.post(
                f"{BASE}/api/practice-log/{dance_ids[0]}",
                headers=_auth(tok),
            )
            assert r.status_code == 200, (
                f"practice-log #{i} failed: {r.status_code} {r.text}"
            )

        # Verify rollup
        r = sess.get(f"{BASE}/api/practice-history?days=7", headers=_auth(tok))
        assert r.status_code == 200, r.text
        body = r.json()
        today = _today_utc()

        assert body["total"] == 3, (
            f"total should be 3 after 3 hits, got {body['total']} — body={body}"
        )
        assert body["days_active"] == 1, (
            f"days_active should be 1, got {body['days_active']}"
        )
        assert body["best_day"]["date"] == today, (
            f"best_day date should be today ({today}), got {body['best_day']}"
        )
        assert body["best_day"]["count"] == 3, (
            f"best_day count should be 3, got {body['best_day']}"
        )
        # Today's row is 3, all others 0
        for entry in body["days"]:
            expected = 3 if entry["date"] == today else 0
            assert entry["count"] == expected, (
                f"day {entry['date']} expected {expected}, got {entry['count']}"
            )


# ------------ 4. Cross-user isolation ------------
class TestCrossUserIsolation:
    def test_two_users_dont_contaminate(self, sess, dance_ids):
        tok_a, _, _ = _register(sess, prefix="TEST_ph_iso_a")
        tok_b, _, _ = _register(sess, prefix="TEST_ph_iso_b")

        # A: 2 hits, B: 5 hits — same day
        for _ in range(2):
            r = sess.post(
                f"{BASE}/api/practice-log/{dance_ids[0]}", headers=_auth(tok_a)
            )
            assert r.status_code == 200
        for _ in range(5):
            r = sess.post(
                f"{BASE}/api/practice-log/{dance_ids[1]}", headers=_auth(tok_b)
            )
            assert r.status_code == 200

        r_a = sess.get(
            f"{BASE}/api/practice-history?days=7", headers=_auth(tok_a)
        ).json()
        r_b = sess.get(
            f"{BASE}/api/practice-history?days=7", headers=_auth(tok_b)
        ).json()

        assert r_a["total"] == 2, f"A total should be 2, got {r_a['total']}"
        assert r_b["total"] == 5, f"B total should be 5, got {r_b['total']}"
        assert r_a["best_day"]["count"] == 2
        assert r_b["best_day"]["count"] == 5


# ------------ 5. Regression on practice-log envelope + other endpoints ------------
class TestRegression:
    def test_practice_log_still_returns_badge_streak_envelope(self, sess, dance_ids):
        tok, _, _ = _register(sess)
        r = sess.post(
            f"{BASE}/api/practice-log/{dance_ids[0]}", headers=_auth(tok)
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert set(body.keys()) >= {
            "ok", "last_opened_at", "newly_earned_badges", "streak",
        }, f"missing envelope keys: got {body.keys()}"
        assert body["ok"] is True
        assert isinstance(body["newly_earned_badges"], list)
        # streak on first-ever practice bumps to 1
        s = body["streak"]
        assert isinstance(s, dict)
        assert set(s.keys()) >= {"current", "longest", "last_streak_date"}
        assert s["current"] >= 1

    def test_recently_practiced_still_works(self, sess, dance_ids):
        tok, _, _ = _register(sess)
        # log one practice so there's a row
        sess.post(f"{BASE}/api/practice-log/{dance_ids[0]}", headers=_auth(tok))
        r = sess.get(f"{BASE}/api/recently-practiced", headers=_auth(tok))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and isinstance(body["items"], list)
        assert len(body["items"]) >= 1
        assert body["items"][0]["dance"]["id"] == dance_ids[0]

    def test_badges_endpoint_still_works(self, sess):
        tok, _, _ = _register(sess)
        r = sess.get(f"{BASE}/api/badges", headers=_auth(tok))
        assert r.status_code == 200, r.text
        assert "badges" in r.json()

    def test_streak_endpoint_still_works(self, sess):
        tok, _, _ = _register(sess)
        r = sess.get(f"{BASE}/api/streak", headers=_auth(tok))
        assert r.status_code == 200
        assert set(r.json().keys()) == {"current", "longest", "last_streak_date"}

    def test_tracking_me_still_works(self, sess):
        tok, _, _ = _register(sess)
        r = sess.get(f"{BASE}/api/tracking/me", headers=_auth(tok))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_tracking_post_still_works(self, sess, dance_ids):
        tok, _, _ = _register(sess)
        r = sess.post(
            f"{BASE}/api/tracking/{dance_ids[0]}",
            headers=_auth(tok),
            json={"status": "wishlist", "rating": 0, "notes": ""},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Endpoint returns the tracking row directly (with dance_id/status).
        assert body.get("dance_id") == dance_ids[0]
        assert body.get("status") == "wishlist"


# ------------ 6. DELETE /api/auth/me purges practice_daily ------------
class TestAccountDeletionPurgesRollup:
    def test_delete_account_removes_practice_daily_rows(self, sess, dance_ids):
        tok, user, _ = _register(sess, prefix="TEST_ph_del")
        uid = user["user_id"]

        # Create a rollup row
        r = sess.post(
            f"{BASE}/api/practice-log/{dance_ids[0]}", headers=_auth(tok)
        )
        assert r.status_code == 200

        # Confirm the row exists via API (indirect but sufficient)
        r_hist = sess.get(
            f"{BASE}/api/practice-history?days=7", headers=_auth(tok)
        ).json()
        assert r_hist["total"] == 1, (
            f"expected total=1 before delete, got {r_hist['total']}"
        )

        # Delete account
        r = sess.delete(f"{BASE}/api/auth/me", headers=_auth(tok))
        assert r.status_code == 200, f"delete failed: {r.status_code} {r.text}"

        # Direct mongo verification: no orphan rows in practice_daily for this uid
        async def _check_orphans():
            # Late import so we use the actual server MONGO_URL/DB_NAME
            import sys
            sys.path.insert(0, "/app/backend")
            from core.database import db as _db  # noqa: WPS433
            count = await _db.practice_daily.count_documents({"user_id": uid})
            return count

        orphan_count = asyncio.get_event_loop().run_until_complete(
            _check_orphans()
        ) if False else asyncio.new_event_loop().run_until_complete(
            _check_orphans()
        )
        assert orphan_count == 0, (
            f"practice_daily has {orphan_count} orphan rows for deleted user {uid}"
        )
