"""App version policy + Restore-archive bulk / undo endpoints."""
import os
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or "http://localhost:8001"
API = f"{BASE_URL.rstrip('/')}/api"
ROOT = Path(__file__).resolve().parent.parent


def _admin_password() -> str:
    lines = (ROOT.parent / "memory" / "test_credentials.md").read_text().splitlines()
    for i, line in enumerate(lines):
        if "admin@stompinground.com" in line:
            for l2 in lines[i:i + 6]:
                if "assword" in l2 and ":" in l2:
                    return l2.split(":", 1)[1].strip().strip("`* ")
    pytest.skip("admin password not found")


@pytest.fixture(scope="module")
def h():
    r = requests.post(f"{API}/auth/login", json={
        "email": "admin@stompinground.com", "password": _admin_password()}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def mongo():
    from dotenv import load_dotenv
    from pymongo import MongoClient
    load_dotenv(ROOT / ".env")
    return MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


# ---------------------------------------------------------- version policy

def test_public_policy_defaults_and_store_links():
    r = requests.get(f"{API}/app/version-policy", timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert set(["min_version", "latest_version", "ios_url", "android_url"]) <= set(j)
    assert "updated_by_email" not in j
    assert j["ios_url"].startswith("https://apps.apple.com/")
    assert j["android_url"].startswith("https://play.google.com/")


def test_admin_set_policy_roundtrip_and_validation(h, mongo):
    before = mongo.app_settings.find_one({"_id": "app_version"})
    try:
        bad = [
            {"min_version": "abc"},
            {"min_version": "2.0.0", "latest_version": "1.5.0"},
            {"ios_url": "http://insecure.example.com"},
        ]
        for b in bad:
            r = requests.put(f"{API}/admin/app-version", json=b, headers=h, timeout=20)
            assert r.status_code == 400, (b, r.text)
            assert isinstance(r.json()["detail"], str)
        r = requests.put(f"{API}/admin/app-version", json={
            "min_version": "1.0.0", "latest_version": "1.1.0",
            "ios_url": "", "android_url": ""}, headers=h, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["min_version"] == "1.0.0" and j["latest_version"] == "1.1.0"
        assert j["ios_url"].endswith("id6805265437")  # blank → default
        pub = requests.get(f"{API}/app/version-policy", timeout=20).json()
        assert pub["latest_version"] == "1.1.0"
    finally:
        mongo.app_settings.delete_one({"_id": "app_version"})
        if before:
            mongo.app_settings.insert_one(before)


def test_admin_policy_requires_admin():
    assert requests.put(f"{API}/admin/app-version", json={}, timeout=20).status_code in (401, 403)
    assert requests.get(f"{API}/admin/app-version", timeout=20).status_code in (401, 403)


def test_whats_new_defaults_save_and_validation(h, mongo):
    r = requests.get(f"{API}/app/whats-new", params={"version": "1.1.0"}, timeout=20)
    assert r.status_code == 200 and len(r.json()["items"]) >= 3, r.text
    assert requests.get(f"{API}/app/whats-new", params={"version": "x"}, timeout=20).status_code == 400
    assert requests.put(f"{API}/admin/whats-new", json={"version": "9.9.9", "items": ["a"]},
                        timeout=20).status_code in (401, 403)
    before = mongo.app_settings.find_one({"_id": "whats_new"})
    try:
        r = requests.put(f"{API}/admin/whats-new",
                         json={"version": "9.9.9", "items": [" One ", "", "Two"]}, headers=h, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json() == {"version": "9.9.9", "items": ["One", "Two"]}
        g = requests.get(f"{API}/app/whats-new", params={"version": "9.9.9"}, timeout=20).json()
        assert g["items"] == ["One", "Two"]
        doc = mongo.app_settings.find_one({"_id": "whats_new"})
        assert doc["notes"]["9_9_9"] == ["One", "Two"]  # dots never become nested keys
        too_many = requests.put(f"{API}/admin/whats-new",
                                json={"version": "9.9.9", "items": ["x"] * 13}, headers=h, timeout=20)
        assert too_many.status_code == 400
    finally:
        mongo.app_settings.delete_one({"_id": "whats_new"})
        if before:
            mongo.app_settings.insert_one(before)


# ------------------------------------------------------- archive bulk/undo

def _archive(h):
    r = requests.get(f"{API}/dances/removed", headers=h, timeout=20)
    assert r.status_code == 200
    return [d["name"] for d in r.json()]


def test_bulk_remove_then_undo(h, mongo):
    from services.dance_dedupe import _normalise
    names = _archive(h)[-3:]
    keys = [_normalise(n) for n in names]
    try:
        r = requests.post(f"{API}/dances/removed/dismiss-bulk",
                          json={"names": names + ["TEST_not_archived_zz"]}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert sorted(j["removed"]) == sorted(names)
        assert j["skipped"] == ["TEST_not_archived_zz"]
        left = _archive(h)
        assert not set(names) & set(left)
        u = requests.post(f"{API}/dances/removed/undo", json={"names": names}, headers=h, timeout=20)
        assert u.status_code == 200 and u.json()["undone"] == 3
        assert set(names) <= set(_archive(h))
    finally:
        mongo.dance_archive_actions.delete_many({"name_key": {"$in": keys}})


def test_bulk_restore_and_undo_does_not_touch_restores(h, mongo):
    from services.dance_dedupe import _normalise
    names = _archive(h)[-2:]
    keys = [_normalise(n) for n in names]
    try:
        r = requests.post(f"{API}/dances/restore-bulk", json={"names": names}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert sorted(r.json()["restored"]) == sorted(names)
        assert mongo.dances.count_documents({"name": {"$in": names}}) == 2
        # Undo only affects "removed" decisions
        u = requests.post(f"{API}/dances/removed/undo", json={"names": names}, headers=h, timeout=20)
        assert u.json()["undone"] == 0
        # Re-restoring is skipped (no longer in archive)
        r2 = requests.post(f"{API}/dances/restore-bulk", json={"names": names}, headers=h, timeout=30)
        assert r2.json()["restored"] == [] and sorted(r2.json()["skipped"]) == sorted(names)
    finally:
        mongo.dances.delete_many({"name": {"$in": names}, "step_sheet": ""})
        mongo.dance_archive_actions.delete_many({"name_key": {"$in": keys}})


def test_bulk_validation(h):
    for body in ({}, {"names": []}, {"names": "x"}, {"names": ["a"] * 501}):
        r = requests.post(f"{API}/dances/removed/dismiss-bulk", json=body, headers=h, timeout=20)
        assert r.status_code == 400, body
    assert requests.post(f"{API}/dances/removed/undo", json={"names": ["x"]},
                         timeout=20).status_code in (401, 403)
