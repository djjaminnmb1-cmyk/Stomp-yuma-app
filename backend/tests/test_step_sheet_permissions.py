"""Step sheet edit permission tests.

Whitelist STEP_SHEET_EDITOR_EMAILS = erinboroughs@gmail.com, luvtowork247@yahoo.com.
Only whitelisted users may set/modify step_sheet or step_sheet_image on any dance.
Admin has NO backdoor. Non-editors get step sheet fields silently blanked on
POST /api/dances and POST /api/dances/import.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"

JAMIN_EMAIL = "luvtowork247@yahoo.com"
JAMIN_PASS = "BootsDance49!"
ADMIN_EMAIL = "admin@stompinground.com"
ADMIN_PASS = "Admin123!"
INSTRUCTOR_CODE = "lineup4life"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(s, email, password):
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    j = r.json()
    return j["token"], j["user"]


@pytest.fixture(scope="session")
def jamin(s):
    return _login(s, JAMIN_EMAIL, JAMIN_PASS)


@pytest.fixture(scope="session")
def admin(s):
    return _login(s, ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="session")
def self_serve_instructor(s):
    """Register a brand new self-serve instructor with instructor_code."""
    email = f"TEST_ss_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": "Pass123!",
            "name": "TEST SS Instructor",
            "instructor_code": INSTRUCTOR_CODE,
        },
    )
    assert r.status_code == 200, f"register self-serve failed: {r.text}"
    j = r.json()
    return j["token"], j["user"]


# ---------------- /auth/me flags ----------------
def test_me_jamin_can_edit_step_sheets(s, jamin):
    token, _ = jamin
    r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    u = r.json()
    assert u["email"].lower() == JAMIN_EMAIL
    assert u["can_edit_step_sheets"] is True, u


def test_me_admin_cannot_edit_step_sheets(s, admin):
    token, _ = admin
    r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    u = r.json()
    assert u["is_admin"] is True
    assert u["can_edit_step_sheets"] is False, u


def test_me_self_serve_instructor_cannot_edit_step_sheets(s, self_serve_instructor):
    token, user = self_serve_instructor
    assert user["is_instructor"] is True
    r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    u = r.json()
    assert u["is_instructor"] is True
    assert u["can_edit_step_sheets"] is False, u


# ---------------- PUT /api/dances/{id} step_sheet edits ----------------
@pytest.fixture(scope="session")
def target_dance(s):
    """Pick an arbitrary dance to test edits against."""
    r = s.get(f"{API}/dances")
    assert r.status_code == 200
    data = r.json()
    assert len(data) > 0
    return data[0]


def _payload_from_dance(d, **overrides):
    p = {
        "name": d.get("name") or "TEST",
        "choreographer": d.get("choreographer", ""),
        "choreographer_country": d.get("choreographer_country", ""),
        "song": d.get("song", ""),
        "artist": d.get("artist", ""),
        "difficulty": d.get("difficulty", "Beginner"),
        "bpm": d.get("bpm"),
        "count": d.get("count", ""),
        "youtube_url": d.get("youtube_url", ""),
        "step_sheet": d.get("step_sheet", ""),
        "step_sheet_image": d.get("step_sheet_image", ""),
        "description": d.get("description", ""),
        "tags": d.get("tags", []),
        "is_published": d.get("is_published", True),
    }
    p.update(overrides)
    return p


def test_jamin_can_edit_step_sheet(s, jamin, target_dance):
    token, _ = jamin
    fresh = s.get(f"{API}/dances/{target_dance['id']}").json()
    prev_ss = fresh.get("step_sheet", "") or ""
    new_ss = f"JAMIN_TEST_{uuid.uuid4().hex[:6]}\n{prev_ss}"
    payload = _payload_from_dance(fresh, step_sheet=new_ss)
    r = s.put(
        f"{API}/dances/{fresh['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert r.status_code == 200, r.text
    assert r.json()["step_sheet"] == new_ss

    # verify persistence via GET
    r2 = s.get(f"{API}/dances/{fresh['id']}")
    assert r2.json()["step_sheet"] == new_ss

    # restore
    restore = _payload_from_dance(fresh, step_sheet=prev_ss)
    r3 = s.put(
        f"{API}/dances/{fresh['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json=restore,
    )
    assert r3.status_code == 200


def test_admin_cannot_edit_step_sheet_403(s, admin, target_dance):
    token, _ = admin
    fresh = s.get(f"{API}/dances/{target_dance['id']}").json()
    prev_ss = fresh.get("step_sheet", "") or ""
    payload = _payload_from_dance(
        fresh, step_sheet=(prev_ss + "ADMIN_HACK_ATTEMPT")
    )
    r = s.put(
        f"{API}/dances/{fresh['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert r.status_code == 403, r.text
    body = r.text
    assert "Only Erin or Jamin" in body, body

    # DB unchanged
    r2 = s.get(f"{API}/dances/{fresh['id']}")
    assert r2.json().get("step_sheet", "") == prev_ss


def test_self_serve_instructor_cannot_edit_step_sheet_403(
    s, self_serve_instructor, target_dance
):
    token, _ = self_serve_instructor
    fresh = s.get(f"{API}/dances/{target_dance['id']}").json()
    prev_ss = fresh.get("step_sheet", "") or ""
    payload = _payload_from_dance(fresh, step_sheet=prev_ss + "SS_ATTEMPT")
    r = s.put(
        f"{API}/dances/{fresh['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert r.status_code == 403, r.text
    assert "Only Erin or Jamin" in r.text

    r2 = s.get(f"{API}/dances/{fresh['id']}")
    assert r2.json().get("step_sheet", "") == prev_ss


def test_admin_can_edit_non_step_sheet_fields(s, admin, target_dance):
    """Admin should be able to edit other metadata as long as step_sheet is unchanged."""
    token, _ = admin
    fresh = s.get(f"{API}/dances/{target_dance['id']}").json()
    prev_desc = fresh.get("description", "") or ""
    new_desc = f"TEST_ADMIN_DESC_{uuid.uuid4().hex[:6]}"
    payload = _payload_from_dance(fresh, description=new_desc)
    r = s.put(
        f"{API}/dances/{fresh['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert r.status_code == 200, r.text
    assert r.json()["description"] == new_desc
    # restore
    restore = _payload_from_dance(fresh, description=prev_desc)
    s.put(
        f"{API}/dances/{fresh['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json=restore,
    )


def test_self_serve_instructor_metadata_edit_forbidden_when_not_owner(
    s, self_serve_instructor, target_dance
):
    """Self-serve instructor does not own the seeded dance → 403 when trying to edit
    even other-fields (owner OR admin OR whitelist required)."""
    token, _ = self_serve_instructor
    fresh = s.get(f"{API}/dances/{target_dance['id']}").json()
    payload = _payload_from_dance(
        fresh, description=f"TEST_SS_DESC_{uuid.uuid4().hex[:6]}"
    )
    r = s.put(
        f"{API}/dances/{fresh['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert r.status_code == 403, r.text


# ---------------- POST /api/dances (create) ----------------
def test_create_dance_non_editor_strips_step_sheet(s, self_serve_instructor):
    token, _ = self_serve_instructor
    name = f"TEST_Create_{uuid.uuid4().hex[:6]}"
    payload = {
        "name": name,
        "choreographer": "Tester",
        "song": "TSong",
        "artist": "TArtist",
        "difficulty": "Beginner",
        "step_sheet": "SHOULD_BE_STRIPPED",
        "step_sheet_image": "data:image/png;base64,AAAA",
    }
    r = s.post(
        f"{API}/dances", headers={"Authorization": f"Bearer {token}"}, json=payload
    )
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["name"] == name
    assert created["step_sheet"] == "", created
    assert created["step_sheet_image"] == "", created

    # verify via GET
    r2 = s.get(f"{API}/dances/{created['id']}")
    assert r2.status_code == 200
    got = r2.json()
    assert got["step_sheet"] == ""
    assert got["step_sheet_image"] == ""

    # cleanup: admin can delete
    admin_token, _ = _login(s, ADMIN_EMAIL, ADMIN_PASS)
    s.delete(
        f"{API}/dances/{created['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )


def test_create_dance_editor_keeps_step_sheet(s, jamin):
    token, _ = jamin
    name = f"TEST_JaminCreate_{uuid.uuid4().hex[:6]}"
    payload = {
        "name": name,
        "choreographer": "Tester",
        "song": "TSong",
        "artist": "TArtist",
        "difficulty": "Beginner",
        "step_sheet": "SHEET_CONTENT_OK",
    }
    r = s.post(
        f"{API}/dances", headers={"Authorization": f"Bearer {token}"}, json=payload
    )
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["step_sheet"] == "SHEET_CONTENT_OK"
    # cleanup
    admin_token, _ = _login(s, ADMIN_EMAIL, ADMIN_PASS)
    s.delete(
        f"{API}/dances/{created['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )


# ---------------- POST /api/dances/import ----------------
def test_import_non_editor_blanks_step_sheet(s, self_serve_instructor):
    token, _ = self_serve_instructor
    name = f"TEST_Import_{uuid.uuid4().hex[:6]}"
    body = {
        "publish_all": False,
        "dances": [
            {
                "name": name,
                "choreographer": "Chor",
                "song": "S",
                "artist": "A",
                "difficulty": "Beginner",
                "step_sheet": "SHOULD_BE_BLANKED_ON_IMPORT",
            }
        ],
    }
    r = s.post(
        f"{API}/dances/import",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
    )
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 1

    # find by search — imported dances default to is_published=publish_all(False),
    # so use scope=mine as the importer.
    r2 = s.get(
        f"{API}/dances",
        params={"q": name, "scope": "mine"},
        headers={"Authorization": f"Bearer {token}"},
    )
    matches = [d for d in r2.json() if d["name"] == name]
    assert len(matches) == 1, r2.text
    m = matches[0]
    assert m["step_sheet"] == ""
    assert m["step_sheet_image"] == ""
    assert m["choreographer"] == "Chor"
    assert m["song"] == "S"

    # cleanup
    admin_token, _ = _login(s, ADMIN_EMAIL, ADMIN_PASS)
    s.delete(
        f"{API}/dances/{m['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
