"""Backend tests for the 3-item backlog:
   (1) Admin Feed Moderation actions (PATCH/DELETE)
   (2) Apple Link / Unlink from Profile
   (3) Multi-day Events (end_date on EventIn, overlap search)
"""
from __future__ import annotations

import os
import sys
import time
import uuid
from pathlib import Path

import httpx
import jwt as pyjwt
import pytest
import pytest_asyncio
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from server import app  # noqa: E402
from services import apple_auth  # noqa: E402
from core.database import db  # noqa: E402

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
APPLE_BUNDLE_AUD = "com.emergent.stompinyumaapp.uyr5zg"
TEST_KID = "test-kid-1"

ERIN = ("erinboroughs@gmail.com", "Stompin2026!")
JAMIN = ("luvtowork247@yahoo.com", "BootsDance49!")


# =============================================================
# Shared HTTP helpers (against the deployed preview backend)
# =============================================================
@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _login(sess, email, pw):
    r = sess.post(f"{BASE}/api/auth/login",
                  json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def erin(s):
    j = _login(s, *ERIN)
    return {"token": j["token"], "user": j["user"]}


@pytest.fixture(scope="module")
def jamin(s):
    j = _login(s, *JAMIN)
    return {"token": j["token"], "user": j["user"]}


@pytest.fixture(scope="module")
def fresh_user(s):
    tag = uuid.uuid4().hex[:8]
    email = f"TEST_backlog_{tag}@example.com"
    pw = "BacklogPass123!"
    r = s.post(f"{BASE}/api/auth/register",
               json={"email": email, "password": pw,
                     "name": f"TEST Backlog {tag}"}, timeout=20)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    return {"token": data["token"], "user": data["user"],
            "email": email, "password": pw}


# =============================================================
# (A) UserOut carries apple_sub + email_is_synthetic
# =============================================================
class TestUserOutHasAppleFields:
    def test_login_response_includes_flags(self, s, erin):
        u = erin["user"]
        assert "apple_sub" in u, u
        assert "email_is_synthetic" in u, u
        # Erin is email/password → not linked, not synthetic
        assert u["apple_sub"] == ""
        assert u["email_is_synthetic"] is False

    def test_me_response_includes_flags(self, s, erin):
        r = s.get(f"{BASE}/api/auth/me", headers=_hdr(erin["token"]))
        assert r.status_code == 200, r.text
        u = r.json()
        assert "apple_sub" in u
        assert "email_is_synthetic" in u


# =============================================================
# (B) Multi-day events — create/patch persistence + search overlap
# =============================================================
class TestMultiDayEvents:
    created_ids: list = []

    def _payload(self, name_suffix="", **overrides):
        p = {
            "name": f"TEST Multiday {name_suffix or uuid.uuid4().hex[:6]}",
            "description": "Multi-day workshop",
            "event_type": "workshop",
            "skill_level": "Improver",
            "date": "2026-09-14",
            "end_date": "2026-09-15",
            "start_time": "19:30",
            "end_time": "21:30",
            "venue_name": "Test Barn",
            "address": "1234 Main St",
            "city": "Yuma",
            "state": "AZ",
            "zip_code": "85364",
            "country": "US",
            "price": "$25",
            "is_published": True,
        }
        p.update(overrides)
        return p

    def test_create_with_end_date_persists(self, s, erin):
        p = self._payload(name_suffix="persist")
        r = s.post(f"{BASE}/api/events", json=p, headers=_hdr(erin["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("end_date") == "2026-09-15", d
        assert d.get("date") == "2026-09-14"
        TestMultiDayEvents.created_ids.append(d["id"])

    def test_create_with_empty_end_date_is_ok(self, s, erin):
        p = self._payload(name_suffix="empty", end_date="")
        r = s.post(f"{BASE}/api/events", json=p, headers=_hdr(erin["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("end_date", "") == "", d
        TestMultiDayEvents.created_ids.append(d["id"])

    def test_patch_updates_end_date(self, s, erin):
        p = self._payload(name_suffix="patch", end_date="")
        r = s.post(f"{BASE}/api/events", json=p, headers=_hdr(erin["token"]))
        assert r.status_code == 200
        eid = r.json()["id"]
        TestMultiDayEvents.created_ids.append(eid)
        p2 = self._payload(name_suffix="patch", end_date="2026-09-16")
        r2 = s.patch(f"{BASE}/api/events/{eid}", json=p2,
                     headers=_hdr(erin["token"]))
        assert r2.status_code == 200, r2.text
        assert r2.json().get("end_date") == "2026-09-16"

    def test_search_overlap_multi_day(self, s, erin):
        # Ensure the multi-day event exists (created above)
        assert TestMultiDayEvents.created_ids, "no prior event"
        # Query for the SECOND day only — should still find event spanning it
        r = s.get(
            f"{BASE}/api/events/search",
            params={"date_from": "2026-09-15", "date_to": "2026-09-15",
                    "q": "TEST Multiday", "include_classes": "false"},
            headers=_hdr(erin["token"]),
        )
        assert r.status_code == 200, r.text
        events = r.json().get("events", [])
        assert any(
            e.get("end_date") == "2026-09-15" for e in events
        ), f"multi-day event not surfaced by overlap query: {events[:2]}"

    def test_search_single_day_unchanged(self, s, erin):
        # A single-day event (end_date=='') on 2026-09-14 should NOT
        # appear when querying only 2026-09-15
        r = s.get(
            f"{BASE}/api/events/search",
            params={"date_from": "2026-09-15", "date_to": "2026-09-15",
                    "q": "TEST Multiday empty", "include_classes": "false"},
            headers=_hdr(erin["token"]),
        )
        assert r.status_code == 200
        events = r.json().get("events", [])
        # None of the "empty" events (2026-09-14, no end_date) match
        for e in events:
            if "empty" in e.get("name", "").lower():
                pytest.fail(f"single-day event leaked into 09-15 query: {e}")

    @classmethod
    def teardown_class(cls):
        # Best-effort cleanup
        try:
            sess = requests.Session()
            j = sess.post(f"{BASE}/api/auth/login",
                          json={"email": ERIN[0], "password": ERIN[1]},
                          timeout=15).json()
            tok = j["token"]
            for eid in cls.created_ids:
                sess.delete(f"{BASE}/api/events/{eid}", headers=_hdr(tok))
        except Exception:
            pass


# =============================================================
# (C) Admin moderation: PATCH /admin/feed/reports/{report_id}
#     + DELETE /admin/feed/events/{event_id}
# =============================================================
def _ensure_completion_event(sess, tok):
    r = sess.get(f"{BASE}/api/dances?limit=25", headers=_hdr(tok))
    assert r.status_code == 200
    body = r.json()
    dances = body if isinstance(body, list) else (
        body.get("dances") or body.get("items") or []
    )
    for d in dances:
        did = d.get("id") or d.get("dance_id")
        if not did:
            continue
        tr = sess.post(f"{BASE}/api/tracking/{did}",
                       headers=_hdr(tok), json={"status": "completed"})
        if tr.status_code not in (200, 201):
            continue
        fr = sess.get(f"{BASE}/api/feed?limit=50", headers=_hdr(tok))
        assert fr.status_code == 200
        for e in fr.json().get("events", []):
            if e.get("type") == "completion" and e.get("id"):
                return e["id"]
    pytest.skip("Could not produce completion event")


class TestAdminModeration:
    def test_reports_include_new_fields(self, s, erin, fresh_user):
        # Produce a fresh event + report for hydration
        eid = _ensure_completion_event(s, erin["token"])
        rep = s.post(f"{BASE}/api/feed/{eid}/report",
                     headers=_hdr(fresh_user["token"]),
                     json={"reason": "spam", "note": "TEST hydrate"})
        assert rep.status_code == 200, rep.text
        r = s.get(f"{BASE}/api/admin/feed/reports?status=open&limit=50",
                  headers=_hdr(erin["token"]))
        assert r.status_code == 200, r.text
        rows = r.json().get("reports", [])
        mine = next((x for x in rows
                     if x.get("reporter_id") == fresh_user["user"]["user_id"]
                     and x.get("event_id") == eid), None)
        assert mine, f"row not found: {rows[:2]}"
        assert mine.get("report_id") == f"{fresh_user['user']['user_id']}:{eid}"
        assert mine.get("event_exists") is True
        assert mine.get("event_snippet"), mine

    def test_patch_report_status_admin(self, s, erin, fresh_user):
        eid = _ensure_completion_event(s, erin["token"])
        s.post(f"{BASE}/api/feed/{eid}/report",
               headers=_hdr(fresh_user["token"]),
               json={"reason": "hate_speech"})
        rid = f"{fresh_user['user']['user_id']}:{eid}"
        r = s.patch(f"{BASE}/api/admin/feed/reports/{rid}",
                    headers=_hdr(erin["token"]),
                    json={"status": "resolved",
                          "resolution_note": "  looked at it  "})
        assert r.status_code == 200, r.text

        # Verify persisted via filter=resolved
        q = s.get(f"{BASE}/api/admin/feed/reports?status=resolved&limit=100",
                  headers=_hdr(erin["token"]))
        assert q.status_code == 200
        rows = q.json().get("reports", [])
        got = next((x for x in rows if x.get("report_id") == rid), None)
        assert got, "resolved row not found"
        assert got["status"] == "resolved"
        # trimmed
        assert got.get("resolution_note") == "looked at it"
        assert got.get("resolved_by")
        assert got.get("resolved_at")

    def test_patch_non_admin_forbidden(self, s, jamin, fresh_user):
        # Jamin is instructor only, NOT admin
        rid = f"someone:evt_bogus"
        r = s.patch(f"{BASE}/api/admin/feed/reports/{rid}",
                    headers=_hdr(jamin["token"]),
                    json={"status": "resolved"})
        assert r.status_code == 403, r.status_code

    def test_patch_malformed_report_id(self, s, erin):
        r = s.patch(f"{BASE}/api/admin/feed/reports/no-colon-here",
                    headers=_hdr(erin["token"]),
                    json={"status": "resolved"})
        assert r.status_code == 400, r.text

    def test_patch_unknown_status(self, s, erin, fresh_user):
        eid = _ensure_completion_event(s, erin["token"])
        rid = f"{fresh_user['user']['user_id']}:{eid}"
        r = s.patch(f"{BASE}/api/admin/feed/reports/{rid}",
                    headers=_hdr(erin["token"]),
                    json={"status": "not_a_status"})
        assert r.status_code == 400, r.text

    def test_patch_missing_report_404(self, s, erin):
        rid = f"user_ghost:evt_missing_{uuid.uuid4().hex[:6]}"
        r = s.patch(f"{BASE}/api/admin/feed/reports/{rid}",
                    headers=_hdr(erin["token"]),
                    json={"status": "resolved"})
        assert r.status_code == 404, r.text

    def test_delete_event_admin_and_audit_trail(self, s, erin, fresh_user):
        eid = _ensure_completion_event(s, erin["token"])
        # Fresh user files a report
        s.post(f"{BASE}/api/feed/{eid}/report",
               headers=_hdr(fresh_user["token"]),
               json={"reason": "spam"})
        # Admin deletes the underlying event
        d = s.delete(f"{BASE}/api/admin/feed/events/{eid}",
                     headers=_hdr(erin["token"]))
        assert d.status_code == 200, d.text
        # Second delete = 404 (already gone)
        d2 = s.delete(f"{BASE}/api/admin/feed/events/{eid}",
                      headers=_hdr(erin["token"]))
        assert d2.status_code == 404, d2.text
        # Report row stays with event_exists=false
        q = s.get(f"{BASE}/api/admin/feed/reports?status=all&limit=200",
                  headers=_hdr(erin["token"]))
        assert q.status_code == 200
        rows = q.json().get("reports", [])
        got = next((x for x in rows if x.get("event_id") == eid), None)
        assert got, "audit report row was purged (should persist)"
        assert got.get("event_exists") is False, got

    def test_delete_event_non_admin_forbidden(self, s, jamin):
        r = s.delete(f"{BASE}/api/admin/feed/events/evt_bogus",
                     headers=_hdr(jamin["token"]))
        assert r.status_code == 403, r.status_code

    def test_regular_user_gets_403_on_admin(self, s, fresh_user):
        r = s.get(f"{BASE}/api/admin/feed/reports",
                  headers=_hdr(fresh_user["token"]))
        assert r.status_code == 403
        r2 = s.get(f"{BASE}/api/users/{fresh_user['user']['user_id']}",
                   headers=_hdr(fresh_user["token"]))
        assert r2.status_code == 200, "regular users must still see their public profile"


# =============================================================
# (D) Apple Link / Unlink (uses ASGI transport for JWKS mocking)
# =============================================================
@pytest.fixture(scope="module")
def rsa_keys():
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv_pem = priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return priv, priv_pem, priv.public_key()


@pytest.fixture(autouse=True)
def _install_jwks(rsa_keys):
    _, _, public_key = rsa_keys
    original = {
        "keys": dict(apple_auth._JWKS_CACHE["keys"]),
        "fetched_at": apple_auth._JWKS_CACHE["fetched_at"],
    }
    apple_auth._JWKS_CACHE["keys"] = {TEST_KID: public_key}
    apple_auth._JWKS_CACHE["fetched_at"] = time.time()
    yield
    apple_auth._JWKS_CACHE["keys"] = original["keys"]
    apple_auth._JWKS_CACHE["fetched_at"] = original["fetched_at"]


def _mint(private_pem, sub, email=None):
    now = int(time.time())
    claims = {
        "iss": "https://appleid.apple.com",
        "aud": APPLE_BUNDLE_AUD,
        "sub": sub,
        "iat": now,
        "exp": now + 300,
    }
    if email is not None:
        claims["email"] = email
        claims["email_verified"] = True
    return pyjwt.encode(claims, private_pem, algorithm="RS256",
                        headers={"kid": TEST_KID})


@pytest_asyncio.fixture
async def asgi_client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as c:
        yield c


async def _register_user_asgi(client, name_tag):
    email = f"TEST_link_{name_tag}_{uuid.uuid4().hex[:8]}@example.com"
    r = await client.post("/api/auth/register", json={
        "email": email, "password": "LinkPass1!", "name": f"TEST {name_tag}",
    })
    assert r.status_code == 200, r.text
    j = r.json()
    return j["token"], j["user"], email


class TestAppleLinkUnlink:
    @pytest.mark.asyncio
    async def test_link_attaches_apple_sub(self, asgi_client, rsa_keys):
        _, priv_pem, _ = rsa_keys
        tok, user, email = await _register_user_asgi(asgi_client, "attach")
        sub = f"001234.link.{uuid.uuid4().hex[:8]}"
        try:
            id_tok = _mint(priv_pem, sub=sub, email=email)
            r = await asgi_client.post(
                "/api/auth/apple/link",
                json={"identity_token": id_tok},
                headers={"Authorization": f"Bearer {tok}"},
            )
            assert r.status_code == 200, r.text
            assert r.json()["user"]["apple_sub"] == "apple"
            doc = await db.users.find_one({"user_id": user["user_id"]})
            assert doc.get("apple_sub") == sub
        finally:
            await db.users.delete_one({"user_id": user["user_id"]})

    @pytest.mark.asyncio
    async def test_link_idempotent(self, asgi_client, rsa_keys):
        _, priv_pem, _ = rsa_keys
        tok, user, email = await _register_user_asgi(asgi_client, "idem")
        sub = f"001234.idem.{uuid.uuid4().hex[:8]}"
        try:
            id_tok = _mint(priv_pem, sub=sub, email=email)
            r1 = await asgi_client.post(
                "/api/auth/apple/link",
                json={"identity_token": id_tok},
                headers={"Authorization": f"Bearer {tok}"},
            )
            assert r1.status_code == 200
            r2 = await asgi_client.post(
                "/api/auth/apple/link",
                json={"identity_token": id_tok},
                headers={"Authorization": f"Bearer {tok}"},
            )
            assert r2.status_code == 200, r2.text
            assert r2.json()["user"]["user_id"] == user["user_id"]
        finally:
            await db.users.delete_one({"user_id": user["user_id"]})

    @pytest.mark.asyncio
    async def test_link_conflict_409(self, asgi_client, rsa_keys):
        _, priv_pem, _ = rsa_keys
        tok_a, ua, email_a = await _register_user_asgi(asgi_client, "a")
        tok_b, ub, email_b = await _register_user_asgi(asgi_client, "b")
        sub = f"001234.conflict.{uuid.uuid4().hex[:8]}"
        try:
            id_tok_a = _mint(priv_pem, sub=sub, email=email_a)
            r1 = await asgi_client.post(
                "/api/auth/apple/link",
                json={"identity_token": id_tok_a},
                headers={"Authorization": f"Bearer {tok_a}"},
            )
            assert r1.status_code == 200
            # Now user B tries to link the SAME apple_sub
            id_tok_b = _mint(priv_pem, sub=sub, email=email_b)
            r2 = await asgi_client.post(
                "/api/auth/apple/link",
                json={"identity_token": id_tok_b},
                headers={"Authorization": f"Bearer {tok_b}"},
            )
            assert r2.status_code == 409, r2.text
        finally:
            await db.users.delete_one({"user_id": ua["user_id"]})
            await db.users.delete_one({"user_id": ub["user_id"]})

    @pytest.mark.asyncio
    async def test_unlink_allowed_when_password_exists(
        self, asgi_client, rsa_keys
    ):
        _, priv_pem, _ = rsa_keys
        tok, user, email = await _register_user_asgi(asgi_client, "unlink_ok")
        sub = f"001234.unlink.{uuid.uuid4().hex[:8]}"
        try:
            await asgi_client.post(
                "/api/auth/apple/link",
                json={"identity_token": _mint(priv_pem, sub, email)},
                headers={"Authorization": f"Bearer {tok}"},
            )
            r = await asgi_client.post(
                "/api/auth/apple/unlink",
                headers={"Authorization": f"Bearer {tok}"},
            )
            assert r.status_code == 200, r.text
            assert r.json()["user"]["apple_sub"] == ""
            doc = await db.users.find_one({"user_id": user["user_id"]})
            assert "apple_sub" not in doc or not doc.get("apple_sub")
        finally:
            await db.users.delete_one({"user_id": user["user_id"]})

    @pytest.mark.asyncio
    async def test_unlink_refuses_when_only_apple(self, asgi_client, rsa_keys):
        """User created via Apple with private-relay (synthetic email)
        and no password → unlink must refuse."""
        _, priv_pem, _ = rsa_keys
        sub = f"001234.only.{uuid.uuid4().hex[:8]}"
        # Create an Apple-only user
        id_tok = _mint(priv_pem, sub=sub, email=None)  # no email
        r0 = await asgi_client.post("/api/auth/apple",
                                    json={"identity_token": id_tok})
        assert r0.status_code == 200, r0.text
        j = r0.json()
        tok = j["token"]
        uid = j["user"]["user_id"]
        try:
            assert j["user"]["email_is_synthetic"] is True
            r = await asgi_client.post(
                "/api/auth/apple/unlink",
                headers={"Authorization": f"Bearer {tok}"},
            )
            assert r.status_code == 400, r.text
        finally:
            await db.users.delete_one({"user_id": uid})
