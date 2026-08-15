"""Focused backend tests for the new certificate theme feature.

Covers:
- GET /api/certificate-themes (public, no auth)
- PATCH /api/users/me/certificate-theme (auth required, validation, persistence)
- GET /api/certificate/{dance_id}?theme=X (query-param override, silent fallback)
- Regression sanity on the certificate endpoint (404s + valid PDF + filename)
"""
from __future__ import annotations

import re

import pytest
import requests

BASE_URL = "http://localhost:8001/api"

ADMIN = {"email": "erinboroughs@gmail.com", "password": "Stompin2026!"}
INSTRUCTOR = {"email": "luvtowork247@yahoo.com", "password": "BootsDance49!"}

VALID_THEMES = ["classic", "mardi_gras", "desert_sunset"]
HEX_RE = re.compile(r"^#[0-9A-F]{6}$", re.IGNORECASE)


# -------- helpers --------
def _login(creds: dict) -> str:
    r = requests.post(f"{BASE_URL}/auth/login", json=creds, timeout=10)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in login response: {data}"
    return tok


def _auth(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def instructor_token():
    return _login(INSTRUCTOR)


@pytest.fixture(scope="module")
def completed_dance_id(admin_token):
    """Return a dance_id for which the admin has a completed tracking row."""
    r = requests.get(f"{BASE_URL}/dances", timeout=10)
    assert r.status_code == 200
    items = r.json()
    if isinstance(items, dict):
        items = items.get("items") or items.get("dances") or []
    assert len(items) > 0
    dance_id = items[0].get("id") or items[0].get("dance_id")
    # Mark completed (idempotent path — status may already be completed)
    tried = []
    for payload in ({"dance_id": dance_id, "status": "completed"}, {"status": "completed"}):
        r = requests.post(
            f"{BASE_URL}/tracking/{dance_id}",
            json=payload,
            headers=_auth(admin_token),
            timeout=10,
        )
        tried.append((r.status_code, r.text[:80]))
        if r.status_code in (200, 201):
            return dance_id
    r = requests.post(
        f"{BASE_URL}/tracking",
        json={"dance_id": dance_id, "status": "completed"},
        headers=_auth(admin_token),
        timeout=10,
    )
    if r.status_code in (200, 201):
        return dance_id
    pytest.skip(f"could not mark dance completed; attempts: {tried}")


# ================================================================
# 1) GET /api/certificate-themes (public, no auth)
# ================================================================
class TestCertificateThemesEndpoint:
    def test_public_no_auth_required(self):
        r = requests.get(f"{BASE_URL}/certificate-themes", timeout=10)
        assert r.status_code == 200, r.text

    def test_default_is_classic(self):
        r = requests.get(f"{BASE_URL}/certificate-themes", timeout=10)
        data = r.json()
        assert data.get("default") == "classic"

    def test_themes_shape_and_count(self):
        r = requests.get(f"{BASE_URL}/certificate-themes", timeout=10)
        data = r.json()
        themes = data.get("themes")
        assert isinstance(themes, list)
        assert len(themes) == 3, f"expected 3 themes, got {len(themes)}"
        keys = {t["key"] for t in themes}
        assert keys == set(VALID_THEMES), f"unexpected theme keys: {keys}"

    def test_each_theme_has_required_fields(self):
        r = requests.get(f"{BASE_URL}/certificate-themes", timeout=10)
        themes = r.json()["themes"]
        for t in themes:
            assert "key" in t and isinstance(t["key"], str)
            assert "label" in t and isinstance(t["label"], str) and t["label"]
            colors = t.get("colors")
            assert isinstance(colors, dict)
            for k in ("primary", "secondary", "accent", "bg", "ink"):
                v = colors.get(k)
                assert isinstance(v, str), f"theme {t['key']} missing color {k}"
                assert HEX_RE.match(v), f"theme {t['key']}.{k} not a #RRGGBB hex: {v}"

    def test_works_with_auth_too(self, admin_token):
        # Authorization header should not break the public endpoint.
        r = requests.get(
            f"{BASE_URL}/certificate-themes", headers=_auth(admin_token), timeout=10
        )
        assert r.status_code == 200


# ================================================================
# 2) PATCH /api/users/me/certificate-theme
# ================================================================
class TestSetCertificateTheme:
    def test_401_without_auth(self):
        r = requests.patch(
            f"{BASE_URL}/users/me/certificate-theme",
            json={"theme": "classic"},
            timeout=10,
        )
        assert r.status_code in (401, 403), r.status_code

    @pytest.mark.parametrize("theme", VALID_THEMES)
    def test_valid_themes_accepted(self, admin_token, theme):
        r = requests.patch(
            f"{BASE_URL}/users/me/certificate-theme",
            json={"theme": theme},
            headers=_auth(admin_token),
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("theme") == theme

    def test_bogus_theme_returns_400_with_expected_message(self, admin_token):
        r = requests.patch(
            f"{BASE_URL}/users/me/certificate-theme",
            json={"theme": "bogus"},
            headers=_auth(admin_token),
            timeout=10,
        )
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        # Order-tolerant: check that all three theme names appear in the msg
        for t in VALID_THEMES:
            assert t in detail, f"missing '{t}' in error detail: {detail}"
        assert "Unknown theme" in detail

    def test_empty_string_theme_returns_400(self, admin_token):
        r = requests.patch(
            f"{BASE_URL}/users/me/certificate-theme",
            json={"theme": ""},
            headers=_auth(admin_token),
            timeout=10,
        )
        assert r.status_code == 400

    def test_missing_theme_field_returns_400(self, admin_token):
        r = requests.patch(
            f"{BASE_URL}/users/me/certificate-theme",
            json={},
            headers=_auth(admin_token),
            timeout=10,
        )
        assert r.status_code == 400

    def test_patch_reflected_in_auth_me(self, admin_token):
        # Set a distinct theme and confirm /auth/me echoes it
        r1 = requests.patch(
            f"{BASE_URL}/users/me/certificate-theme",
            json={"theme": "mardi_gras"},
            headers=_auth(admin_token),
            timeout=10,
        )
        assert r1.status_code == 200 and r1.json()["theme"] == "mardi_gras"

        r2 = requests.get(f"{BASE_URL}/auth/me", headers=_auth(admin_token), timeout=10)
        assert r2.status_code == 200, r2.text
        me = r2.json()
        assert me.get("certificate_theme") == "mardi_gras", me

        # Flip back to classic and re-verify
        r3 = requests.patch(
            f"{BASE_URL}/users/me/certificate-theme",
            json={"theme": "classic"},
            headers=_auth(admin_token),
            timeout=10,
        )
        assert r3.status_code == 200 and r3.json()["theme"] == "classic"
        r4 = requests.get(f"{BASE_URL}/auth/me", headers=_auth(admin_token), timeout=10)
        assert r4.json().get("certificate_theme") == "classic"


# ================================================================
# 3) GET /api/certificate/{id}?theme=X
# ================================================================
class TestCertificateThemeQueryParam:
    def _reset_to_classic(self, tok: str):
        r = requests.patch(
            f"{BASE_URL}/users/me/certificate-theme",
            json={"theme": "classic"},
            headers=_auth(tok),
            timeout=10,
        )
        assert r.status_code == 200

    def _assert_valid_pdf(self, r):
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
        assert r.content.startswith(b"%PDF"), r.content[:20]
        assert len(r.content) > 1000, f"suspiciously small PDF: {len(r.content)}B"

    def test_theme_query_param_mardi_gras(self, admin_token, completed_dance_id):
        self._reset_to_classic(admin_token)
        r = requests.get(
            f"{BASE_URL}/certificate/{completed_dance_id}",
            params={"theme": "mardi_gras"},
            headers=_auth(admin_token),
            timeout=15,
        )
        self._assert_valid_pdf(r)

    def test_theme_query_param_desert_sunset(self, admin_token, completed_dance_id):
        r = requests.get(
            f"{BASE_URL}/certificate/{completed_dance_id}",
            params={"theme": "desert_sunset"},
            headers=_auth(admin_token),
            timeout=15,
        )
        self._assert_valid_pdf(r)

    def test_bogus_theme_falls_back_silently(self, admin_token, completed_dance_id):
        r = requests.get(
            f"{BASE_URL}/certificate/{completed_dance_id}",
            params={"theme": "bogus"},
            headers=_auth(admin_token),
            timeout=15,
        )
        # Design spec: unknown theme silently falls back, NOT 400.
        self._assert_valid_pdf(r)

    def test_no_theme_param_uses_stored_preference(self, admin_token, completed_dance_id):
        # Set preference to mardi_gras then hit endpoint with no ?theme=
        r0 = requests.patch(
            f"{BASE_URL}/users/me/certificate-theme",
            json={"theme": "mardi_gras"},
            headers=_auth(admin_token),
            timeout=10,
        )
        assert r0.status_code == 200
        r = requests.get(
            f"{BASE_URL}/certificate/{completed_dance_id}",
            headers=_auth(admin_token),
            timeout=15,
        )
        self._assert_valid_pdf(r)
        # Restore
        self._reset_to_classic(admin_token)


# ================================================================
# 4) Regression sanity — /api/certificate/{id}
# ================================================================
class TestCertificateRegression:
    def test_no_theme_param_returns_valid_pdf(self, admin_token, completed_dance_id):
        r = requests.get(
            f"{BASE_URL}/certificate/{completed_dance_id}",
            headers=_auth(admin_token),
            timeout=15,
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content.startswith(b"%PDF")

    def test_content_disposition_filename(self, admin_token, completed_dance_id):
        r = requests.get(
            f"{BASE_URL}/certificate/{completed_dance_id}",
            headers=_auth(admin_token),
            timeout=15,
        )
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert re.search(r'filename="sgy_certificate_[^"]*\.pdf"', cd), cd

    def test_nonexistent_dance_returns_404(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/certificate/nonexistent",
            headers=_auth(admin_token),
            timeout=10,
        )
        assert r.status_code == 404

    def test_no_auth_returns_401(self, completed_dance_id):
        r = requests.get(f"{BASE_URL}/certificate/{completed_dance_id}", timeout=10)
        assert r.status_code in (401, 403)
