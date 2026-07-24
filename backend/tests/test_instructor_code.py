"""Tests for the self-serve instructor code feature.

Covers:
  - POST /api/auth/register with correct / wrong / missing instructor_code
  - POST /api/auth/set-instructor unauth / wrong code / correct code
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://stompin-yuma-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
GOOD_CODE = "lineup4life"


def _fresh_email() -> str:
    return f"TEST_inst_{int(time.time())}_{uuid.uuid4().hex[:6]}@example.com"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- /api/auth/register ----------
class TestRegisterInstructorCode:
    def test_register_with_correct_code_sets_instructor_true(self, session):
        email = _fresh_email()
        r = session.post(f"{API}/auth/register", json={
            "email": email, "password": "TestPass123!", "name": "Inst Good",
            "instructor_code": GOOD_CODE,
        }, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and "user" in data
        assert data["user"]["is_instructor"] is True
        assert data["user"]["email"] == email.lower()

        # Verify persistence via /auth/me
        me = session.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {data['token']}"}, timeout=30)
        assert me.status_code == 200
        assert me.json()["is_instructor"] is True

    def test_register_with_wrong_code_does_not_grant_instructor(self, session):
        email = _fresh_email()
        r = session.post(f"{API}/auth/register", json={
            "email": email, "password": "TestPass123!", "name": "Inst Bad",
            "instructor_code": "wrong",
        }, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["is_instructor"] is False

    def test_register_without_code_defaults_to_non_instructor(self, session):
        email = _fresh_email()
        r = session.post(f"{API}/auth/register", json={
            "email": email, "password": "TestPass123!", "name": "Regular User",
        }, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["is_instructor"] is False


# ---------- /api/auth/set-instructor ----------
class TestSetInstructor:
    @pytest.fixture(scope="class")
    def user_token(self, session):
        email = _fresh_email()
        r = session.post(f"{API}/auth/register", json={
            "email": email, "password": "TestPass123!", "name": "Upgrade Me",
        }, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["is_instructor"] is False
        return {"token": data["token"], "user_id": data["user"]["user_id"], "email": email}

    def test_set_instructor_without_auth_returns_401(self, session):
        r = session.post(f"{API}/auth/set-instructor",
                         json={"instructor_code": GOOD_CODE}, timeout=30)
        assert r.status_code == 401, r.text

    def test_set_instructor_wrong_code_returns_400(self, session, user_token):
        r = session.post(f"{API}/auth/set-instructor",
                         json={"instructor_code": "wrong-code"},
                         headers={"Authorization": f"Bearer {user_token['token']}"},
                         timeout=30)
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", "")
        assert "invalid" in detail.lower() and "code" in detail.lower()

    def test_set_instructor_correct_code_upgrades_user(self, session, user_token):
        r = session.post(f"{API}/auth/set-instructor",
                         json={"instructor_code": GOOD_CODE},
                         headers={"Authorization": f"Bearer {user_token['token']}"},
                         timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data["user"]["is_instructor"] is True
        assert data["user"]["user_id"] == user_token["user_id"]

        # Verify DB update via /auth/me
        me = session.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {user_token['token']}"}, timeout=30)
        assert me.status_code == 200
        assert me.json()["is_instructor"] is True
