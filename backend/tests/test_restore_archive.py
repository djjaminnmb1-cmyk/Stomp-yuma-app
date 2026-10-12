"""Restore Removed Dances archive — library dedupe + Remove (dismiss).

Archive state (restored / removed) lives in Mongo ``dance_archive_actions``
so redeploys (which reset dance_blocklist.json) can't resurrect entries.
"""
import json
import os
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or "http://localhost:8001"
API = f"{BASE_URL.rstrip('/')}/api"
ROOT = Path(__file__).resolve().parent.parent
CREDS = {"email": "admin@stompinground.com"}


def _admin_password() -> str:
    txt = (ROOT.parent / "memory" / "test_credentials.md").read_text()
    lines = txt.splitlines()
    for i, line in enumerate(lines):
        if "admin@stompinground.com" in line:
            for l2 in lines[i:i + 6]:
                if "assword" in l2 and ":" in l2:
                    return l2.split(":", 1)[1].strip().strip("`* ")
    pytest.skip("admin password not found in test_credentials.md")


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": CREDS["email"], "password": _admin_password()},
                      timeout=20)
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def mongo():
    from dotenv import load_dotenv
    from pymongo import MongoClient
    load_dotenv(ROOT / ".env")
    return MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def _archive(token):
    r = requests.get(f"{API}/dances/removed", headers=_h(token), timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def test_archive_excludes_library_dances(token, mongo):
    from services.dance_dedupe import _normalise
    lib = {_normalise(d["name"]) for d in mongo.dances.find({}, {"name": 1})}
    names = [d["name"] for d in _archive(token)]
    assert names, "archive unexpectedly empty"
    assert not [n for n in names if _normalise(n) in lib]


def test_dismiss_removes_and_persists(token, mongo):
    from services.dance_dedupe import _normalise
    target = _archive(token)[-1]["name"]
    try:
        r = requests.post(f"{API}/dances/removed/dismiss", json={"name": target},
                          headers=_h(token), timeout=20)
        assert r.status_code == 200 and r.json()["ok"] is True, r.text
        assert target not in [d["name"] for d in _archive(token)]
        doc = mongo.dance_archive_actions.find_one({"name_key": _normalise(target)})
        assert doc and doc["action"] == "removed"
        # Library untouched
        assert mongo.dances.find_one({"name": target}) is None
        # Second dismiss / restore → 404 (no longer listed)
        r2 = requests.post(f"{API}/dances/removed/dismiss", json={"name": target},
                           headers=_h(token), timeout=20)
        assert r2.status_code == 404
        r3 = requests.post(f"{API}/dances/restore-by-name", json={"name": target},
                           headers=_h(token), timeout=20)
        assert r3.status_code == 404
    finally:
        mongo.dance_archive_actions.delete_one({"name_key": _normalise(target)})
    assert target in [d["name"] for d in _archive(token)]


def test_dismiss_requires_auth_and_name(token):
    r = requests.post(f"{API}/dances/removed/dismiss", json={"name": "x"}, timeout=20)
    assert r.status_code in (401, 403)
    r = requests.post(f"{API}/dances/removed/dismiss", json={"name": ""},
                      headers=_h(token), timeout=20)
    assert r.status_code == 400
    r = requests.post(f"{API}/dances/removed/dismiss",
                      json={"name": "TEST_NotInArchive_zz"}, headers=_h(token), timeout=20)
    assert r.status_code == 404


def test_blocklist_file_not_modified(token):
    before = json.loads((ROOT / "dance_blocklist.json").read_text())
    _archive(token)
    after = json.loads((ROOT / "dance_blocklist.json").read_text())
    assert before == after
