"""Comprehensive regression tests for the post-refactor backend.

The monolithic server.py was split into core/, models/, routes/, services/
with zero deliberate API surface change. This file exercises every route to
confirm nothing broke.

Run:
    pytest /app/backend/tests/test_refactor_regression.py -v \
        --tb=short \
        --junitxml=/app/test_reports/pytest/refactor_regression.xml
"""
from __future__ import annotations

import os
import time
import uuid
from pathlib import Path

import pytest
import requests

from _creds import (  # SEC-001 remediation — passwords from .env
    ADMIN_EMAIL as GEN_ADMIN_EMAIL,
    ADMIN_PASSWORD as GEN_ADMIN_PASSWORD,
    ERIN_EMAIL,
    ERIN_PASSWORD,
    JAMIN_EMAIL,
    JAMIN_PASSWORD,
)


# ---------- Config ----------
def _load_backend_url() -> str:
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").strip()
    if not url:
        env_path = Path("/app/frontend/.env")
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.strip().startswith("EXPO_PUBLIC_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not url:
        raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not set")
    return url.rstrip("/")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

# Primary admin for this suite = Erin (both admin + step-sheet editor).
# ``ADMIN_EMAIL`` / ``ADMIN_PASSWORD`` are kept local for backward-compat
# with the many assertions below that read these names.
ADMIN_EMAIL = ERIN_EMAIL
ADMIN_PASSWORD = ERIN_PASSWORD
# GEN_ADMIN_* (admin@stompinground.com) come straight from _creds above.
INSTRUCTOR_EMAIL = JAMIN_EMAIL
INSTRUCTOR_PASSWORD = JAMIN_PASSWORD
INSTRUCTOR_CODE = "lineup4life"


# ---------- Session helpers ----------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api, email, password):
    r = api.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_token(api):
    return _login(api, ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def gen_admin_token(api):
    return _login(api, GEN_ADMIN_EMAIL, GEN_ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def instructor_token(api):
    return _login(api, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD)


def _make_user(api):
    email = f"TEST_regress_{uuid.uuid4().hex[:8]}@example.com"
    password = "TestPass123!"
    r = api.post(f"{API}/auth/register", json={
        "email": email, "password": password, "name": "TEST Regress User"
    })
    assert r.status_code == 200, r.text
    body = r.json()
    return {"email": email, "password": password, "token": body["token"], "user": body["user"]}


@pytest.fixture(scope="session")
def fresh_user(api):
    """A newly-registered plain user. May be mutated (e.g. promoted to
    instructor) by tests, so DO NOT rely on this for negative role checks."""
    u = _make_user(api)
    yield u
    try:
        api.delete(f"{API}/auth/me", headers=_hdr(u["token"]))
    except Exception:
        pass


@pytest.fixture()
def plain_user(api):
    """A fresh plain user PER TEST — never promoted. Use for 403 checks."""
    u = _make_user(api)
    yield u
    try:
        api.delete(f"{API}/auth/me", headers=_hdr(u["token"]))
    except Exception:
        pass


# ==================== MISC ====================
class TestMisc:
    def test_root(self, api):
        r = api.get(f"{API}/")
        assert r.status_code == 200
        assert "Stompin" in r.json().get("message", "")

    def test_venue(self, api):
        r = api.get(f"{API}/venue")
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Stompin' Ground Yuma"
        assert "instructor" in data


# ==================== AUTH ====================
class TestAuth:
    def test_seed_admin_login(self, admin_token):
        assert admin_token

    def test_seed_gen_admin_login(self, gen_admin_token):
        assert gen_admin_token

    def test_seed_instructor_login(self, instructor_token):
        assert instructor_token

    def test_me_admin_flags(self, api, admin_token):
        r = api.get(f"{API}/auth/me", headers=_hdr(admin_token))
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == ADMIN_EMAIL
        assert u["is_admin"] is True
        assert u["is_instructor"] is True

    def test_me_instructor_flags(self, api, instructor_token):
        r = api.get(f"{API}/auth/me", headers=_hdr(instructor_token))
        assert r.status_code == 200
        u = r.json()
        assert u["is_instructor"] is True
        # Jamin should not be admin (only instructor per credentials)
        assert u["is_admin"] is False

    def test_me_no_auth_401(self, api):
        r = api.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_login_invalid_password_401(self, api):
        r = api.post(f"{API}/auth/login", json={
            "email": ADMIN_EMAIL, "password": "WRONG_PASSWORD_XYZ"
        })
        assert r.status_code == 401

    def test_register_duplicate_400(self, api):
        r = api.post(f"{API}/auth/register", json={
            "email": ADMIN_EMAIL, "password": "SomePw123!", "name": "Dup"
        })
        assert r.status_code == 400

    def test_register_with_instructor_code_grants_role(self, api):
        email = f"TEST_ins_{uuid.uuid4().hex[:8]}@example.com"
        r = api.post(f"{API}/auth/register", json={
            "email": email, "password": "TestPass123!",
            "name": "TEST Ins User", "instructor_code": INSTRUCTOR_CODE
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["is_instructor"] is True
        # Cleanup
        try:
            api.delete(f"{API}/auth/me", headers=_hdr(body["token"]))
        except Exception:
            pass

    def test_set_instructor_wrong_code_400(self, api, fresh_user):
        r = api.post(f"{API}/auth/set-instructor",
                     json={"instructor_code": "WRONG_CODE"},
                     headers=_hdr(fresh_user["token"]))
        assert r.status_code == 400

    def test_set_instructor_correct_code(self, api, fresh_user):
        r = api.post(f"{API}/auth/set-instructor",
                     json={"instructor_code": INSTRUCTOR_CODE},
                     headers=_hdr(fresh_user["token"]))
        assert r.status_code == 200
        assert r.json()["user"]["is_instructor"] is True

    def test_forgot_password_no_enum(self, api):
        r = api.post(f"{API}/auth/forgot-password",
                     json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com"})
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_forgot_password_existing(self, api):
        r = api.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL})
        assert r.status_code == 200

    def test_reset_password_bad_token_400(self, api):
        r = api.post(f"{API}/auth/reset-password", json={
            "token": "bogus-token-abc", "new_password": "NewPass1234!"
        })
        assert r.status_code == 400

    def test_logout_200(self, api, fresh_user):
        r = api.post(f"{API}/auth/logout", headers=_hdr(fresh_user["token"]))
        assert r.status_code == 200


# ==================== DANCES ====================
class TestDances:
    def test_list_public(self, api):
        r = api.get(f"{API}/dances")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 200, f"expected 200+ dances, got {len(data)}"
        # only published in public feed
        for d in data[:20]:
            # `is_published` may be omitted from output but must be True/absent
            assert d.get("is_published", True) is True

    def test_list_search_and_difficulty(self, api):
        r = api.get(f"{API}/dances", params={"difficulty": "Beginner"})
        assert r.status_code == 200
        rows = r.json()
        assert all(d.get("difficulty") == "Beginner" for d in rows[:50])

    def test_list_search_q(self, api):
        r = api.get(f"{API}/dances", params={"q": "love"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_scope_mine_requires_auth(self, api):
        r = api.get(f"{API}/dances", params={"scope": "mine"})
        assert r.status_code == 401

    def test_list_scope_mine_authed(self, api, instructor_token):
        r = api.get(f"{API}/dances", params={"scope": "mine"},
                    headers=_hdr(instructor_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_scope_all_non_admin_403(self, api, instructor_token):
        # Jamin is instructor but not admin
        r = api.get(f"{API}/dances", params={"scope": "all"},
                    headers=_hdr(instructor_token))
        assert r.status_code == 403

    def test_list_scope_all_admin(self, api, admin_token):
        r = api.get(f"{API}/dances", params={"scope": "all"},
                    headers=_hdr(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_dance_draft(self, api, instructor_token):
        payload = {
            "name": f"TEST_Regression_{uuid.uuid4().hex[:6]}",
            "choreographer": "Test Choreographer",
            "song": "Test Song",
            "artist": "Test Artist",
            "difficulty": "Beginner",
            "bpm": 120,
            "count": "32 count, 4 wall",
        }
        r = api.post(f"{API}/dances", json=payload, headers=_hdr(instructor_token))
        assert r.status_code == 200
        d = r.json()
        assert d["is_published"] is False, "new dances must start as draft"
        assert d["id"].startswith("dance_")
        pytest.dance_id = d["id"]  # stash for later tests
        # GET to verify persistence (owner can see draft)
        g = api.get(f"{API}/dances/{d['id']}", headers=_hdr(instructor_token))
        assert g.status_code == 200

    def test_get_draft_anon_returns_404(self, api):
        # Draft created above must be hidden from anon
        r = api.get(f"{API}/dances/{pytest.dance_id}")
        assert r.status_code == 404

    def test_get_dance_not_found(self, api):
        r = api.get(f"{API}/dances/dance_does_not_exist")
        assert r.status_code == 404

    def test_update_dance_owner(self, api, instructor_token):
        payload = {
            "name": f"TEST_Regression_updated_{uuid.uuid4().hex[:6]}",
            "choreographer": "Test Choreographer",
            "song": "Test Song 2",
            "artist": "Test Artist",
            "difficulty": "Improver",
        }
        r = api.put(f"{API}/dances/{pytest.dance_id}", json=payload,
                    headers=_hdr(instructor_token))
        assert r.status_code == 200
        assert r.json()["difficulty"] == "Improver"

    def test_publish_and_unpublish(self, api, instructor_token):
        r = api.put(f"{API}/dances/{pytest.dance_id}/publish",
                    headers=_hdr(instructor_token))
        assert r.status_code == 200
        assert r.json()["is_published"] is True
        # Now public GET should find it
        rp = api.get(f"{API}/dances/{pytest.dance_id}")
        assert rp.status_code == 200
        # Unpublish
        r2 = api.put(f"{API}/dances/{pytest.dance_id}/unpublish",
                     headers=_hdr(instructor_token))
        assert r2.status_code == 200
        assert r2.json()["is_published"] is False

    def test_import_bulk_with_dupes(self, api, instructor_token):
        unique_name = f"TEST_Import_{uuid.uuid4().hex[:6]}"
        payload = {
            "dances": [
                {"name": unique_name, "choreographer": "A", "song": "S",
                 "artist": "Ar", "difficulty": "Beginner"},
                {"name": unique_name, "choreographer": "A", "song": "S",
                 "artist": "Ar", "difficulty": "Beginner"},  # dupe
                {"name": "", "choreographer": "A", "song": "S",
                 "difficulty": "Beginner"},  # error
            ],
            "publish_all": False,
        }
        r = api.post(f"{API}/dances/import", json=payload,
                     headers=_hdr(instructor_token))
        assert r.status_code == 200
        body = r.json()
        assert body["imported"] == 1
        assert body["skipped_duplicates"] == 1
        assert len(body["errors"]) == 1

    def test_delete_dance_admin_only(self, api, instructor_token, admin_token):
        # Instructor may not delete
        r = api.delete(f"{API}/dances/{pytest.dance_id}",
                       headers=_hdr(instructor_token))
        assert r.status_code == 403
        # Admin can
        r2 = api.delete(f"{API}/dances/{pytest.dance_id}",
                        headers=_hdr(admin_token))
        assert r2.status_code == 200
        assert r2.json().get("ok") is True

    def test_removed_dances_editor(self, api, admin_token):
        r = api.get(f"{API}/dances/removed", headers=_hdr(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_restore_by_name_missing(self, api, admin_token):
        r = api.post(f"{API}/dances/restore-by-name",
                     json={"name": f"TEST_NoSuchDance_{uuid.uuid4().hex}"},
                     headers=_hdr(admin_token))
        assert r.status_code == 404


# ==================== TRACKING ====================
class TestTracking:
    def test_track_and_list(self, api, fresh_user):
        # Pick a real dance
        dances = api.get(f"{API}/dances").json()
        assert len(dances) > 0
        did = dances[0]["id"]
        r = api.post(f"{API}/tracking/{did}",
                     json={"status": "completed", "rating": 4, "notes": "test"},
                     headers=_hdr(fresh_user["token"]))
        assert r.status_code == 200
        # GET
        r2 = api.get(f"{API}/tracking/me", headers=_hdr(fresh_user["token"]))
        assert r2.status_code == 200
        assert any(t["dance_id"] == did and t["status"] == "completed"
                   for t in r2.json())
        # Delete
        r3 = api.delete(f"{API}/tracking/{did}", headers=_hdr(fresh_user["token"]))
        assert r3.status_code == 200

    def test_track_invalid_status(self, api, fresh_user):
        dances = api.get(f"{API}/dances").json()
        did = dances[0]["id"]
        r = api.post(f"{API}/tracking/{did}",
                     json={"status": "bogus"},
                     headers=_hdr(fresh_user["token"]))
        assert r.status_code == 400

    def test_track_invalid_dance(self, api, fresh_user):
        r = api.post(f"{API}/tracking/dance_nope",
                     json={"status": "completed"},
                     headers=_hdr(fresh_user["token"]))
        assert r.status_code == 404


# ==================== CLASSES + ATTENDANCE ====================
class TestClasses:
    def test_list_scopes(self, api):
        for scope in ("all", "upcoming", "past"):
            r = api.get(f"{API}/classes", params={"scope": scope})
            assert r.status_code == 200, f"scope {scope} -> {r.text}"
            assert isinstance(r.json(), list)

    def test_create_update_attend_delete_class(self, api, instructor_token, fresh_user):
        # Grab a couple of dance ids
        dances = api.get(f"{API}/dances").json()
        dance_ids = [dances[0]["id"], dances[1]["id"]]
        payload = {
            "date": "2099-01-01",  # future
            "session_label": "TEST Regression Class",
            "dance_ids": dance_ids,
            "notes": "regression test",
        }
        r = api.post(f"{API}/classes", json=payload,
                     headers=_hdr(instructor_token))
        assert r.status_code == 200
        cls = r.json()
        cid = cls["id"]

        # GET by id
        rg = api.get(f"{API}/classes/{cid}")
        assert rg.status_code == 200

        # Update
        payload["session_label"] = "TEST Regression Class (updated)"
        ru = api.put(f"{API}/classes/{cid}", json=payload,
                     headers=_hdr(instructor_token))
        assert ru.status_code == 200
        assert ru.json()["session_label"].endswith("(updated)")

        # Attend as fresh user
        ra = api.post(f"{API}/classes/{cid}/attend",
                      headers=_hdr(fresh_user["token"]))
        assert ra.status_code == 200
        assert ra.json()["attended"] is True

        # GET my attendance
        rm = api.get(f"{API}/attendance/me", headers=_hdr(fresh_user["token"]))
        assert rm.status_code == 200
        assert cid in rm.json()["class_ids"]

        # Unattend
        rua = api.delete(f"{API}/classes/{cid}/attend",
                         headers=_hdr(fresh_user["token"]))
        assert rua.status_code == 200
        assert rua.json()["attended"] is False

        # Delete class
        rd = api.delete(f"{API}/classes/{cid}", headers=_hdr(instructor_token))
        assert rd.status_code == 200

    def test_create_class_requires_instructor(self, api, plain_user):
        r = api.post(f"{API}/classes",
                     json={"date": "2099-01-01", "session_label": "x",
                           "dance_ids": []},
                     headers=_hdr(plain_user["token"]))
        assert r.status_code == 403

    def test_class_not_found(self, api):
        r = api.get(f"{API}/classes/class_nope")
        assert r.status_code == 404


# ==================== SUGGESTIONS ====================
class TestSuggestions:
    def test_submit_and_list_mine(self, api, fresh_user):
        r = api.post(f"{API}/suggestions",
                     json={"dance_name": f"TEST Sug {uuid.uuid4().hex[:5]}",
                           "song": "s", "artist": "a", "notes": "n"},
                     headers=_hdr(fresh_user["token"]))
        assert r.status_code == 200
        sid = r.json()["id"]
        pytest.sug_id = sid

        rm = api.get(f"{API}/suggestions/mine", headers=_hdr(fresh_user["token"]))
        assert rm.status_code == 200
        assert any(s["id"] == sid for s in rm.json())

    def test_list_all_admin(self, api, admin_token):
        r = api.get(f"{API}/suggestions", headers=_hdr(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_all_non_admin_forbidden(self, api, fresh_user):
        r = api.get(f"{API}/suggestions", headers=_hdr(fresh_user["token"]))
        assert r.status_code == 403

    def test_update_status_admin(self, api, admin_token):
        r = api.put(f"{API}/suggestions/{pytest.sug_id}/status",
                    params={"status": "queued"},
                    headers=_hdr(admin_token))
        assert r.status_code == 200
        assert r.json()["status"] == "queued"

    def test_delete_own(self, api, fresh_user):
        r = api.delete(f"{API}/suggestions/{pytest.sug_id}",
                       headers=_hdr(fresh_user["token"]))
        assert r.status_code == 200

    def test_oversized_image_413(self, api, fresh_user):
        big = "a" * 6_000_001
        r = api.post(f"{API}/suggestions",
                     json={"dance_name": "TEST too big",
                           "step_sheet_image": big},
                     headers=_hdr(fresh_user["token"]))
        assert r.status_code == 413


# ==================== CHAT ====================
class TestChat:
    def test_post_and_list_instructor(self, api, instructor_token):
        r = api.post(f"{API}/chat/messages",
                     json={"message": f"TEST chat {uuid.uuid4().hex[:5]}"},
                     headers=_hdr(instructor_token))
        assert r.status_code == 200
        mid = r.json()["id"]
        pytest.chat_id = mid

        rl = api.get(f"{API}/chat/messages", headers=_hdr(instructor_token))
        assert rl.status_code == 200
        assert any(m["id"] == mid for m in rl.json())

    def test_non_instructor_forbidden(self, api, plain_user):
        r = api.get(f"{API}/chat/messages", headers=_hdr(plain_user["token"]))
        assert r.status_code == 403

    def test_delete_own_message(self, api, instructor_token):
        r = api.delete(f"{API}/chat/messages/{pytest.chat_id}",
                       headers=_hdr(instructor_token))
        assert r.status_code == 200


# ==================== LEADERBOARD ====================
class TestLeaderboard:
    def test_anon_no_user_id_field(self, api):
        r = api.get(f"{API}/leaderboard")
        assert r.status_code == 200
        body = r.json()
        assert "entries" in body
        for e in body["entries"]:
            assert "user_id" not in e, "user_id must not be exposed to anon"
        # `me` should be None for anon
        assert body.get("me") is None

    def test_authed_has_me(self, api, admin_token):
        r = api.get(f"{API}/leaderboard", headers=_hdr(admin_token))
        assert r.status_code == 200
        body = r.json()
        assert body.get("me") is not None

    def test_range_week_month(self, api):
        for rng in ("week", "month"):
            r = api.get(f"{API}/leaderboard", params={"range": rng})
            assert r.status_code == 200
            assert r.json()["range"] == rng

    def test_invalid_range(self, api):
        r = api.get(f"{API}/leaderboard", params={"range": "decade"})
        assert r.status_code == 400

    def test_toggle_optin(self, api, fresh_user):
        for val in (True, False):
            r = api.patch(f"{API}/users/me/leaderboard",
                          json={"show_on_leaderboard": val},
                          headers=_hdr(fresh_user["token"]))
            assert r.status_code == 200


# ==================== INSTRUCTOR DASHBOARD ====================
class TestDashboard:
    def test_no_auth_401(self, api):
        r = api.get(f"{API}/instructor/dashboard")
        assert r.status_code == 401

    def test_regular_user_403(self, api, plain_user):
        r = api.get(f"{API}/instructor/dashboard",
                    headers=_hdr(plain_user["token"]))
        assert r.status_code == 403

    def test_instructor_ok_no_email(self, api, instructor_token):
        r = api.get(f"{API}/instructor/dashboard",
                    headers=_hdr(instructor_token))
        assert r.status_code == 200
        body = r.json()
        assert "overview" in body
        assert "top_dances" in body
        assert "students" in body
        assert "recent_classes" in body
        # Regular instructor (Jamin, non-admin) must NOT see email
        for s in body["students"]:
            assert "email" not in s, "instructor sees email — PII leak!"

    def test_admin_sees_email(self, api, admin_token):
        r = api.get(f"{API}/instructor/dashboard",
                    headers=_hdr(admin_token))
        assert r.status_code == 200
        students = r.json()["students"]
        if students:
            # At least some rows should have email since admin
            has_email_key = any("email" in s for s in students)
            assert has_email_key, "admin should see email on at least some rows"


# ==================== SONG PREVIEW ====================
class TestSongPreview:
    def test_valid_query(self, api):
        r = api.get(f"{API}/song-preview",
                    params={"song": "A Bar Song (Tipsy)", "artist": "Shaboozey"})
        # This depends on iTunes; if their API is down, allow 404 too
        assert r.status_code in (200, 404), r.text
        if r.status_code == 200:
            assert "previewUrl" in r.json()

    def test_empty_song_400(self, api):
        r = api.get(f"{API}/song-preview", params={"song": ""})
        assert r.status_code == 400

    def test_nonsense_query_404(self, api):
        r = api.get(f"{API}/song-preview",
                    params={"song": f"XXX_no_such_song_{uuid.uuid4().hex}",
                            "artist": "YYY_nobody"})
        assert r.status_code == 404

    def test_cache_hit_fast_second_call(self, api):
        term = {"song": "A Bar Song (Tipsy)", "artist": "Shaboozey"}
        api.get(f"{API}/song-preview", params=term)  # warm cache
        t0 = time.time()
        r = api.get(f"{API}/song-preview", params=term)
        elapsed = time.time() - t0
        assert r.status_code in (200, 404)
        # Cache hit should be <1s (iTunes lookup is 200-3000ms)
        assert elapsed < 2.0, f"suspiciously slow cached call: {elapsed:.2f}s"


# ==================== PUSH ====================
class TestPush:
    def test_no_auth_401(self, api):
        r = api.post(f"{API}/register-push",
                     json={"user_id": "x", "platform": "ios",
                           "device_token": "tok"})
        assert r.status_code == 401

    def test_authed_returns_proper_status(self, api, fresh_user):
        r = api.post(f"{API}/register-push",
                     json={"user_id": "ignored", "platform": "ios",
                           "device_token": "TEST_token_abc"},
                     headers=_hdr(fresh_user["token"]))
        # Upstream relay may be down in preview → 502 is acceptable.
        # Auth guard must NOT return 401 here.
        assert r.status_code in (201, 502), r.text
