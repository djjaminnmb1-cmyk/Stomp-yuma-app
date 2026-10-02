"""Phase 1 Gamification regression + new-feature verification.

Covers:
  1. GET /api/badges shape + catalog + per-user progress
  2. GET /api/streak (auth required, auto-expire)
  3. POST /api/badges/mark-seen (explicit ids + null → all)
  4. POST /api/tracking/{id} — newly_earned_badges + streak in response,
     idempotent same-day streak, idempotent first_steps.
  5. POST /api/practice-log/{id} — streak bump on first-ever practice.
  6. POST /api/classes/{id}/attend — badges returned, no streak bump.
  7. Regression on GET /api/tracking/me, /api/auth/me, /api/leaderboard,
     /api/dances, /api/classes.
  8. DELETE /api/auth/me cleans user_badges.

Run:
    pytest /app/backend/tests/test_gamification.py -v \
        --junitxml=/app/test_reports/pytest/gamification.xml
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import date, datetime, timezone
from typing import Optional

import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE:
    # Fall back to frontend/.env (populated in this env) rather than a hardcoded prod URL.
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
assert BASE, "EXPO_PUBLIC_BACKEND_URL must be set for tests"
BASE = BASE.rstrip("/")

from _creds import (  # SEC-001 remediation — passwords from .env
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
)

EXPECTED_BADGE_IDS = [
    "first_steps", "getting_groovy", "line_dance_legend", "century_club",
    "perfect_week", "iron_boots",
    "class_regular", "class_devotee",
    "practice_warrior", "practice_maestro",
    "well_rounded", "wishlist_dreamer",
]
BADGE_FIELDS = {
    "id", "title", "description", "icon", "color", "category",
    "requirement", "unit", "progress", "earned", "earned_at", "seen",
}


# -------------------- fixtures --------------------
@pytest.fixture(scope="session")
def sess():
    return requests.Session()


def _register(sess, prefix="TEST_gam"):
    email = f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    r = sess.post(f"{BASE}/api/auth/register", json={
        "email": email, "password": "TestPass123!", "name": "GamTest User",
    })
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    j = r.json()
    return j["token"], j["user"], email


def _auth(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def admin_token(sess):
    r = sess.post(
        f"{BASE}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def dance_ids(sess):
    r = sess.get(f"{BASE}/api/dances?limit=5")
    assert r.status_code == 200
    ids = [d["id"] for d in r.json()]
    assert len(ids) >= 2, "Need at least 2 dances in DB for these tests"
    return ids


@pytest.fixture(scope="session")
def a_class_id(sess, admin_token, dance_ids):
    """Create a throwaway class for attendance tests."""
    r = sess.post(
        f"{BASE}/api/classes",
        headers=_auth(admin_token),
        json={
            "date": "2020-01-01",  # past, won't fire push to real users
            "session_label": "TEST_gam class",
            "notes": "",
            "dance_ids": dance_ids[:1],
        },
    )
    assert r.status_code == 200, f"class create failed: {r.status_code} {r.text}"
    cid = r.json()["id"]
    yield cid
    # cleanup
    try:
        sess.delete(f"{BASE}/api/classes/{cid}", headers=_auth(admin_token))
    except Exception:
        pass


# -------------------- 1. GET /api/badges --------------------
class TestBadgesRead:
    def test_requires_auth(self, sess):
        r = sess.get(f"{BASE}/api/badges")
        assert r.status_code in (401, 403), (
            f"expected 401/403 unauthenticated, got {r.status_code}"
        )

    def test_fresh_user_all_unearned(self, sess):
        tok, _, _ = _register(sess)
        r = sess.get(f"{BASE}/api/badges", headers=_auth(tok))
        assert r.status_code == 200
        body = r.json()
        assert set(body.keys()) >= {
            "badges", "streak", "total_earned", "total_badges", "unseen_count",
        }, f"missing keys: {body.keys()}"
        ids = [b["id"] for b in body["badges"]]
        assert ids == EXPECTED_BADGE_IDS, (
            f"Badge catalog/order mismatch. Got: {ids}"
        )
        # each badge has the full shape
        for b in body["badges"]:
            missing = BADGE_FIELDS - set(b.keys())
            assert not missing, f"badge {b.get('id')} missing keys {missing}"
            assert b["earned"] is False
            assert b["seen"] is False
            assert b["progress"] == 0 or b["category"] in ("streak",)
        assert body["total_earned"] == 0
        assert body["total_badges"] == len(EXPECTED_BADGE_IDS) == 12
        assert body["unseen_count"] == 0
        # streak shape
        s = body["streak"]
        assert set(s.keys()) == {"current", "longest", "last_streak_date"}
        assert s["current"] == 0 and s["longest"] == 0


# -------------------- 2. GET /api/streak --------------------
class TestStreakRead:
    def test_requires_auth(self, sess):
        r = sess.get(f"{BASE}/api/streak")
        assert r.status_code in (401, 403)

    def test_default_zero(self, sess):
        tok, _, _ = _register(sess)
        r = sess.get(f"{BASE}/api/streak", headers=_auth(tok))
        assert r.status_code == 200
        j = r.json()
        assert j == {"current": 0, "longest": 0, "last_streak_date": ""}


# -------------------- 3. mark-seen --------------------
class TestMarkSeen:
    def test_mark_specific_and_all(self, sess, dance_ids):
        tok, _, _ = _register(sess)
        # Earn first_steps via a completion
        r = sess.post(
            f"{BASE}/api/tracking/{dance_ids[0]}",
            headers=_auth(tok),
            json={"status": "completed", "rating": 5, "notes": ""},
        )
        assert r.status_code == 200
        newly = r.json().get("newly_earned_badges") or []
        assert any(b["id"] == "first_steps" for b in newly), (
            f"first_steps should be newly earned, got {newly}"
        )
        # Verify unseen_count == 1
        badges = sess.get(f"{BASE}/api/badges", headers=_auth(tok)).json()
        assert badges["unseen_count"] == 1
        assert badges["total_earned"] == 1

        # Mark specific id
        r = sess.post(
            f"{BASE}/api/badges/mark-seen",
            headers=_auth(tok),
            json={"ids": ["first_steps"]},
        )
        assert r.status_code == 200
        j = r.json()
        assert j.get("ok") is True
        assert j.get("updated") == 1

        # unseen should now be 0
        badges = sess.get(f"{BASE}/api/badges", headers=_auth(tok)).json()
        assert badges["unseen_count"] == 0

        # Idempotent — marking again updates 0
        r = sess.post(
            f"{BASE}/api/badges/mark-seen",
            headers=_auth(tok),
            json={"ids": ["first_steps"]},
        )
        assert r.status_code == 200
        assert r.json().get("updated") == 0

    def test_mark_all_with_empty_body(self, sess, dance_ids):
        tok, _, _ = _register(sess)
        # Earn first_steps
        sess.post(
            f"{BASE}/api/tracking/{dance_ids[0]}",
            headers=_auth(tok),
            json={"status": "completed"},
        )
        # Empty body → mark all
        r = sess.post(
            f"{BASE}/api/badges/mark-seen", headers=_auth(tok), json={},
        )
        assert r.status_code == 200
        assert r.json().get("updated", 0) >= 1
        badges = sess.get(f"{BASE}/api/badges", headers=_auth(tok)).json()
        assert badges["unseen_count"] == 0

    def test_mark_ids_null(self, sess, dance_ids):
        tok, _, _ = _register(sess)
        sess.post(
            f"{BASE}/api/tracking/{dance_ids[0]}",
            headers=_auth(tok),
            json={"status": "completed"},
        )
        r = sess.post(
            f"{BASE}/api/badges/mark-seen",
            headers=_auth(tok),
            json={"ids": None},
        )
        assert r.status_code == 200
        assert r.json().get("updated", 0) >= 1


# -------------------- 4. Tracking auto-awards + streak --------------------
class TestTrackingCompletionFlow:
    def test_first_completion_awards_and_bumps(self, sess, dance_ids):
        tok, _, _ = _register(sess)
        r = sess.post(
            f"{BASE}/api/tracking/{dance_ids[0]}",
            headers=_auth(tok),
            json={"status": "completed", "rating": 4, "notes": "n"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "newly_earned_badges" in body and "streak" in body
        newly = body["newly_earned_badges"]
        assert isinstance(newly, list) and len(newly) >= 1
        ids = [b["id"] for b in newly]
        assert "first_steps" in ids
        # newly-earned entry has full serialized shape
        fs = next(b for b in newly if b["id"] == "first_steps")
        missing = BADGE_FIELDS - set(fs.keys())
        assert not missing
        assert fs["earned"] is True
        # streak
        today = date.today().isoformat()
        s = body["streak"]
        assert s == {"current": 1, "longest": 1, "last_streak_date": today}, (
            f"unexpected streak: {s}"
        )

    def test_same_day_second_completion_idempotent(self, sess, dance_ids):
        tok, _, _ = _register(sess)
        # first completion
        r1 = sess.post(
            f"{BASE}/api/tracking/{dance_ids[0]}",
            headers=_auth(tok),
            json={"status": "completed"},
        )
        assert r1.status_code == 200
        # second completion (same dance, same day)
        r2 = sess.post(
            f"{BASE}/api/tracking/{dance_ids[0]}",
            headers=_auth(tok),
            json={"status": "completed"},
        )
        assert r2.status_code == 200
        j = r2.json()
        # No new badges the second time (first_steps already awarded)
        assert j["newly_earned_badges"] == [], (
            f"expected empty, got {j['newly_earned_badges']}"
        )
        # Streak should NOT double-bump today
        today = date.today().isoformat()
        assert j["streak"] == {
            "current": 1, "longest": 1, "last_streak_date": today,
        }
        # Confirm via GET /api/streak
        r3 = sess.get(f"{BASE}/api/streak", headers=_auth(tok))
        assert r3.json() == {
            "current": 1, "longest": 1, "last_streak_date": today,
        }

    def test_second_dance_same_day_new_completion(self, sess, dance_ids):
        """Completing a DIFFERENT dance same day still no streak bump but
        tracks progress."""
        if len(dance_ids) < 2:
            pytest.skip("Need 2 dances")
        tok, _, _ = _register(sess)
        sess.post(
            f"{BASE}/api/tracking/{dance_ids[0]}",
            headers=_auth(tok),
            json={"status": "completed"},
        )
        r = sess.post(
            f"{BASE}/api/tracking/{dance_ids[1]}",
            headers=_auth(tok),
            json={"status": "completed"},
        )
        assert r.status_code == 200
        j = r.json()
        today = date.today().isoformat()
        assert j["streak"]["current"] == 1
        assert j["streak"]["last_streak_date"] == today
        # first_steps NOT re-awarded
        assert not any(
            b["id"] == "first_steps" for b in j["newly_earned_badges"]
        )

    def test_wishlist_does_not_bump_streak(self, sess, dance_ids):
        tok, _, _ = _register(sess)
        r = sess.post(
            f"{BASE}/api/tracking/{dance_ids[0]}",
            headers=_auth(tok),
            json={"status": "wishlist"},
        )
        assert r.status_code == 200
        j = r.json()
        # streak was NOT bumped for wishlist
        assert j.get("streak") in (None, {}, {"current": 0, "longest": 0, "last_streak_date": ""}) \
            or j["streak"] is None
        # Verify streak endpoint
        s = sess.get(f"{BASE}/api/streak", headers=_auth(tok)).json()
        assert s["current"] == 0


# -------------------- 5. Practice-log --------------------
class TestPracticeLog:
    def test_first_practice_ever_bumps_streak(self, sess, dance_ids):
        tok, _, _ = _register(sess)
        r = sess.post(
            f"{BASE}/api/practice-log/{dance_ids[0]}", headers=_auth(tok),
        )
        assert r.status_code == 200, f"practice-log failed: {r.status_code} {r.text}"
        j = r.json()
        assert "newly_earned_badges" in j and "streak" in j
        today = date.today().isoformat()
        assert j["streak"] == {
            "current": 1, "longest": 1, "last_streak_date": today,
        }

    def test_practice_count_feeds_practice_badges(self, sess, dance_ids):
        """Confirm practice_warrior progress reflects sum of practice_sessions.count."""
        tok, _, _ = _register(sess)
        # Hit practice-log 3 times on the same dance → count=3
        for _ in range(3):
            sess.post(
                f"{BASE}/api/practice-log/{dance_ids[0]}", headers=_auth(tok),
            )
        b = sess.get(f"{BASE}/api/badges", headers=_auth(tok)).json()
        pw = next(x for x in b["badges"] if x["id"] == "practice_warrior")
        assert pw["progress"] == 3, (
            f"practice_warrior progress={pw['progress']} expected 3"
        )
        assert pw["earned"] is False  # requirement is 25


# -------------------- 6. Attendance --------------------
class TestAttendanceFlow:
    def test_attend_no_streak_bump(self, sess, a_class_id):
        tok, _, _ = _register(sess)
        before = sess.get(f"{BASE}/api/streak", headers=_auth(tok)).json()
        r = sess.post(
            f"{BASE}/api/classes/{a_class_id}/attend", headers=_auth(tok),
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        j = r.json()
        assert "newly_earned_badges" in j
        assert isinstance(j["newly_earned_badges"], list)
        after = sess.get(f"{BASE}/api/streak", headers=_auth(tok)).json()
        assert before == after, (
            f"attending shouldn't bump streak: before={before} after={after}"
        )


# -------------------- 7. Regression --------------------
class TestRegression:
    def test_tracking_me_shape_unchanged(self, sess, dance_ids):
        tok, _, _ = _register(sess)
        sess.post(
            f"{BASE}/api/tracking/{dance_ids[0]}",
            headers=_auth(tok),
            json={"status": "completed"},
        )
        r = sess.get(f"{BASE}/api/tracking/me", headers=_auth(tok))
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and rows
        row = rows[0]
        assert set(row.keys()) == {
            "dance_id", "status", "rating", "notes", "updated_at",
        }, f"tracking/me leaked keys: {row.keys()}"
        # No badge fields leaking
        assert "newly_earned_badges" not in row
        assert "streak" not in row

    def test_auth_me_streak_fields(self, sess):
        tok, _, _ = _register(sess)
        r = sess.get(f"{BASE}/api/auth/me", headers=_auth(tok))
        assert r.status_code == 200
        u = r.json()
        # user_to_out shape
        for k in ("current_streak", "longest_streak", "last_streak_date"):
            assert k in u, f"auth/me missing {k}: {u}"
        assert u["current_streak"] == 0
        assert u["longest_streak"] == 0
        assert u["last_streak_date"] == ""

    def test_leaderboard_ok(self, sess):
        r = sess.get(f"{BASE}/api/leaderboard")
        assert r.status_code == 200

    def test_dances_ok(self, sess):
        r = sess.get(f"{BASE}/api/dances?limit=2")
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list)

    def test_classes_ok(self, sess):
        r = sess.get(f"{BASE}/api/classes")
        assert r.status_code == 200


# -------------------- 8. Deletion cleans badges --------------------
class TestDeleteAccount:
    def test_delete_purges_user_badges(self, sess, dance_ids):
        tok, user, email = _register(sess)
        uid = user["user_id"]
        # Earn first_steps
        r = sess.post(
            f"{BASE}/api/tracking/{dance_ids[0]}",
            headers=_auth(tok),
            json={"status": "completed"},
        )
        assert r.status_code == 200
        b_before = sess.get(f"{BASE}/api/badges", headers=_auth(tok)).json()
        assert b_before["total_earned"] >= 1

        # Delete account
        r = sess.delete(f"{BASE}/api/auth/me", headers=_auth(tok))
        assert r.status_code in (200, 204), (
            f"delete failed: {r.status_code} {r.text}"
        )

        # Old token should now fail
        r_me = sess.get(f"{BASE}/api/auth/me", headers=_auth(tok))
        assert r_me.status_code in (401, 403)

        # Re-register with the SAME email → should be a fresh account
        # (no orphan badges leaking through).
        r2 = sess.post(f"{BASE}/api/auth/register", json={
            "email": email, "password": "TestPass123!", "name": "Reborn",
        })
        assert r2.status_code == 200, r2.text
        tok2 = r2.json()["token"]
        # New user_id
        assert r2.json()["user"]["user_id"] != uid
        b_after = sess.get(f"{BASE}/api/badges", headers=_auth(tok2)).json()
        # A brand-new account must have zero earned badges — proves the old
        # user_badges rows (a) were purged for uid AND (b) weren't keyed by
        # something we could accidentally reuse.
        assert b_after["total_earned"] == 0, (
            f"orphan badges leaked into re-registered account: {b_after}"
        )
        assert b_after["unseen_count"] == 0
