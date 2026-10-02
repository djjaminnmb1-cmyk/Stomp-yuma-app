"""End-to-end backend tests for the Events feature.

Covers: /api/events/search, /api/events/types, create/get/update/delete
lifecycle, auth-gating, and geocoding for real vs. garbled addresses.
"""
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

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
    os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")


# ----------------- Fixtures -----------------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api, email, password):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token(api):
    return _login(api, "erinboroughs@gmail.com", ERIN_PASSWORD)


@pytest.fixture(scope="session")
def instructor_token(api):
    return _login(api, "luvtowork247@yahoo.com", JAMIN_PASSWORD)


@pytest.fixture(scope="session")
def regular_token(api):
    # Register a fresh regular user
    email = f"TEST_regular_{uuid.uuid4().hex[:8]}@example.com"
    r = api.post(f"{BASE_URL}/api/auth/register", json={
        "name": "TEST Regular",
        "email": email,
        "password": "TestPass123!",
        "is_instructor": False,
    })
    assert r.status_code in (200, 201), r.text[:200]
    data = r.json()
    return data.get("token") or _login(api, email, "TestPass123!")


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ----------------- /events/types -----------------
class TestEventTypes:
    def test_types_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/events/types")
        assert r.status_code in (401, 403), r.status_code

    def test_types_returns_enums(self, api, instructor_token):
        r = api.get(f"{BASE_URL}/api/events/types", headers=_h(instructor_token))
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert isinstance(d.get("types"), list) and d["types"], d
        assert isinstance(d.get("skill_levels"), list) and d["skill_levels"], d


# ----------------- /events/search -----------------
class TestEventSearch:
    def test_search_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/events/search")
        assert r.status_code in (401, 403)

    def test_search_default(self, api, instructor_token):
        r = api.get(f"{BASE_URL}/api/events/search",
                    headers=_h(instructor_token))
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert "events" in d and "classes" in d and "count" in d
        assert isinstance(d["events"], list)
        assert isinstance(d["classes"], list)

    def test_search_filters(self, api, instructor_token):
        params = {
            "q": "dance",
            "type": "workshop,social",
            "level": "Improver",
            "date_from": "2024-01-01",
            "date_to": "2030-01-01",
            "include_classes": "false",
            "limit": 10,
        }
        r = api.get(f"{BASE_URL}/api/events/search", params=params,
                    headers=_h(instructor_token))
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        # include_classes=false -> classes list should be empty
        assert d["classes"] == [], d["classes"]

    def test_search_near(self, api, instructor_token):
        params = {
            "near_lat": 32.7253,
            "near_lng": -114.6236,  # Yuma
            "radius_miles": 100,
        }
        r = api.get(f"{BASE_URL}/api/events/search", params=params,
                    headers=_h(instructor_token))
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert "events" in d


# ----------------- Create / Read / Update / Delete lifecycle -----------------
class TestEventLifecycle:
    created_id = None

    def _payload(self, name_suffix="", address="1234 Main St", city="Yuma"):
        return {
            "name": f"TEST Event {name_suffix or uuid.uuid4().hex[:6]}",
            "description": "Test description",
            "event_type": "workshop",
            "skill_level": "Improver",
            "date": "2026-09-14",
            "start_time": "19:30",
            "end_time": "21:30",
            "venue_name": "Test Venue",
            "address": address,
            "city": city,
            "state": "AZ",
            "zip_code": "85364",
            "country": "US",
            "price": "$15",
            "registration_url": "https://example.com/register",
            "is_published": True,
        }

    def test_regular_user_cannot_create(self, api, regular_token):
        r = api.post(f"{BASE_URL}/api/events",
                     json=self._payload(), headers=_h(regular_token))
        assert r.status_code == 403, r.status_code

    def test_create_missing_fields(self, api, instructor_token):
        p = self._payload()
        p["name"] = ""
        r = api.post(f"{BASE_URL}/api/events", json=p, headers=_h(instructor_token))
        assert r.status_code == 400, r.status_code

    def test_create_with_real_address(self, api, instructor_token):
        p = self._payload(name_suffix="real", address="1600 Amphitheatre Parkway",
                          city="Mountain View")
        p["state"] = "CA"
        p["zip_code"] = "94043"
        r = api.post(f"{BASE_URL}/api/events", json=p, headers=_h(instructor_token))
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["id"].startswith("evt_"), d
        assert d["name"] == p["name"]
        # Nominatim may be slow / rate-limited; log a warning if lat/lng missing.
        if d.get("lat") is None:
            print(f"WARN: geocoding did not return lat/lng for real address: {d}")
        TestEventLifecycle.created_id = d["id"]

        # GET verifies persistence
        g = api.get(f"{BASE_URL}/api/events/{d['id']}", headers=_h(instructor_token))
        assert g.status_code == 200, g.text[:200]
        gd = g.json()
        assert gd["id"] == d["id"]
        assert gd["name"] == p["name"]
        assert "instructor_name" in gd

    def test_create_with_garbled_address(self, api, instructor_token):
        p = self._payload(name_suffix="garble",
                          address="qwzxpqz nonexistent 99999",
                          city="Zzzzznoplace")
        r = api.post(f"{BASE_URL}/api/events", json=p, headers=_h(instructor_token))
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        # Event still saves, lat/lng null
        assert d["id"]
        assert d["lat"] is None and d["lng"] is None, (d["lat"], d["lng"])

        # cleanup
        api.delete(f"{BASE_URL}/api/events/{d['id']}", headers=_h(instructor_token))

    def test_non_owner_cannot_edit(self, api, admin_token, instructor_token):
        # Create as admin, try to edit as instructor
        p = self._payload(name_suffix="admin_owned")
        r = api.post(f"{BASE_URL}/api/events", json=p, headers=_h(admin_token))
        assert r.status_code == 200
        eid = r.json()["id"]
        try:
            edit = self._payload(name_suffix="hijack")
            r2 = api.patch(f"{BASE_URL}/api/events/{eid}",
                           json=edit, headers=_h(instructor_token))
            assert r2.status_code == 403, r2.status_code
        finally:
            api.delete(f"{BASE_URL}/api/events/{eid}", headers=_h(admin_token))

    def test_admin_can_edit_any(self, api, admin_token, instructor_token):
        # Instructor owns, admin edits
        p = self._payload(name_suffix="instr_owned")
        r = api.post(f"{BASE_URL}/api/events", json=p, headers=_h(instructor_token))
        assert r.status_code == 200
        eid = r.json()["id"]
        try:
            edit = self._payload(name_suffix="admin_edit")
            edit["description"] = "edited-by-admin"
            r2 = api.patch(f"{BASE_URL}/api/events/{eid}",
                           json=edit, headers=_h(admin_token))
            assert r2.status_code == 200, r2.text[:200]
            assert r2.json()["description"] == "edited-by-admin"
        finally:
            api.delete(f"{BASE_URL}/api/events/{eid}", headers=_h(admin_token))

    def test_owner_can_update_and_delete(self, api, instructor_token):
        eid = TestEventLifecycle.created_id
        assert eid, "prior create failed"
        edit = self._payload(name_suffix="owner_edit",
                             address="1600 Amphitheatre Parkway",
                             city="Mountain View")
        edit["state"] = "CA"
        edit["zip_code"] = "94043"
        edit["description"] = "updated-desc"
        r = api.patch(f"{BASE_URL}/api/events/{eid}",
                      json=edit, headers=_h(instructor_token))
        assert r.status_code == 200, r.text[:200]
        assert r.json()["description"] == "updated-desc"

        # Non-owner cannot delete
        r2 = api.delete(f"{BASE_URL}/api/events/{eid}", headers=_h(instructor_token))
        # instructor here IS the owner; check delete succeeds
        assert r2.status_code == 200, r2.text[:200]

        # GET returns 404 after delete
        g = api.get(f"{BASE_URL}/api/events/{eid}", headers=_h(instructor_token))
        assert g.status_code == 404


# ----------------- Regular user search access -----------------
class TestSearchRegularUser:
    def test_regular_can_search(self, api, regular_token):
        r = api.get(f"{BASE_URL}/api/events/search", headers=_h(regular_token))
        assert r.status_code == 200, r.text[:200]
