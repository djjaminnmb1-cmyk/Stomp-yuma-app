"""Regression tests for the Multi-Instructor Pick feature (v2.6).

Endpoints under test:
- PUT   /api/auth/me/instructors          (new — multi-select save + auto-follow)
- PATCH /api/auth/me/main-instructor      (regression — now $addToSet's into instructor_ids)
- GET   /api/auth/me                      (must now surface instructor_ids array)
- GET   /api/instructors                  (regression)
- GET   /api/suggestions                  (regression — fallback to main_instructor_id)
- GET   /api/suggestions/for-instructor   (regression)
- GET   /api/weekly-recap                 (regression smoke)

We validate the follows rows via the caller's /api/follows/following (or by re-running
the same body and verifying new_follows==0 -> idempotency).
"""
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

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "http://localhost:8001"

ERIN_EMAIL = "erinboroughs@gmail.com"
ERIN_PASSWORD = ERIN_PASSWORD
JAMIN_EMAIL = "luvtowork247@yahoo.com"
JAMIN_PASSWORD = JAMIN_PASSWORD


# ---------------- helpers ----------------
def _login(email, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=20,
    )
    assert r.status_code == 200, f"Login {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _hdrs(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _me(tok):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdrs(tok), timeout=15)
    assert r.status_code == 200
    return r.json()


def _register_fresh():
    email = f"TEST_mip_{uuid.uuid4().hex[:8]}@test.example"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "TestPass123!", "name": "TEST Multi Pick"},
        timeout=20,
    )
    assert r.status_code == 200, f"register: {r.status_code} {r.text}"
    tok = r.json()["token"]
    me = _me(tok)
    return {"token": tok, "user_id": me["user_id"], "email": email}


def _following_ids(tok):
    """Fetch the list of user_ids the caller is currently following.
    Endpoint shape: /api/follows/following returns list of {user_id,...} dicts.
    Falls back to empty list on any non-200 (we assert only the delta via idempotency)."""
    r = requests.get(
        f"{BASE_URL}/api/follows/following", headers=_hdrs(tok), timeout=15
    )
    if r.status_code != 200:
        return None
    data = r.json()
    if isinstance(data, list):
        return [d.get("user_id") or d.get("following_id") for d in data]
    if isinstance(data, dict) and "following" in data:
        return [
            d.get("user_id") or d.get("following_id") for d in data["following"]
        ]
    return None


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def erin_token():
    return _login(ERIN_EMAIL, ERIN_PASSWORD)


@pytest.fixture(scope="module")
def jamin_token():
    return _login(JAMIN_EMAIL, JAMIN_PASSWORD)


@pytest.fixture(scope="module")
def erin_user_id(erin_token):
    return _me(erin_token)["user_id"]


@pytest.fixture(scope="module")
def jamin_user_id(jamin_token):
    return _me(jamin_token)["user_id"]


@pytest.fixture
def fresh_user():
    """Function-scope — each test gets a brand-new dancer so state doesn't leak."""
    return _register_fresh()


# =========================================================================
# PUT /api/auth/me/instructors
# =========================================================================
class TestSaveInstructors:
    def test_401_without_token(self):
        r = requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            json={"instructor_ids": [], "follow": True},
            timeout=15,
        )
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_multi_select_saves_and_returns_shape(
        self, fresh_user, erin_user_id, jamin_user_id
    ):
        body = {
            "instructor_ids": [erin_user_id, jamin_user_id],
            "main_instructor_id": jamin_user_id,
            "follow": True,
        }
        r = requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            headers=_hdrs(fresh_user["token"]),
            json=body,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert "user" in d and isinstance(d["user"], dict)
        assert d["user"]["instructor_ids"] == [erin_user_id, jamin_user_id]
        assert d["user"]["main_instructor_id"] == jamin_user_id
        assert isinstance(d.get("new_follows"), int)
        assert d["new_follows"] >= 0

        # persist check via /auth/me
        me = _me(fresh_user["token"])
        assert me["instructor_ids"] == [erin_user_id, jamin_user_id]
        assert me["main_instructor_id"] == jamin_user_id

    def test_auto_follow_creates_rows_and_idempotent(
        self, fresh_user, erin_user_id, jamin_user_id
    ):
        body = {
            "instructor_ids": [erin_user_id, jamin_user_id],
            "main_instructor_id": jamin_user_id,
            "follow": True,
        }
        r1 = requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            headers=_hdrs(fresh_user["token"]),
            json=body,
            timeout=20,
        )
        assert r1.status_code == 200
        first_new = r1.json()["new_follows"]
        # first save on brand-new user should create 2 follows (or at least >=1)
        assert first_new >= 1

        # second call with same body — must NOT double-count
        r2 = requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            headers=_hdrs(fresh_user["token"]),
            json=body,
            timeout=20,
        )
        assert r2.status_code == 200
        assert r2.json()["new_follows"] == 0, "idempotent second save should add 0"

        # sanity: /follows/following (best-effort) shows both
        followed = _following_ids(fresh_user["token"])
        if followed is not None:
            assert erin_user_id in followed
            assert jamin_user_id in followed

    def test_main_id_explicit_wins(
        self, fresh_user, erin_user_id, jamin_user_id
    ):
        body = {
            "instructor_ids": [erin_user_id, jamin_user_id],
            "main_instructor_id": erin_user_id,
            "follow": False,
        }
        r = requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            headers=_hdrs(fresh_user["token"]),
            json=body,
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["user"]["main_instructor_id"] == erin_user_id

    def test_main_id_falls_back_to_existing_if_still_selected(
        self, fresh_user, erin_user_id, jamin_user_id
    ):
        # Step 1 — set main = Jamin explicitly
        requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            headers=_hdrs(fresh_user["token"]),
            json={
                "instructor_ids": [erin_user_id, jamin_user_id],
                "main_instructor_id": jamin_user_id,
                "follow": False,
            },
            timeout=20,
        )
        # Step 2 — save again WITHOUT main_instructor_id, Jamin still in list
        r = requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            headers=_hdrs(fresh_user["token"]),
            json={
                "instructor_ids": [erin_user_id, jamin_user_id],
                "follow": False,
            },
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["user"]["main_instructor_id"] == jamin_user_id

    def test_main_id_promotes_first_when_previous_dropped(
        self, fresh_user, erin_user_id, jamin_user_id
    ):
        # Step 1 — main = Jamin, both selected
        requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            headers=_hdrs(fresh_user["token"]),
            json={
                "instructor_ids": [erin_user_id, jamin_user_id],
                "main_instructor_id": jamin_user_id,
                "follow": False,
            },
            timeout=20,
        )
        # Step 2 — drop Jamin, no explicit main → should auto-promote Erin
        r = requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            headers=_hdrs(fresh_user["token"]),
            json={"instructor_ids": [erin_user_id], "follow": False},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["user"]["main_instructor_id"] == erin_user_id

    def test_empty_list_clears_main(self, fresh_user, erin_user_id):
        # Set something first
        requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            headers=_hdrs(fresh_user["token"]),
            json={
                "instructor_ids": [erin_user_id],
                "main_instructor_id": erin_user_id,
                "follow": False,
            },
            timeout=20,
        )
        r = requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            headers=_hdrs(fresh_user["token"]),
            json={"instructor_ids": [], "follow": False},
            timeout=20,
        )
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["instructor_ids"] == []
        # main_instructor_id should be cleared (empty string)
        assert not u.get("main_instructor_id"), (
            f"expected empty main_instructor_id got {u.get('main_instructor_id')!r}"
        )
        # verify via /auth/me
        me = _me(fresh_user["token"])
        assert not me.get("main_instructor_id")

    def test_invalid_ids_silently_dropped(
        self, fresh_user, erin_user_id
    ):
        # Mix a real instructor, a bogus id, and the caller themselves (not an instructor)
        body = {
            "instructor_ids": [
                erin_user_id,
                "bogus-user-id-xyz-123",
                fresh_user["user_id"],
            ],
            "follow": False,
        }
        r = requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            headers=_hdrs(fresh_user["token"]),
            json=body,
            timeout=20,
        )
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["instructor_ids"] == [erin_user_id]

    def test_follow_false_creates_no_follows(
        self, fresh_user, erin_user_id, jamin_user_id
    ):
        before = _following_ids(fresh_user["token"])
        r = requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            headers=_hdrs(fresh_user["token"]),
            json={
                "instructor_ids": [erin_user_id, jamin_user_id],
                "main_instructor_id": jamin_user_id,
                "follow": False,
            },
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["new_follows"] == 0
        after = _following_ids(fresh_user["token"])
        if before is not None and after is not None:
            # follow=False must not have grown the follow set
            assert set(after) == set(before), (
                f"follow=False changed follows set: before={before} after={after}"
            )


# =========================================================================
# PATCH /api/auth/me/main-instructor — regression $addToSet
# =========================================================================
class TestPatchMainInstructorAddsToSet:
    def test_patch_adds_to_instructor_ids(
        self, fresh_user, erin_user_id, jamin_user_id
    ):
        # Start with just Erin
        requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            headers=_hdrs(fresh_user["token"]),
            json={"instructor_ids": [erin_user_id], "follow": False},
            timeout=20,
        )
        # Now PATCH main = Jamin — should $addToSet Jamin into instructor_ids
        r = requests.patch(
            f"{BASE_URL}/api/auth/me/main-instructor",
            headers=_hdrs(fresh_user["token"]),
            json={"instructor_id": jamin_user_id},
            timeout=15,
        )
        assert r.status_code == 200
        me = _me(fresh_user["token"])
        assert me["main_instructor_id"] == jamin_user_id
        assert erin_user_id in me["instructor_ids"]
        assert jamin_user_id in me["instructor_ids"]

    def test_patch_idempotent_on_instructor_ids(
        self, fresh_user, erin_user_id
    ):
        requests.patch(
            f"{BASE_URL}/api/auth/me/main-instructor",
            headers=_hdrs(fresh_user["token"]),
            json={"instructor_id": erin_user_id},
            timeout=15,
        )
        # Second PATCH — must NOT duplicate erin_user_id in instructor_ids
        requests.patch(
            f"{BASE_URL}/api/auth/me/main-instructor",
            headers=_hdrs(fresh_user["token"]),
            json={"instructor_id": erin_user_id},
            timeout=15,
        )
        me = _me(fresh_user["token"])
        assert me["instructor_ids"].count(erin_user_id) == 1


# =========================================================================
# /auth/me now includes instructor_ids
# =========================================================================
class TestAuthMeShape:
    def test_me_includes_instructor_ids_array(self, fresh_user):
        me = _me(fresh_user["token"])
        assert "instructor_ids" in me, "instructor_ids missing from /auth/me"
        assert isinstance(me["instructor_ids"], list)


# =========================================================================
# Regression smoke on other endpoints
# =========================================================================
class TestRegressionSmoke:
    def test_instructors_list(self, erin_token):
        r = requests.get(
            f"{BASE_URL}/api/instructors", headers=_hdrs(erin_token), timeout=15
        )
        assert r.status_code == 200
        data = r.json()
        assert "instructors" in data
        assert len(data["instructors"]) >= 2

    def test_suggestions_fallback_to_main(
        self, fresh_user, erin_user_id
    ):
        # Set main via PUT (multi-select save)
        requests.put(
            f"{BASE_URL}/api/auth/me/instructors",
            headers=_hdrs(fresh_user["token"]),
            json={
                "instructor_ids": [erin_user_id],
                "main_instructor_id": erin_user_id,
                "follow": False,
            },
            timeout=20,
        )
        r = requests.post(
            f"{BASE_URL}/api/suggestions",
            headers=_hdrs(fresh_user["token"]),
            json={"dance_name": f"TEST_mip_fallback_{uuid.uuid4().hex[:6]}"},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json().get("target_instructor_id") == erin_user_id

    def test_suggestions_for_instructor_ok(self, jamin_token):
        r = requests.get(
            f"{BASE_URL}/api/suggestions/for-instructor",
            headers=_hdrs(jamin_token),
            timeout=15,
        )
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_weekly_recap_ok(self, erin_token):
        r = requests.get(
            f"{BASE_URL}/api/weekly-recap",
            headers=_hdrs(erin_token),
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        for k in ("week_start", "week_end", "days", "total"):
            assert k in d
