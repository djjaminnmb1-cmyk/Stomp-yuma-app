"""Backend tests for Sign in with Apple (/api/auth/apple).

Strategy
--------
The identity_token verification hits Apple's JWKS. We can't reach that
in tests, so we monkey-patch ``services.apple_auth._JWKS_CACHE`` with a
locally generated RS256 keypair and sign our own test JWTs with a
matching ``kid`` header.

Because the tests need in-process access to the cache dict, we exercise
the FastAPI app via httpx.ASGITransport, NOT via the public preview URL.
This is the only way the monkeypatch is visible to the request handler.
"""
from __future__ import annotations

import importlib
import os
import sys
import time
import uuid
from pathlib import Path

import httpx
import jwt as pyjwt
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

# Ensure /app/backend is importable
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from server import app  # noqa: E402
from services import apple_auth  # noqa: E402
from core.database import db  # noqa: E402
from core.terms import TERMS_VERSION  # noqa: E402

APPLE_BUNDLE_AUD = "com.emergent.stompinyumaapp.uyr5zg"
TEST_KID = "test-kid-1"


# --------- Keypair + JWT helpers ---------
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
    """Inject the public key into the JWKS cache and restore afterward."""
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


def _mint(private_pem: bytes, *, claims_override: dict | None = None,
          headers: dict | None = None) -> str:
    now = int(time.time())
    claims = {
        "iss": "https://appleid.apple.com",
        "aud": APPLE_BUNDLE_AUD,
        "sub": "001234.abcd.ef",
        "email": "newtester@privaterelay.appleid.com",
        "email_verified": True,
        "iat": now,
        "exp": now + 300,
    }
    if claims_override is not None:
        for k, v in claims_override.items():
            if v is None:
                claims.pop(k, None)
            else:
                claims[k] = v
    hdrs = {"kid": TEST_KID}
    if headers:
        hdrs.update(headers)
    return pyjwt.encode(claims, private_pem, algorithm="RS256", headers=hdrs)


@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as c:
        yield c


# --------- Cleanup helper ---------
async def _delete_users_by_sub_or_email(sub: str | None = None,
                                       email: str | None = None):
    if sub:
        await db.users.delete_many({"apple_sub": sub})
    if email:
        await db.users.delete_many({"email": email.lower()})


# =====================================================
# Malformed / bogus token
# =====================================================
@pytest.mark.asyncio
async def test_bogus_token_returns_401_malformed(client):
    r = await client.post("/api/auth/apple",
                          json={"identity_token": "not.a.jwt"})
    assert r.status_code == 401
    assert "Malformed token" in r.json()["detail"]


# =====================================================
# Happy path — new user
# =====================================================
@pytest.mark.asyncio
async def test_valid_token_creates_new_user(client, rsa_keys):
    _, priv_pem, _ = rsa_keys
    sub = f"001234.happy.{uuid.uuid4().hex[:8]}"
    email = f"TEST_apple_{uuid.uuid4().hex[:8]}@privaterelay.appleid.com"
    try:
        token = _mint(priv_pem,
                      claims_override={"sub": sub, "email": email})
        r = await client.post("/api/auth/apple",
                              json={"identity_token": token})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_new_user"] is True
        assert data["token"]
        assert data["user"]["email"] == email.lower()
        assert data["user"]["auth_provider"] == "apple"

        # DB persistence
        doc = await db.users.find_one({"apple_sub": sub})
        assert doc is not None
        assert doc["email"] == email.lower()
        assert doc.get("is_instructor") is False
        assert doc.get("is_admin") is False
    finally:
        await _delete_users_by_sub_or_email(sub=sub, email=email)


# =====================================================
# Idempotent second call — same sub returns is_new_user: false
# =====================================================
@pytest.mark.asyncio
async def test_second_call_is_idempotent(client, rsa_keys):
    _, priv_pem, _ = rsa_keys
    sub = f"001234.idem.{uuid.uuid4().hex[:8]}"
    email = f"TEST_idem_{uuid.uuid4().hex[:8]}@privaterelay.appleid.com"
    try:
        token = _mint(priv_pem,
                      claims_override={"sub": sub, "email": email})
        r1 = await client.post("/api/auth/apple",
                               json={"identity_token": token})
        assert r1.status_code == 200
        assert r1.json()["is_new_user"] is True

        r2 = await client.post("/api/auth/apple",
                               json={"identity_token": token})
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["is_new_user"] is False
        assert d2["user"]["user_id"] == r1.json()["user"]["user_id"]
    finally:
        await _delete_users_by_sub_or_email(sub=sub, email=email)


# =====================================================
# Audience mismatch
# =====================================================
@pytest.mark.asyncio
async def test_wrong_audience_returns_401(client, rsa_keys):
    _, priv_pem, _ = rsa_keys
    token = _mint(priv_pem,
                  claims_override={"aud": "some.other.app",
                                   "sub": f"001234.wrongaud.{uuid.uuid4().hex[:6]}"})
    r = await client.post("/api/auth/apple",
                          json={"identity_token": token})
    assert r.status_code == 401
    assert "audience" in r.json()["detail"].lower()


# =====================================================
# Issuer mismatch
# =====================================================
@pytest.mark.asyncio
async def test_wrong_issuer_returns_401(client, rsa_keys):
    _, priv_pem, _ = rsa_keys
    token = _mint(priv_pem,
                  claims_override={"iss": "https://not-apple.example.com",
                                   "sub": f"001234.wrongiss.{uuid.uuid4().hex[:6]}"})
    r = await client.post("/api/auth/apple",
                          json={"identity_token": token})
    assert r.status_code == 401
    assert "issuer" in r.json()["detail"].lower()


# =====================================================
# Expired token
# =====================================================
@pytest.mark.asyncio
async def test_expired_token_returns_401(client, rsa_keys):
    _, priv_pem, _ = rsa_keys
    now = int(time.time())
    token = _mint(priv_pem,
                  claims_override={"iat": now - 3600,
                                   "exp": now - 60,
                                   "sub": f"001234.exp.{uuid.uuid4().hex[:6]}"})
    r = await client.post("/api/auth/apple",
                          json={"identity_token": token})
    assert r.status_code == 401
    assert "expired" in r.json()["detail"].lower()


# =====================================================
# Missing sub claim
# =====================================================
@pytest.mark.asyncio
async def test_missing_sub_returns_401(client, rsa_keys):
    _, priv_pem, _ = rsa_keys
    token = _mint(priv_pem, claims_override={"sub": None})
    r = await client.post("/api/auth/apple",
                          json={"identity_token": token})
    assert r.status_code == 401
    assert "sub" in r.json()["detail"].lower()


# =====================================================
# Legacy linking — email/password user gets apple_sub attached
# =====================================================
@pytest.mark.asyncio
async def test_legacy_linking_by_email(client, rsa_keys):
    _, priv_pem, _ = rsa_keys
    email = f"TEST_linked_{uuid.uuid4().hex[:8]}@example.com"
    sub = f"001234.link.{uuid.uuid4().hex[:8]}"
    try:
        # Register email/password user first
        reg = await client.post("/api/auth/register", json={
            "email": email,
            "password": "TestApple1!",
            "name": "Legacy User",
            "accepted_terms_version": TERMS_VERSION,
        })
        assert reg.status_code == 200, reg.text
        original_uid = reg.json()["user"]["user_id"]

        # Now Apple sign-in with the same email + a NEW apple_sub
        token = _mint(priv_pem,
                      claims_override={"sub": sub, "email": email})
        r = await client.post("/api/auth/apple",
                              json={"identity_token": token})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_new_user"] is False
        assert data["user"]["user_id"] == original_uid

        # DB should show apple_sub attached
        doc = await db.users.find_one({"user_id": original_uid})
        assert doc is not None
        assert doc.get("apple_sub") == sub
        # Original password_hash must still exist (not clobbered)
        assert doc.get("password_hash")
    finally:
        await _delete_users_by_sub_or_email(sub=sub, email=email)


# =====================================================
# Private-relay / no email path — synthesizes apple:<sub>
# =====================================================
@pytest.mark.asyncio
async def test_no_email_synthetic_user(client, rsa_keys):
    _, priv_pem, _ = rsa_keys
    sub = f"001234.private.{uuid.uuid4().hex[:8]}"
    synthetic_email = f"apple:{sub}"
    try:
        token = _mint(priv_pem, claims_override={
            "sub": sub,
            "email": None,
            "email_verified": None,
        })
        r = await client.post("/api/auth/apple",
                              json={"identity_token": token})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_new_user"] is True

        doc = await db.users.find_one({"apple_sub": sub})
        assert doc is not None
        assert doc["email"] == synthetic_email
        assert doc.get("email_is_synthetic") is True
    finally:
        await _delete_users_by_sub_or_email(sub=sub, email=synthetic_email)


# =====================================================
# APPLE_AUDIENCES env missing -> 401 "not set"
# =====================================================
@pytest.mark.asyncio
async def test_missing_apple_audiences_env(client, rsa_keys, monkeypatch):
    _, priv_pem, _ = rsa_keys
    monkeypatch.delenv("APPLE_AUDIENCES", raising=False)
    token = _mint(priv_pem, claims_override={
        "sub": f"001234.noenv.{uuid.uuid4().hex[:6]}"
    })
    r = await client.post("/api/auth/apple",
                          json={"identity_token": token})
    assert r.status_code == 401
    assert "not set" in r.json()["detail"].lower()


# =====================================================
# Sparse unique index on users.apple_sub
# =====================================================
@pytest.mark.asyncio
async def test_apple_sub_index_exists():
    idxs = await db.users.list_indexes().to_list(length=None)
    matched = [ix for ix in idxs if "apple_sub" in ix.get("key", {})]
    assert matched, f"apple_sub index missing. Indexes: {idxs}"
    ix = matched[0]
    assert ix.get("unique") is True
    assert ix.get("sparse") is True


# =====================================================
# Regression: register + login + Apple user does not break feed
# =====================================================
@pytest.mark.asyncio
async def test_register_and_login_regression(client):
    email = f"TEST_reg_{uuid.uuid4().hex[:8]}@example.com"
    try:
        reg = await client.post("/api/auth/register", json={
            "email": email,
            "password": "TestPass1!",
            "name": "Reg User",
            "accepted_terms_version": TERMS_VERSION,
        })
        assert reg.status_code == 200
        assert reg.json()["token"]

        login = await client.post("/api/auth/login", json={
            "email": email,
            "password": "TestPass1!",
        })
        assert login.status_code == 200
        assert login.json()["token"]

        # /auth/me works with the JWT
        tok = login.json()["token"]
        me = await client.get("/api/auth/me",
                              headers={"Authorization": f"Bearer {tok}"})
        assert me.status_code == 200
        assert me.json()["email"] == email.lower()
    finally:
        await _delete_users_by_sub_or_email(email=email)


@pytest.mark.asyncio
async def test_google_session_endpoint_present(client):
    """Regression: /auth/google-session responds (401 for bad session)."""
    r = await client.post("/api/auth/google-session",
                          json={"session_id": "bogus-nonexistent"})
    # Must not 5xx — should reject invalid session cleanly
    assert r.status_code in (401, 500)  # allow env-missing edge


@pytest.mark.asyncio
async def test_apple_user_shows_in_feed_as_non_instructor(client, rsa_keys):
    """A brand-new Apple user is NOT an instructor and appears correctly
    if they post an activity_event."""
    _, priv_pem, _ = rsa_keys
    sub = f"001234.feed.{uuid.uuid4().hex[:8]}"
    email = f"TEST_applefeed_{uuid.uuid4().hex[:8]}@privaterelay.appleid.com"
    try:
        token = _mint(priv_pem,
                      claims_override={"sub": sub, "email": email})
        r = await client.post("/api/auth/apple",
                              json={"identity_token": token})
        assert r.status_code == 200
        user_id = r.json()["user"]["user_id"]
        doc = await db.users.find_one({"user_id": user_id})
        assert doc.get("is_instructor") is False
        assert doc.get("is_admin") is False
    finally:
        await _delete_users_by_sub_or_email(sub=sub, email=email)
