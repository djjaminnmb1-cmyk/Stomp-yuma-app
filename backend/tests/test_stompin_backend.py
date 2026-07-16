"""Stompin' Ground Yuma - Backend API tests (iteration 2).

Covers regression after Android package rename (com.stompinyuma.app):
- Core: venue, dances list/search/filter/get, auth (register/login/me/admin),
  admin dance creation gating, tracking flow.
- Newer endpoints: classes (upcoming/past/create/update/delete), attendance
  (mark/unmark/list), suggestions (submit/mine/list/status/delete), register-push
  (expected 500 while EMERGENT_PUSH_KEY is placeholder).
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://stompin-yuma-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
ADMIN_EMAIL = "admin@stompinground.com"
ADMIN_PASS = "Admin123!"
ERIN_EMAIL = "stompingroundyuma@gmail.com"
ERIN_PASS = "Stompin2026!"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["user"]["is_admin"] is True
    return j["token"]


@pytest.fixture(scope="session")
def erin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ERIN_EMAIL, "password": ERIN_PASS})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["user"]["is_admin"] is True
    return j["token"], j["user"]


@pytest.fixture(scope="session")
def user_token(s):
    email = f"TEST_u_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Pass123!", "name": "Test U"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["user"]["is_admin"] is False
    return j["token"], j["user"]


# --------- Venue ---------
def test_venue(s):
    r = s.get(f"{API}/venue")
    assert r.status_code == 200
    j = r.json()
    assert "Stompin" in j["name"]
    assert j["city"]


# --------- Dances list/search/filter ---------
def test_list_dances_seeded(s):
    r = s.get(f"{API}/dances")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 100, f"Expected >=100 dances, got {len(data)}"
    assert {"id", "name", "difficulty"}.issubset(data[0].keys())


def test_search_dances(s):
    r = s.get(f"{API}/dances", params={"q": "watermelon"})
    assert r.status_code == 200
    data = r.json()
    assert any("Watermelon" in d["name"] for d in data)


def test_filter_difficulty(s):
    r = s.get(f"{API}/dances", params={"difficulty": "Advanced"})
    assert r.status_code == 200
    data = r.json()
    assert all(d["difficulty"] == "Advanced" for d in data)
    assert len(data) >= 1


def test_get_dance_by_id(s):
    r = s.get(f"{API}/dances")
    d0 = r.json()[0]
    r2 = s.get(f"{API}/dances/{d0['id']}")
    assert r2.status_code == 200
    assert r2.json()["id"] == d0["id"]


def test_get_dance_404(s):
    r = s.get(f"{API}/dances/nonexistent_id")
    assert r.status_code == 404


# --------- Auth ---------
def test_register_and_me(s):
    email = f"TEST_r_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Pass123!", "name": "Reg U"})
    assert r.status_code == 200
    token = r.json()["token"]
    r2 = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json()["email"] == email.lower()
    assert r2.json()["is_admin"] is False


def test_login_bad_creds(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
    assert r.status_code == 401


def test_admin_login(admin_token):
    assert isinstance(admin_token, str) and len(admin_token) > 10


def test_erin_login(erin_token):
    token, user = erin_token
    assert isinstance(token, str) and len(token) > 10
    assert user["is_admin"] is True


def test_me_no_token(s):
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 401


# --------- Admin dance creation ---------
def test_non_admin_cannot_create(s, user_token):
    token, _ = user_token
    r = s.post(f"{API}/dances",
               headers={"Authorization": f"Bearer {token}"},
               json={"name": "X", "choreographer": "Y", "song": "S", "difficulty": "Beginner"})
    assert r.status_code == 403


# --------- Tracking ---------
def test_tracking_flow(s, user_token):
    token, _user = user_token
    hdr = {"Authorization": f"Bearer {token}"}
    dances = s.get(f"{API}/dances").json()
    dance_id = dances[0]["id"]

    # Create wishlist
    r = s.post(f"{API}/tracking/{dance_id}", headers=hdr,
               json={"status": "wishlist", "rating": 0, "notes": ""})
    assert r.status_code == 200
    assert r.json()["status"] == "wishlist"

    # Update to completed with rating
    r = s.post(f"{API}/tracking/{dance_id}", headers=hdr,
               json={"status": "completed", "rating": 4, "notes": "fun!"})
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "completed" and j["rating"] == 4 and j["notes"] == "fun!"

    # Verify persistence
    r = s.get(f"{API}/tracking/me", headers=hdr)
    match = [t for t in r.json() if t["dance_id"] == dance_id]
    assert len(match) == 1 and match[0]["status"] == "completed"

    # Cleanup
    s.delete(f"{API}/tracking/{dance_id}", headers=hdr)


def test_tracking_requires_auth(s):
    r = s.get(f"{API}/tracking/me")
    assert r.status_code == 401


def test_google_session_endpoint_exists(s):
    r = s.post(f"{API}/auth/google-session", json={"session_id": "invalid_test_session"})
    assert r.status_code in (401, 400)


# --------- Classes / Attendance ---------
def _future_date(days: int = 7) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y-%m-%d")


def _past_date(days: int = 7) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")


def test_classes_scope_endpoints(s):
    for scope in ("all", "upcoming", "past"):
        r = s.get(f"{API}/classes", params={"scope": scope})
        assert r.status_code == 200, f"scope={scope} -> {r.status_code}"
        assert isinstance(r.json(), list)


def test_class_create_upcoming_and_attendance(s, erin_token, user_token):
    """Erin (instructor) creates a class; test user marks attended; verify /attendance/me."""
    instr_token, _ = erin_token
    u_token, _u = user_token
    dances = s.get(f"{API}/dances").json()
    dance_ids = [dances[0]["id"], dances[1]["id"]]

    # Create upcoming class (should trigger push, which is non-blocking)
    payload = {
        "date": _future_date(3),
        "session_label": f"TEST_Class_{uuid.uuid4().hex[:5]}",
        "notes": "auto test",
        "dance_ids": dance_ids,
    }
    r = s.post(f"{API}/classes",
               headers={"Authorization": f"Bearer {instr_token}"}, json=payload)
    assert r.status_code == 200, r.text
    klass = r.json()
    class_id = klass["id"]
    assert len(klass["dances"]) == 2
    assert klass["dances"][0]["name"] == dances[0]["name"]

    try:
        # Show up in upcoming
        up = s.get(f"{API}/classes", params={"scope": "upcoming"}).json()
        assert any(c["id"] == class_id for c in up)

        # Mark attendance (as regular user)
        r = s.post(f"{API}/classes/{class_id}/attend",
                   headers={"Authorization": f"Bearer {u_token}"})
        assert r.status_code == 200
        assert r.json()["attended"] is True

        # Verify /attendance/me
        r = s.get(f"{API}/attendance/me", headers={"Authorization": f"Bearer {u_token}"})
        assert r.status_code == 200
        me = r.json()
        assert class_id in me["class_ids"]
        assert any(c["id"] == class_id for c in me["classes"])

        # Unmark
        r = s.delete(f"{API}/classes/{class_id}/attend",
                     headers={"Authorization": f"Bearer {u_token}"})
        assert r.status_code == 200
        assert r.json()["attended"] is False

        r = s.get(f"{API}/attendance/me", headers={"Authorization": f"Bearer {u_token}"})
        assert class_id not in r.json()["class_ids"]
    finally:
        # Cleanup
        s.delete(f"{API}/classes/{class_id}",
                 headers={"Authorization": f"Bearer {instr_token}"})


def test_class_create_past_recap(s, erin_token, user_token):
    """Instructor logs a past class ('I was there' scenario)."""
    instr_token, _ = erin_token
    u_token, _u = user_token
    dances = s.get(f"{API}/dances").json()

    payload = {
        "date": _past_date(2),
        "session_label": f"TEST_PastClass_{uuid.uuid4().hex[:5]}",
        "notes": "past recap",
        "dance_ids": [dances[0]["id"]],
    }
    r = s.post(f"{API}/classes",
               headers={"Authorization": f"Bearer {instr_token}"}, json=payload)
    assert r.status_code == 200, r.text
    class_id = r.json()["id"]

    try:
        past = s.get(f"{API}/classes", params={"scope": "past"}).json()
        assert any(c["id"] == class_id for c in past)

        # 'I was there' toggle
        r = s.post(f"{API}/classes/{class_id}/attend",
                   headers={"Authorization": f"Bearer {u_token}"})
        assert r.status_code == 200
    finally:
        s.delete(f"{API}/classes/{class_id}",
                 headers={"Authorization": f"Bearer {instr_token}"})


def test_non_instructor_cannot_create_class(s, user_token):
    token, _ = user_token
    r = s.post(f"{API}/classes",
               headers={"Authorization": f"Bearer {token}"},
               json={"date": _future_date(1), "session_label": "nope", "dance_ids": []})
    assert r.status_code == 403


# --------- Suggestions ---------
def test_suggestion_submit_and_admin_list(s, user_token, admin_token):
    u_token, u = user_token

    unique = uuid.uuid4().hex[:6]
    payload = {
        "dance_name": f"TEST_Suggest_{unique}",
        "song": "Test Song",
        "artist": "Test Artist",
        "difficulty": "Improver",
        "notes": "please add",
    }
    r = s.post(f"{API}/suggestions",
               headers={"Authorization": f"Bearer {u_token}"}, json=payload)
    assert r.status_code == 200, r.text
    sug = r.json()
    sug_id = sug["id"]
    assert sug["status"] == "pending"
    assert sug["dance_name"] == payload["dance_name"]

    try:
        # User sees own suggestion
        r = s.get(f"{API}/suggestions/mine",
                  headers={"Authorization": f"Bearer {u_token}"})
        assert r.status_code == 200
        assert any(x["id"] == sug_id for x in r.json())

        # Admin sees it in All (list all)
        r = s.get(f"{API}/suggestions",
                  headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        all_sugs = r.json()
        assert any(x["id"] == sug_id for x in all_sugs)

        # Non-admin cannot list all
        r = s.get(f"{API}/suggestions",
                  headers={"Authorization": f"Bearer {u_token}"})
        assert r.status_code == 403
    finally:
        # Cleanup as admin
        s.delete(f"{API}/suggestions/{sug_id}",
                 headers={"Authorization": f"Bearer {admin_token}"})


def test_suggestion_requires_name(s, user_token):
    u_token, _ = user_token
    r = s.post(f"{API}/suggestions",
               headers={"Authorization": f"Bearer {u_token}"},
               json={"dance_name": "  "})
    assert r.status_code == 400


# --------- Register push (expected to fail with placeholder key) ---------
def test_register_push_placeholder(s):
    r = s.post(f"{API}/register-push",
               json={"device_token": "ExponentPushToken[TEST_FAKE]", "platform": "ios"})
    # With placeholder key, upstream returns 401 -> we surface as 500.
    # Also accept 502 if upstream unreachable, or 201/422 for edge cases.
    assert r.status_code in (500, 502, 422, 401, 400), f"unexpected {r.status_code}: {r.text}"
