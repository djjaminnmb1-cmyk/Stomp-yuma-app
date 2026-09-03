"""SEC-001/002/003 regression + broad auth/instructor regression.

Reruns the security-audit checkpoints:
  * SEC-001: rotated admin pw works, old pw rejected, seed non-restore
  * SEC-002: /api/instructors ReDoS-pattern safe (returns fast)
  * SEC-003: dance_library_sync identity-field demotion helper
  * Apple unlink precedence guard
  * Broad regression: register / me / forgot / reset / logout
  * Instructor endpoints (list / follow / main-instructor)
"""
from __future__ import annotations

import os
import sys
import time
import uuid
import pytest
import requests

# So we can import backend modules for SEC-003 unit-invocation
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Match E1's convention: fall back to reading frontend/.env (same file)
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "admin@stompinground.com"
ADMIN_NEW_PW = "C^c+9$ii4y@_L1mU4sl5BTOd"
ADMIN_OLD_PW = "Admin123!"
ERIN_EMAIL = "erinboroughs@gmail.com"
ERIN_PW = "Stompin2026!"
JAMIN_EMAIL = "luvtowork247@yahoo.com"
JAMIN_PW = "BootsDance49!"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(s, email, pw):
    return s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})


# ---------------- SEC-001: password rotation ----------------
class TestSEC001:
    def test_new_admin_password_works(self, s):
        r = _login(s, ADMIN_EMAIL, ADMIN_NEW_PW)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and data["token"]
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"].get("is_admin") is True

    def test_old_admin_password_rejected(self, s):
        r = _login(s, ADMIN_EMAIL, ADMIN_OLD_PW)
        assert r.status_code == 401, r.text

    def test_erin_still_logs_in(self, s):
        r = _login(s, ERIN_EMAIL, ERIN_PW)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["email"] == ERIN_EMAIL

    def test_jamin_still_logs_in(self, s):
        r = _login(s, JAMIN_EMAIL, JAMIN_PW)
        assert r.status_code == 200, r.text

    def test_seed_non_restore_code_path(self):
        """Read services/startup.py and confirm _seed_account only sets
        password_hash when the existing account has no hash."""
        with open("/app/backend/services/startup.py") as f:
            src = f.read()
        # Positive: guard exists
        assert 'if not existing.get("password_hash"):' in src
        # Negative: NOT unconditionally re-writing
        # (There should be no `updates["password_hash"] = hash_password(pw)`
        # outside the `if not existing.get("password_hash")` block.)
        block = src.split("if existing:", 1)[1].split("return", 1)[0]
        # Only one password_hash assignment inside the "existing" branch,
        # and it's inside the guarded block.
        assert block.count('updates["password_hash"] = hash_password') == 1


# ---------------- JWT / pwd_ver sanity ----------------
class TestJWTAfterLogin:
    def test_me_with_admin_token(self, s):
        r = _login(s, ADMIN_EMAIL, ADMIN_NEW_PW)
        assert r.status_code == 200
        tok = r.json()["token"]
        m = s.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert m.status_code == 200
        assert m.json()["email"] == ADMIN_EMAIL

    def test_concurrent_logins_return_valid_tokens(self, s):
        toks = []
        for _ in range(3):
            r = _login(s, ERIN_EMAIL, ERIN_PW)
            assert r.status_code == 200
            toks.append(r.json()["token"])
        # All three should validate independently
        for t in toks:
            m = s.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {t}"})
            assert m.status_code == 200


# ---------------- SEC-002: ReDoS pattern safety ----------------
class TestSEC002:
    def test_evil_regex_returns_fast(self, s):
        r = _login(s, ADMIN_EMAIL, ADMIN_NEW_PW)
        tok = r.json()["token"]
        # Catastrophic-backtracking pattern: (a+)++$
        start = time.time()
        resp = s.get(
            f"{BASE_URL}/api/instructors",
            params={"q": "(a+)++$"},
            headers={"Authorization": f"Bearer {tok}"},
        )
        elapsed = time.time() - start
        assert resp.status_code == 200, resp.text
        assert elapsed < 1.0, f"elapsed={elapsed:.2f}s — regex not escaped?"
        assert "instructors" in resp.json()

    def test_normal_search_still_matches_erin(self, s):
        r = _login(s, ADMIN_EMAIL, ADMIN_NEW_PW)
        tok = r.json()["token"]
        resp = s.get(
            f"{BASE_URL}/api/instructors",
            params={"q": "erin"},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert resp.status_code == 200
        names = [row["name"].lower() for row in resp.json()["instructors"]]
        assert any("erin" in n for n in names), names

    def test_dot_metachar_treated_as_literal(self, s):
        """`.` in escaped mode should NOT match arbitrary letters."""
        r = _login(s, ADMIN_EMAIL, ADMIN_NEW_PW)
        tok = r.json()["token"]
        # There is no instructor whose name contains a literal "e.i.n"
        resp = s.get(
            f"{BASE_URL}/api/instructors",
            params={"q": "e.i.n"},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert resp.status_code == 200
        names = [row["name"] for row in resp.json()["instructors"]]
        # Erin should NOT match "e.i.n" because dots are escaped
        assert not any("Erin" in n for n in names), names


# ---------------- SEC-003: identity-field demotion helper ----------------
class TestSEC003Demotion:
    """Direct unit invocation of _demote_low_confidence_name_changes."""

    def _diff(self, fields):
        return [{"field": f, "old": "o", "new": "n"} for f in fields]

    def test_below_composite_threshold_demotes_identity_fields(self):
        from services.dance_library_sync import _demote_low_confidence_name_changes as dem

        diff = self._diff(["name", "choreographer", "song", "artist", "count", "difficulty"])
        apply_now, defer = dem(diff, confidence=0.90, title_ratio=0.95)
        applied_fields = {d["field"] for d in apply_now}
        deferred_fields = {d["field"] for d in defer}
        assert applied_fields == {"song", "artist", "count", "difficulty"}
        assert deferred_fields == {"name", "choreographer"}

    def test_below_title_ratio_demotes_identity_fields(self):
        from services.dance_library_sync import _demote_low_confidence_name_changes as dem

        diff = self._diff(["name", "choreographer", "song"])
        apply_now, defer = dem(diff, confidence=0.97, title_ratio=0.80)
        assert {d["field"] for d in defer} == {"name", "choreographer"}
        assert {d["field"] for d in apply_now} == {"song"}

    def test_high_confidence_and_title_auto_applies_all(self):
        from services.dance_library_sync import _demote_low_confidence_name_changes as dem

        diff = self._diff(["name", "choreographer", "song", "artist"])
        apply_now, defer = dem(diff, confidence=0.97, title_ratio=0.90)
        assert defer == []
        assert {d["field"] for d in apply_now} == {"name", "choreographer", "song", "artist"}

    def test_edge_composite_0_95_title_0_85(self):
        from services.dance_library_sync import _demote_low_confidence_name_changes as dem

        diff = self._diff(["name", "choreographer"])
        apply_now, defer = dem(diff, confidence=0.95, title_ratio=0.85)
        assert defer == []
        assert {d["field"] for d in apply_now} == {"name", "choreographer"}

    def test_composite_just_below_0_95_demotes(self):
        from services.dance_library_sync import _demote_low_confidence_name_changes as dem

        diff = self._diff(["name", "choreographer", "count"])
        apply_now, defer = dem(diff, confidence=0.949, title_ratio=0.99)
        assert {d["field"] for d in defer} == {"name", "choreographer"}
        assert {d["field"] for d in apply_now} == {"count"}


# ---------------- Apple unlink precedence ----------------
class TestAppleUnlinkPrecedence:
    def test_source_has_parenthesised_guard(self):
        """Static check — the SEC audit fix was purely a code-level
        precedence fix. We assert the parens are still present."""
        with open("/app/backend/routes/auth.py") as f:
            src = f.read()
        # The guarded expression MUST wrap the (email AND not synthetic) branch
        # in parens so `or` doesn't short-circuit around it.
        expected = (
            'or (\n'
            '            bool(user.get("email"))\n'
            '            and not user.get("email_is_synthetic")\n'
            '        )'
        )
        assert expected in src, "Apple unlink precedence guard has drifted"


# ---------------- Broad auth regression ----------------
class TestBroadAuthRegression:
    def test_register_new_user(self, s):
        email = f"test_reg_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "name": "Test", "password": "TestPass123!"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["token"] and data["user"]["email"] == email

    def test_me_requires_valid_jwt(self, s):
        r = s.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer bogus"})
        assert r.status_code == 401

    def test_forgot_password_generic_response(self, s):
        r = s.post(
            f"{BASE_URL}/api/auth/forgot-password",
            json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com"},
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_reset_password_invalid_token(self, s):
        r = s.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"token": "bogus-token", "new_password": "NewPass123!"},
        )
        assert r.status_code == 400

    def test_logout_ok(self, s):
        r = _login(s, ERIN_EMAIL, ERIN_PW)
        tok = r.json()["token"]
        lo = s.post(
            f"{BASE_URL}/api/auth/logout",
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert lo.status_code == 200


# ---------------- Broad instructor regression ----------------
class TestInstructorRegression:
    def test_list_instructors(self, s):
        r = _login(s, ADMIN_EMAIL, ADMIN_NEW_PW)
        tok = r.json()["token"]
        resp = s.get(
            f"{BASE_URL}/api/instructors",
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "instructors" in body
        assert isinstance(body["instructors"], list)
        assert len(body["instructors"]) >= 1

    def test_follow_and_main_instructor_flow(self, s):
        # Register a fresh dancer to follow Erin
        email = f"test_dancer_{uuid.uuid4().hex[:8]}@example.com"
        reg = s.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "name": "TestDancer", "password": "DancerPass1!"},
        )
        assert reg.status_code == 200
        tok = reg.json()["token"]
        H = {"Authorization": f"Bearer {tok}"}

        # Find Erin's user_id via list_instructors
        listing = s.get(f"{BASE_URL}/api/instructors", params={"q": "erin"}, headers=H)
        assert listing.status_code == 200
        rows = listing.json()["instructors"]
        erin_row = next((r for r in rows if r["name"].lower().startswith("erin")), None)
        assert erin_row, rows
        erin_id = erin_row["user_id"]

        # Follow Erin
        fol = s.post(f"{BASE_URL}/api/instructors/{erin_id}/follow", headers=H)
        assert fol.status_code == 200
        assert fol.json()["is_following"] is True

        # Set as main-instructor
        main = s.patch(
            f"{BASE_URL}/api/auth/me/main-instructor",
            json={"instructor_id": erin_id},
            headers=H,
        )
        assert main.status_code == 200
        assert main.json()["main_instructor_id"] == erin_id

        # Confirm via /me
        me = s.get(f"{BASE_URL}/api/auth/me", headers=H)
        assert me.status_code == 200
        assert me.json().get("main_instructor_id") == erin_id
