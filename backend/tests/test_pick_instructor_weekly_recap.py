"""Regression tests for the Pick-Main-Instructor + Weekly-Recap features.

Endpoints under test:
- GET  /api/instructors               (list, q filter, requires auth)
- PATCH /api/auth/me/main-instructor  (set + validation)
- DELETE /api/auth/me/main-instructor (clear)
- POST /api/suggestions               (target_instructor_id routing)
- GET  /api/suggestions/for-instructor
- GET  /api/weekly-recap
- Smoke: /api/badges, /api/feed, /api/practice-history?days=7, /api/recently-practiced
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to internal loopback if env not present in test container
    BASE_URL = "http://localhost:8001"

ERIN_EMAIL = "erinboroughs@gmail.com"
ERIN_PASSWORD = "Stompin2026!"
JAMIN_EMAIL = "luvtowork247@yahoo.com"
JAMIN_PASSWORD = "BootsDance49!"
INSTRUCTOR_CODE = "lineup4life"


def _login(email, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=20,
    )
    assert r.status_code == 200, f"Login failed {email}: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


def _hdrs(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _register_fresh_user():
    """Create a brand-new dancer account and return (token, user_id, email)."""
    email = f"TEST_pi_{uuid.uuid4().hex[:8]}@test.example"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "TestPass123!", "name": "TEST Fresh User"},
        timeout=20,
    )
    assert r.status_code == 200, f"register: {r.status_code} {r.text}"
    tok = r.json()["token"]
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdrs(tok), timeout=15).json()
    return tok, me["user_id"], email


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def erin_token():
    return _login(ERIN_EMAIL, ERIN_PASSWORD)


@pytest.fixture(scope="module")
def jamin_token():
    return _login(JAMIN_EMAIL, JAMIN_PASSWORD)


@pytest.fixture(scope="module")
def erin_user_id(erin_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdrs(erin_token), timeout=15)
    assert r.status_code == 200
    return r.json()["user_id"]


@pytest.fixture(scope="module")
def jamin_user_id(jamin_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdrs(jamin_token), timeout=15)
    assert r.status_code == 200
    return r.json()["user_id"]


@pytest.fixture(scope="module")
def fresh_user():
    tok, uid, email = _register_fresh_user()
    return {"token": tok, "user_id": uid, "email": email}


# =================== GET /api/instructors ===================
class TestInstructorList:
    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/instructors", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_lists_only_instructors_and_admins(self, erin_token):
        r = requests.get(
            f"{BASE_URL}/api/instructors", headers=_hdrs(erin_token), timeout=15
        )
        assert r.status_code == 200
        data = r.json()
        assert "instructors" in data
        assert isinstance(data["instructors"], list)
        assert len(data["instructors"]) >= 2  # at least Erin + Jamin
        for it in data["instructors"]:
            assert set(["user_id", "name", "picture", "city", "state"]).issubset(
                it.keys()
            ), f"missing keys in {it}"

    def test_q_filter_erin(self, jamin_token):
        r = requests.get(
            f"{BASE_URL}/api/instructors",
            params={"q": "erin"},
            headers=_hdrs(jamin_token),
            timeout=15,
        )
        assert r.status_code == 200
        rows = r.json()["instructors"]
        assert len(rows) >= 1
        assert all("erin" in it["name"].lower() for it in rows)


# =================== PATCH /api/auth/me/main-instructor ===================
class TestSetMainInstructor:
    def test_400_on_empty_id(self, fresh_user):
        r = requests.patch(
            f"{BASE_URL}/api/auth/me/main-instructor",
            headers=_hdrs(fresh_user["token"]),
            json={"instructor_id": ""},
            timeout=15,
        )
        assert r.status_code == 400

    def test_404_on_nonexistent(self, fresh_user):
        r = requests.patch(
            f"{BASE_URL}/api/auth/me/main-instructor",
            headers=_hdrs(fresh_user["token"]),
            json={"instructor_id": "does-not-exist-xyz"},
            timeout=15,
        )
        assert r.status_code == 404

    def test_400_on_non_instructor(self, fresh_user):
        r = requests.patch(
            f"{BASE_URL}/api/auth/me/main-instructor",
            headers=_hdrs(fresh_user["token"]),
            json={"instructor_id": fresh_user["user_id"]},  # self, not instructor
            timeout=15,
        )
        assert r.status_code == 400

    def test_set_success_persists_via_me(self, fresh_user, erin_user_id):
        r = requests.patch(
            f"{BASE_URL}/api/auth/me/main-instructor",
            headers=_hdrs(fresh_user["token"]),
            json={"instructor_id": erin_user_id},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["main_instructor_id"] == erin_user_id
        assert body["main_instructor_name"]  # non-empty
        # verify persistence via /auth/me
        me = requests.get(
            f"{BASE_URL}/api/auth/me", headers=_hdrs(fresh_user["token"]), timeout=15
        ).json()
        assert me.get("main_instructor_id") == erin_user_id


# =================== DELETE /api/auth/me/main-instructor ===================
class TestClearMainInstructor:
    def test_clear_works(self, fresh_user, erin_user_id):
        # ensure set first
        requests.patch(
            f"{BASE_URL}/api/auth/me/main-instructor",
            headers=_hdrs(fresh_user["token"]),
            json={"instructor_id": erin_user_id},
            timeout=15,
        )
        r = requests.delete(
            f"{BASE_URL}/api/auth/me/main-instructor",
            headers=_hdrs(fresh_user["token"]),
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True
        me = requests.get(
            f"{BASE_URL}/api/auth/me", headers=_hdrs(fresh_user["token"]), timeout=15
        ).json()
        assert not me.get("main_instructor_id")


# =================== POST /api/suggestions routing ===================
class TestSuggestionRouting:
    def _submit(self, tok, body):
        r = requests.post(
            f"{BASE_URL}/api/suggestions",
            headers=_hdrs(tok),
            json=body,
            timeout=20,
        )
        return r

    def test_falls_back_to_main_instructor(self, fresh_user, erin_user_id):
        # Set Erin as main instructor
        requests.patch(
            f"{BASE_URL}/api/auth/me/main-instructor",
            headers=_hdrs(fresh_user["token"]),
            json={"instructor_id": erin_user_id},
            timeout=15,
        )
        r = self._submit(
            fresh_user["token"],
            {"dance_name": f"TEST_fallback_{uuid.uuid4().hex[:6]}"},
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc.get("target_instructor_id") == erin_user_id
        assert doc.get("target_instructor_name")

    def test_body_overrides_fallback(self, fresh_user, erin_user_id, jamin_user_id):
        # main = Erin, but pass Jamin's id in body — Jamin should win
        requests.patch(
            f"{BASE_URL}/api/auth/me/main-instructor",
            headers=_hdrs(fresh_user["token"]),
            json={"instructor_id": erin_user_id},
            timeout=15,
        )
        r = self._submit(
            fresh_user["token"],
            {
                "dance_name": f"TEST_override_{uuid.uuid4().hex[:6]}",
                "target_instructor_id": jamin_user_id,
            },
        )
        assert r.status_code == 200
        doc = r.json()
        assert doc["target_instructor_id"] == jamin_user_id

    def test_invalid_target_silently_dropped(self, fresh_user):
        r = self._submit(
            fresh_user["token"],
            {
                "dance_name": f"TEST_invalid_{uuid.uuid4().hex[:6]}",
                "target_instructor_id": "totally-bogus-id-xyz",
            },
        )
        assert r.status_code == 200
        doc = r.json()
        assert doc["target_instructor_id"] == ""
        assert doc["target_instructor_name"] == ""


# =================== GET /api/suggestions/for-instructor ===================
class TestForInstructor:
    def test_403_for_non_instructor(self, fresh_user):
        r = requests.get(
            f"{BASE_URL}/api/suggestions/for-instructor",
            headers=_hdrs(fresh_user["token"]),
            timeout=15,
        )
        assert r.status_code == 403

    def test_200_for_instructor_only_own(self, jamin_token, jamin_user_id, fresh_user):
        # Submit a suggestion targeted at Jamin
        requests.post(
            f"{BASE_URL}/api/suggestions",
            headers=_hdrs(fresh_user["token"]),
            json={
                "dance_name": f"TEST_for_jamin_{uuid.uuid4().hex[:6]}",
                "target_instructor_id": jamin_user_id,
            },
            timeout=15,
        )
        r = requests.get(
            f"{BASE_URL}/api/suggestions/for-instructor",
            headers=_hdrs(jamin_token),
            timeout=15,
        )
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        # every row must be targeted at jamin
        for d in rows:
            assert d["target_instructor_id"] == jamin_user_id


# =================== GET /api/weekly-recap ===================
class TestWeeklyRecap:
    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/weekly-recap", timeout=15)
        assert r.status_code in (401, 403)

    def test_shape_and_math(self, erin_token):
        r = requests.get(
            f"{BASE_URL}/api/weekly-recap", headers=_hdrs(erin_token), timeout=15
        )
        assert r.status_code == 200, r.text
        d = r.json()
        for k in (
            "week_start",
            "week_end",
            "today",
            "days",
            "practices",
            "completions",
            "total",
            "days_active",
            "best_day",
        ):
            assert k in d, f"missing key {k}"
        assert len(d["days"]) == 7
        for day in d["days"]:
            for kk in ("date", "practices", "completions", "count"):
                assert kk in day
            assert day["count"] == day["practices"] + day["completions"]
        # sum of days.count == total
        assert sum(x["count"] for x in d["days"]) == d["total"]
        # best day matches max count
        if d["total"] > 0:
            max_count = max(x["count"] for x in d["days"])
            assert d["best_day"]["count"] == max_count

    def test_zero_total_for_fresh_user(self, fresh_user):
        r = requests.get(
            f"{BASE_URL}/api/weekly-recap",
            headers=_hdrs(fresh_user["token"]),
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["total"] == 0
        assert d["days_active"] == 0


# =================== Smoke regression ===================
class TestRegressionSmoke:
    def test_badges(self, erin_token):
        r = requests.get(
            f"{BASE_URL}/api/badges", headers=_hdrs(erin_token), timeout=15
        )
        assert r.status_code == 200

    def test_feed(self, erin_token):
        r = requests.get(f"{BASE_URL}/api/feed", headers=_hdrs(erin_token), timeout=15)
        assert r.status_code == 200

    def test_practice_history(self, erin_token):
        r = requests.get(
            f"{BASE_URL}/api/practice-history",
            params={"days": 7},
            headers=_hdrs(erin_token),
            timeout=15,
        )
        assert r.status_code == 200

    def test_recently_practiced(self, erin_token):
        r = requests.get(
            f"{BASE_URL}/api/recently-practiced",
            headers=_hdrs(erin_token),
            timeout=15,
        )
        assert r.status_code == 200
