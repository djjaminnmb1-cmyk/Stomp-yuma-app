"""Tests for the new PDF certificate endpoint + clamp fixes on
`/api/instructor/trend` and `/api/recently-practiced`.

Focus: only the surfaces requested in the review; skip full regression.
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
BASE_URL = "http://localhost:8001/api"

ADMIN = {"email": ERIN_EMAIL, "password": ERIN_PASSWORD}
INSTRUCTOR = {"email": JAMIN_EMAIL, "password": JAMIN_PASSWORD}
GENERIC_ADMIN = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}


# -------- helpers --------
def _login(session: requests.Session, creds: dict) -> str:
    r = session.post(f"{BASE_URL}/auth/login", json=creds, timeout=10)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in login response: {data}"
    return tok


def _auth(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    s = requests.Session()
    return _login(s, ADMIN)


@pytest.fixture(scope="module")
def instructor_token():
    s = requests.Session()
    return _login(s, INSTRUCTOR)


@pytest.fixture(scope="module")
def any_dance_id():
    r = requests.get(f"{BASE_URL}/dances", timeout=10)
    assert r.status_code == 200
    items = r.json()
    if isinstance(items, dict):
        items = items.get("items") or items.get("dances") or []
    assert isinstance(items, list) and len(items) > 0
    return items[0].get("id") or items[0].get("dance_id")


@pytest.fixture(scope="module")
def completed_dance_id(admin_token, any_dance_id):
    """Ensure the admin has a completed tracking row for a dance and return that dance id."""
    # Try tracking endpoint; whichever payload shape the app expects.
    dance_id = any_dance_id
    tried = []
    for payload in (
        {"dance_id": dance_id, "status": "completed"},
        {"status": "completed"},
    ):
        r = requests.post(
            f"{BASE_URL}/tracking/{dance_id}",
            json=payload,
            headers=_auth(admin_token),
            timeout=10,
        )
        tried.append((r.status_code, r.text[:80]))
        if r.status_code in (200, 201):
            return dance_id
    # Alternate route
    r = requests.post(
        f"{BASE_URL}/tracking",
        json={"dance_id": dance_id, "status": "completed"},
        headers=_auth(admin_token),
        timeout=10,
    )
    tried.append((r.status_code, r.text[:80]))
    if r.status_code in (200, 201):
        return dance_id
    pytest.skip(f"could not mark dance completed; attempts: {tried}")


# ======== Sanity smoke ========
class TestSanitySmoke:
    def test_dances_returns_more_than_200(self):
        r = requests.get(f"{BASE_URL}/dances", timeout=10)
        assert r.status_code == 200
        items = r.json()
        if isinstance(items, dict):
            items = items.get("items") or items.get("dances") or []
        assert len(items) > 200, f"expected >200 dances got {len(items)}"

    def test_leaderboard_200(self):
        r = requests.get(f"{BASE_URL}/leaderboard", timeout=10)
        assert r.status_code == 200

    def test_login_erin(self):
        r = requests.post(f"{BASE_URL}/auth/login", json=ADMIN, timeout=10)
        assert r.status_code == 200

    def test_login_jamin(self):
        r = requests.post(f"{BASE_URL}/auth/login", json=INSTRUCTOR, timeout=10)
        assert r.status_code == 200

    def test_login_generic_admin(self):
        r = requests.post(
            f"{BASE_URL}/auth/login",
            json=GENERIC_ADMIN,
            timeout=10,
        )
        assert r.status_code == 200


# ======== Certificate endpoint ========
class TestCertificate:
    def test_401_without_auth(self, any_dance_id):
        r = requests.get(f"{BASE_URL}/certificate/{any_dance_id}", timeout=10)
        assert r.status_code == 401

    def test_404_for_bogus_dance_id(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/certificate/nonexistent-id-xyz",
            headers=_auth(admin_token),
            timeout=10,
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "No certificate available for this dance."

    def test_404_for_dance_not_completed(self, admin_token):
        # Find a dance the admin has NOT completed.
        r = requests.get(f"{BASE_URL}/dances", timeout=10)
        items = r.json()
        if isinstance(items, dict):
            items = items.get("items") or items.get("dances") or []
        # Fetch admin tracking to filter (endpoint is /tracking/me)
        tr = requests.get(
            f"{BASE_URL}/tracking/me", headers=_auth(admin_token), timeout=10
        )
        completed_ids = set()
        if tr.status_code == 200:
            data = tr.json()
            if isinstance(data, dict):
                data = data.get("items") or data.get("tracking") or list(data.values())[0] if data else []
            if isinstance(data, list):
                for row in data:
                    if row.get("status") == "completed":
                        completed_ids.add(row.get("dance_id"))
        target = None
        for d in items:
            did = d.get("id") or d.get("dance_id")
            if did and did not in completed_ids:
                target = did
                break
        assert target, f"no dance available that isn't completed by admin (completed={len(completed_ids)})"
        r = requests.get(
            f"{BASE_URL}/certificate/{target}",
            headers=_auth(admin_token),
            timeout=10,
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "No certificate available for this dance."

    def test_200_valid_pdf_for_completed(self, admin_token, completed_dance_id):
        r = requests.get(
            f"{BASE_URL}/certificate/{completed_dance_id}",
            headers=_auth(admin_token),
            timeout=15,
        )
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd and "filename=" in cd
        assert r.content[:4] == b"%PDF", f"missing PDF magic; got {r.content[:8]!r}"
        assert len(r.content) > 1000, f"pdf too small: {len(r.content)}"

    def test_filename_sanitized(self, admin_token, completed_dance_id):
        r = requests.get(
            f"{BASE_URL}/certificate/{completed_dance_id}",
            headers=_auth(admin_token),
            timeout=15,
        )
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        # Extract filename
        import re
        m = re.search(r'filename="([^"]+)"', cd)
        assert m, f"no filename in disposition: {cd}"
        fname = m.group(1)
        assert fname.startswith("sgy_certificate_")
        assert fname.endswith(".pdf")
        stem = fname[len("sgy_certificate_"):-4]
        # Only lowercase alnum + underscore
        assert all(ch.isalnum() or ch == "_" for ch in stem), f"unsanitized: {stem}"
        assert stem == stem.lower()

    def test_wishlist_not_eligible(self, admin_token):
        """Mark a fresh dance as wishlist and confirm certificate returns 404."""
        r = requests.get(f"{BASE_URL}/dances", timeout=10)
        items = r.json()
        if isinstance(items, dict):
            items = items.get("items") or items.get("dances") or []
        # Get admin tracking
        tr = requests.get(f"{BASE_URL}/tracking/me", headers=_auth(admin_token), timeout=10)
        completed = set()
        if tr.status_code == 200:
            data = tr.json()
            if isinstance(data, dict):
                data = data.get("items") or data.get("tracking") or (list(data.values())[0] if data else [])
            if isinstance(data, list):
                completed = {row.get("dance_id") for row in data if row.get("status") == "completed"}
        target = None
        for d in items:
            did = d.get("id") or d.get("dance_id")
            if did and did not in completed:
                target = did
                break
        assert target
        # Mark wishlist
        wl = requests.post(
            f"{BASE_URL}/tracking/{target}",
            json={"status": "wishlist"},
            headers=_auth(admin_token),
            timeout=10,
        )
        if wl.status_code not in (200, 201):
            wl = requests.post(
                f"{BASE_URL}/tracking",
                json={"dance_id": target, "status": "wishlist"},
                headers=_auth(admin_token),
                timeout=10,
            )
        assert wl.status_code in (200, 201), f"wishlist mark failed: {wl.status_code} {wl.text}"
        r = requests.get(
            f"{BASE_URL}/certificate/{target}",
            headers=_auth(admin_token),
            timeout=10,
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "No certificate available for this dance."


# ======== Rate limit — run LAST so we don't lock admin out mid-suite ========
class TestCertificateRateLimit:
    def test_rate_limit_per_user(self, admin_token, instructor_token, completed_dance_id):
        """31 rapid hits by admin → 429; then instructor gets 200/404 (proves per-user)."""
        status_codes = []
        for i in range(35):
            r = requests.get(
                f"{BASE_URL}/certificate/{completed_dance_id}",
                headers=_auth(admin_token),
                timeout=15,
            )
            status_codes.append(r.status_code)
            if r.status_code == 429:
                assert "Whoa there" in r.text or "wait" in r.text.lower(), r.text
                break
        assert 429 in status_codes, f"never hit 429 after 35 hits: {status_codes}"

        # Now Jamin (instructor, different user) should NOT be blocked.
        # He probably hasn't completed this dance so 404 is fine — the point
        # is we DON'T get 429 as a different user.
        r = requests.get(
            f"{BASE_URL}/certificate/{completed_dance_id}",
            headers=_auth(instructor_token),
            timeout=15,
        )
        assert r.status_code != 429, (
            f"per-user limit leaked across users: {r.status_code} {r.text[:100]}"
        )


# ======== Trend clamping ========
class TestTrendClamp:
    @pytest.mark.parametrize("weeks_param,expected", [
        ("0", 2),
        ("1", 2),
        ("99", 26),
        ("8", 8),
        ("", 8),
        ("abc", 8),
    ])
    def test_trend_clamp(self, instructor_token, weeks_param, expected):
        r = requests.get(
            f"{BASE_URL}/instructor/trend?weeks={weeks_param}",
            headers=_auth(instructor_token),
            timeout=10,
        )
        assert r.status_code == 200, f"weeks={weeks_param!r}: {r.status_code} {r.text[:150]}"
        data = r.json()
        weeks = data.get("weeks", [])
        assert len(weeks) == expected, (
            f"weeks={weeks_param!r}: got {len(weeks)} entries, expected {expected}"
        )


# ======== Recently-practiced clamping ========
class TestRecentlyPracticedClamp:
    def test_limit_zero_clamps_to_one(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/recently-practiced?limit=0",
            headers=_auth(admin_token),
            timeout=10,
        )
        assert r.status_code == 200
        items = r.json().get("items", [])
        assert len(items) <= 1, f"limit=0 should clamp to 1, got {len(items)}"

    def test_limit_99_clamps_to_50(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/recently-practiced?limit=99",
            headers=_auth(admin_token),
            timeout=10,
        )
        assert r.status_code == 200
        items = r.json().get("items", [])
        assert len(items) <= 50, f"limit=99 should clamp to 50, got {len(items)}"

    def test_limit_abc(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/recently-practiced?limit=abc",
            headers=_auth(admin_token),
            timeout=10,
        )
        # Either 422 (pydantic) or 200 with fallback to 10
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            items = r.json().get("items", [])
            assert len(items) <= 10
