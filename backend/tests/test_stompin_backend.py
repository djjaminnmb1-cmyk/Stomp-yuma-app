"""Stompin' Ground Yuma - Backend API tests."""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://stompin-yuma-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
ADMIN_EMAIL = "admin@stompinground.com"
ADMIN_PASS = "Admin123!"


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
    assert len(data) >= 40
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


def test_register_duplicate(s):
    email = f"TEST_dup_{uuid.uuid4().hex[:8]}@example.com"
    r1 = s.post(f"{API}/auth/register", json={"email": email, "password": "Pass123!", "name": "Dup"})
    assert r1.status_code == 200
    r2 = s.post(f"{API}/auth/register", json={"email": email, "password": "Pass123!", "name": "Dup"})
    assert r2.status_code == 400


def test_login_bad_creds(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
    assert r.status_code == 401


def test_admin_login(admin_token):
    assert isinstance(admin_token, str) and len(admin_token) > 10


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


def test_admin_can_create_dance(s, admin_token):
    payload = {
        "name": f"TEST_Dance_{uuid.uuid4().hex[:6]}",
        "choreographer": "TEST Chor",
        "song": "TEST Song",
        "artist": "TEST Artist",
        "difficulty": "Improver",
        "bpm": 120,
        "count": "32 count, 4 wall",
        "youtube_url": "https://youtube.com/watch",
        "description": "test",
        "tags": ["test"],
    }
    r = s.post(f"{API}/dances", headers={"Authorization": f"Bearer {admin_token}"}, json=payload)
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["name"] == payload["name"]
    # Verify persistence
    r2 = s.get(f"{API}/dances/{created['id']}")
    assert r2.status_code == 200
    # Cleanup
    s.delete(f"{API}/dances/{created['id']}", headers={"Authorization": f"Bearer {admin_token}"})


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

    # Update to completed with rating and notes
    r = s.post(f"{API}/tracking/{dance_id}", headers=hdr,
               json={"status": "completed", "rating": 4, "notes": "fun!"})
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "completed"
    assert j["rating"] == 4
    assert j["notes"] == "fun!"

    # List and verify persistence
    r = s.get(f"{API}/tracking/me", headers=hdr)
    assert r.status_code == 200
    items = r.json()
    match = [t for t in items if t["dance_id"] == dance_id]
    assert len(match) == 1 and match[0]["rating"] == 4 and match[0]["status"] == "completed"

    # Invalid status
    r = s.post(f"{API}/tracking/{dance_id}", headers=hdr,
               json={"status": "bogus", "rating": 0})
    assert r.status_code == 400

    # Non-existent dance
    r = s.post(f"{API}/tracking/nonexistent", headers=hdr,
               json={"status": "wishlist", "rating": 0})
    assert r.status_code == 404

    # Delete
    r = s.delete(f"{API}/tracking/{dance_id}", headers=hdr)
    assert r.status_code == 200
    r = s.get(f"{API}/tracking/me", headers=hdr)
    assert not any(t["dance_id"] == dance_id for t in r.json())


def test_tracking_requires_auth(s):
    r = s.get(f"{API}/tracking/me")
    assert r.status_code == 401


def test_google_session_endpoint_exists(s):
    # Should reject with 401 (invalid session), not 404
    r = s.post(f"{API}/auth/google-session", json={"session_id": "invalid_test_session"})
    assert r.status_code in (401, 400)
