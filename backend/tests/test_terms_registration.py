"""Terms-of-use registration gate — Apple Guideline 1.2.

Covers:
- GET /api/legal/terms-version is public (no auth) and returns 2026-06-24.
- POST /api/auth/register without / wrong accepted_terms_version → 400 with
  STRING detail, code=='terms_not_accepted', required_version echoed.
- POST /api/auth/register with correct version → 200, token returned, and
  GET /api/legal/terms-status (Bearer) reports up_to_date=True with
  accepted_version & accepted_at set.
- POST /api/legal/accept-terms stale → 400 string detail + code
  'stale_terms_version'; correct → 200.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://stompin-yuma-app.preview.emergentagent.com").rstrip("/")
EXPECTED_VERSION = "2026-06-24"


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _fresh_email() -> str:
    return f"TEST_terms_{int(time.time()*1000)}_{os.getpid()}@example.com"


class TestTermsVersion:
    def test_terms_version_public(self, api):
        r = api.get(f"{BASE_URL}/api/legal/terms-version")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("required_version") == EXPECTED_VERSION

    def test_terms_version_no_auth_required(self, api):
        # explicitly send no Authorization header
        r = requests.get(f"{BASE_URL}/api/legal/terms-version", timeout=15)
        assert r.status_code == 200


class TestRegisterTermsGate:
    def test_register_missing_version_rejects_with_string_detail(self, api):
        email = _fresh_email()
        r = api.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "Testpass123!", "name": "Test User"},
        )
        assert r.status_code == 400, r.text
        body = r.json()
        assert isinstance(body.get("detail"), str), f"detail must be string, got {type(body.get('detail'))}: {body.get('detail')!r}"
        assert body.get("code") == "terms_not_accepted"
        assert body.get("required_version") == EXPECTED_VERSION

    def test_register_wrong_version_rejects_with_string_detail(self, api):
        email = _fresh_email()
        r = api.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": email,
                "password": "Testpass123!",
                "name": "Test User",
                "accepted_terms_version": "wrong",
            },
        )
        assert r.status_code == 400, r.text
        body = r.json()
        assert isinstance(body.get("detail"), str)
        assert body.get("code") == "terms_not_accepted"
        assert body.get("required_version") == EXPECTED_VERSION

    def test_register_correct_version_succeeds_and_terms_status_up_to_date(self, api):
        email = _fresh_email()
        r = api.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": email,
                "password": "Testpass123!",
                "name": "Dancer Test",
                "accepted_terms_version": EXPECTED_VERSION,
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and "user" in body
        token = body["token"]
        # terms-status must report up_to_date
        r2 = api.get(
            f"{BASE_URL}/api/legal/terms-status",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r2.status_code == 200, r2.text
        s = r2.json()
        assert s.get("accepted_version") == EXPECTED_VERSION
        assert s.get("up_to_date") is True
        assert s.get("accepted_at")  # non-empty

        # clean up
        api.delete(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )


class TestAcceptTermsEndpoint:
    def _mk_user(self, api):
        email = _fresh_email()
        r = api.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": email,
                "password": "Testpass123!",
                "name": "Accept Test",
                "accepted_terms_version": EXPECTED_VERSION,
            },
        )
        assert r.status_code == 200, r.text
        return r.json()["token"]

    def test_accept_terms_wrong_version_rejects(self, api):
        token = self._mk_user(api)
        try:
            r = api.post(
                f"{BASE_URL}/api/legal/accept-terms",
                json={"version": "wrong"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert r.status_code == 400, r.text
            body = r.json()
            assert isinstance(body.get("detail"), str)
            assert body.get("code") == "stale_terms_version"
            assert body.get("required_version") == EXPECTED_VERSION
        finally:
            api.delete(
                f"{BASE_URL}/api/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )

    def test_accept_terms_correct_version_ok(self, api):
        token = self._mk_user(api)
        try:
            r = api.post(
                f"{BASE_URL}/api/legal/accept-terms",
                json={"version": EXPECTED_VERSION},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body.get("ok") is True
            assert body.get("accepted_version") == EXPECTED_VERSION
        finally:
            api.delete(
                f"{BASE_URL}/api/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
