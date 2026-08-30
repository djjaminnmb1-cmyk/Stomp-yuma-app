"""BootStepper integration tests — mirrors CopperKnob behaviour with a
separate ref field. Also regression checks the CopperKnob endpoints and
the sticky-ref guard in PUT /api/dances/{id}.
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://stompin-yuma-app.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "erinboroughs@gmail.com"
ADMIN_PW = "Stompin2026!"

# Known BootStepper dance IDs (per task spec)
BS_COPPERHEAD_ID = "D36J5744FRQ364N"
BS_ANAK_ID = "D36J5997K393GN7"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin_token() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PW},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed ({r.status_code}): {r.text[:200]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def user_token() -> str:
    # Register a fresh regular user for this session
    email = f"TEST_bs_{uuid.uuid4().hex[:8]}@example.com"
    pw = "TestPass123!"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": pw, "name": "TEST BS User"},
        timeout=15,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"Register regular user failed: {r.status_code} {r.text[:200]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def h_admin(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def h_user(user_token):
    return {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}


# ---------- Auth guards ----------

class TestBootStepperAuth:
    def test_search_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/bootstepper/search?q=Copperhead&limit=5", timeout=15)
        assert r.status_code == 401, r.text

    def test_popular_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/bootstepper/popular?limit=5", timeout=15)
        assert r.status_code == 401, r.text

    def test_get_by_id_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/bootstepper/dances/{BS_COPPERHEAD_ID}", timeout=15)
        assert r.status_code == 401, r.text


# ---------- Read endpoints ----------

class TestBootStepperReads:
    def test_search_returns_normalised_items(self, h_user):
        r = requests.get(
            f"{BASE_URL}/api/bootstepper/search",
            params={"q": "Copperhead", "limit": 5},
            headers=h_user,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "data" in body and isinstance(body["data"], list)
        assert "attribution" in body
        assert body["attribution"].get("provider") == "BootStepper"
        # Sanity check normalised fields on the first item (if any)
        if body["data"]:
            it = body["data"][0]
            for key in ("id", "title", "choreographer", "url", "count", "wall", "level"):
                assert key in it, f"missing field {key}"
            # video_count key present per spec (aliased as video_count in normaliser)
            assert "video_count" in it

    def test_popular_returns_items(self, h_user):
        r = requests.get(
            f"{BASE_URL}/api/bootstepper/popular",
            params={"limit": 10},
            headers=h_user,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body.get("data"), list)
        assert body.get("attribution", {}).get("provider") == "BootStepper"

    def test_get_by_id_returns_single_dance(self, h_user):
        r = requests.get(
            f"{BASE_URL}/api/bootstepper/dances/{BS_COPPERHEAD_ID}",
            headers=h_user,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "data" in body
        assert body["data"].get("id") == BS_COPPERHEAD_ID
        assert "existing_dance" in body  # may be None
        assert body.get("attribution", {}).get("provider") == "BootStepper"


# ---------- Admin write flows ----------

class TestBootStepperAdminWrites:
    """Import + Link flows. Cleans up created dances at teardown."""

    _created_ids: list[str] = []

    @classmethod
    def teardown_class(cls):
        # Best-effort cleanup: log in admin and delete created test dances
        try:
            tok = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PW},
                timeout=10,
            ).json().get("token")
            if not tok:
                return
            for did in cls._created_ids:
                requests.delete(
                    f"{BASE_URL}/api/dances/{did}",
                    headers={"Authorization": f"Bearer {tok}"},
                    timeout=10,
                )
        except Exception:
            pass

    def test_from_bootstepper_non_admin_403(self, h_user):
        r = requests.post(
            f"{BASE_URL}/api/dances/from-bootstepper",
            headers=h_user,
            json={"id": BS_COPPERHEAD_ID},
            timeout=30,
        )
        assert r.status_code == 403, r.text

    def test_from_bootstepper_creates_dance(self, h_admin):
        # Preflight: check whether the id already exists in library (from prior run)
        pre = requests.get(
            f"{BASE_URL}/api/bootstepper/dances/{BS_ANAK_ID}",
            headers=h_admin,
            timeout=30,
        ).json()
        if pre.get("existing_dance"):
            # Delete it first so we can test a clean create
            existing = pre["existing_dance"]["id"]
            requests.delete(f"{BASE_URL}/api/dances/{existing}", headers=h_admin, timeout=15)

        r = requests.post(
            f"{BASE_URL}/api/dances/from-bootstepper",
            headers=h_admin,
            json={"id": BS_ANAK_ID, "is_published": False},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        dance = r.json().get("dance", {})
        assert dance.get("id", "").startswith("dance_")
        assert dance.get("bootstepper_ref") == BS_ANAK_ID
        assert "bootstepper.com/dances/" in (dance.get("bootstepper_url") or "")
        # CopperKnob fields NOT populated
        assert not dance.get("copperknob_ref")
        assert not dance.get("copperknob_url")
        # count/difficulty mapped
        assert dance.get("difficulty")
        type(self)._created_ids.append(dance["id"])

    def test_from_bootstepper_duplicate_returns_409(self, h_admin):
        r = requests.post(
            f"{BASE_URL}/api/dances/from-bootstepper",
            headers=h_admin,
            json={"id": BS_ANAK_ID},
            timeout=30,
        )
        assert r.status_code == 409, r.text
        detail = r.json().get("detail", {})
        assert detail.get("error") == "already_exists"
        assert "existing_dance_id" in detail

    def test_link_bootstepper_preserves_copperknob_ref(self, h_admin):
        """Create a dance with a FAKE copperknob_ref, then link a BootStepper id.
        Verify the copperknob_ref survives.
        """
        # Create a dance carrying a copperknob_ref
        payload = {
            "name": f"TEST BS Link {uuid.uuid4().hex[:6]}",
            "choreographer": "Test Choreo",
            "difficulty": "Improver",
            "count": "32 count, 4 wall",
            "song": "Test Song",
            "artist": "Test Artist",
            "youtube_url": "https://youtube.com/",
            "copperknob_ref": "FAKE123",
            "copperknob_url": "https://www.copperknob.co.uk/dances/FAKE123",
            "is_published": False,
        }
        create = requests.post(
            f"{BASE_URL}/api/dances", headers=h_admin, json=payload, timeout=15
        )
        assert create.status_code == 200, create.text
        dance_id = create.json()["id"]
        type(self)._created_ids.append(dance_id)

        # Link a BootStepper id (use Copperhead)
        link = requests.post(
            f"{BASE_URL}/api/dances/{dance_id}/link-bootstepper",
            headers=h_admin,
            json={"id": BS_COPPERHEAD_ID, "overwrite_url": True},
            timeout=30,
        )
        assert link.status_code == 200, link.text
        d = link.json()["dance"]
        assert d.get("bootstepper_ref") == BS_COPPERHEAD_ID
        assert "bootstepper.com/dances/" in (d.get("bootstepper_url") or "")
        # CopperKnob fields UNTOUCHED
        assert d.get("copperknob_ref") == "FAKE123", f"copperknob_ref wiped: {d}"
        assert d.get("copperknob_url") == "https://www.copperknob.co.uk/dances/FAKE123"

    def test_put_dance_preserves_both_refs(self, h_admin):
        """After link+edit, PUT without refs must preserve BOTH refs (sticky guard)."""
        # Fetch a dance we just linked (last created)
        assert self._created_ids
        dance_id = self._created_ids[-1]
        # Edit with a PUT that DOES NOT include copperknob_ref / bootstepper_ref
        edit_payload = {
            "name": f"TEST BS Edit {uuid.uuid4().hex[:6]}",
            "choreographer": "Test Choreo",
            "difficulty": "Improver",
            "count": "32 count, 4 wall",
            "song": "Test Song 2",
            "artist": "Test Artist",
            "youtube_url": "https://youtube.com/",
            "is_published": False,
        }
        r = requests.put(
            f"{BASE_URL}/api/dances/{dance_id}",
            headers=h_admin,
            json=edit_payload,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # Now GET and verify refs still there
        g = requests.get(f"{BASE_URL}/api/dances/{dance_id}", headers=h_admin, timeout=10)
        assert g.status_code == 200
        d = g.json()
        assert d.get("copperknob_ref") == "FAKE123", f"CK ref lost after PUT: {d}"
        assert d.get("bootstepper_ref") == BS_COPPERHEAD_ID, f"BS ref lost after PUT: {d}"

    def test_bootstepper_compare(self, h_admin):
        """After linking, bootstepper-compare returns fields + differs_count."""
        assert self._created_ids
        dance_id = self._created_ids[-1]
        r = requests.get(
            f"{BASE_URL}/api/dances/{dance_id}/bootstepper-compare",
            headers=h_admin,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("dance_id") == dance_id
        assert isinstance(body.get("fields"), list) and len(body["fields"]) >= 5
        assert "differs_count" in body
        for f in body["fields"]:
            assert set(("field", "ours", "bootstepper", "differs")).issubset(f.keys())

    def test_link_non_admin_403(self, h_user):
        r = requests.post(
            f"{BASE_URL}/api/dances/nonexistent/link-bootstepper",
            headers=h_user,
            json={"id": BS_COPPERHEAD_ID},
            timeout=15,
        )
        assert r.status_code == 403, r.text

    def test_compare_non_admin_403(self, h_user):
        r = requests.get(
            f"{BASE_URL}/api/dances/nonexistent/bootstepper-compare",
            headers=h_user,
            timeout=15,
        )
        assert r.status_code == 403, r.text


# ---------- CopperKnob regression ----------

class TestCopperKnobRegression:
    def test_ck_search_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/copperknob/search?q=Copperhead&limit=3", timeout=15)
        assert r.status_code == 401

    def test_ck_search_works(self, h_user):
        r = requests.get(
            f"{BASE_URL}/api/copperknob/search",
            params={"q": "Copperhead", "limit": 3},
            headers=h_user,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "data" in body
        assert body.get("attribution", {}).get("provider") == "CopperKnob"

    def test_ck_popular_works(self, h_user):
        r = requests.get(
            f"{BASE_URL}/api/copperknob/popular",
            params={"limit": 3},
            headers=h_user,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "data" in body
