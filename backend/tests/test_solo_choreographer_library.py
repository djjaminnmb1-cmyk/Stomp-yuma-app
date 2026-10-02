"""Backend tests for the SOLO CHOREOGRAPHER LIBRARY feature (Jan 2026).

Covers:
- ``services.choreographer_follows.split_choreographers`` edge cases
- ``services.choreographer_follows.parse_main_and_co`` behaviour
- ``services.bootstepper._normalise`` preserves multi-name roster
- POST /api/dances auto-splits multi-name credit strings
- PUT /api/dances/{id} re-splits when the choreographer string changes
- GET /api/dances/{id} always returns ``co_choreographers`` array
- GET /api/dances?q=X matches on co_choreographers array
- GET /api/choreographers?q=... groups by MAIN choreographer only
  (co-only person MUST NOT appear in the library)
- GET /api/co-choreographers/{name}/dances requires auth, matches
  case-insensitively, newest first, includes dances where the
  person is main OR co-choreographer.

Test data is created via /api/dances (auth-required) and DELETED
in a class-level teardown fixture so we never mutate production
library dances.
"""
from __future__ import annotations

import os
import sys
import time

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

# Make backend modules importable for unit-level tests
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://stompin-yuma-app.preview.emergentagent.com",
).rstrip("/")

ADMIN_EMAIL = "admin@stompinground.com"
ADMIN_PASS = ADMIN_PASSWORD

TEST_PREFIX = f"TEST_SOLO_{int(time.time())}_"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    tok = r.json().get("token")
    assert tok, "No token in login response"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _make_dance(api, headers, name, choreographer, publish=True, **extra):
    body = {
        "name": name,
        "choreographer": choreographer,
        "song": "TEST_song",
        "artist": "TEST_artist",
        "difficulty": "Beginner",
        "is_published": publish,
        **extra,
    }
    r = api.post(f"{BASE_URL}/api/dances", json=body, headers=headers)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text[:200]}"
    return r.json()


@pytest.fixture(scope="module")
def seeded_dances(api, auth_headers):
    """Create a small test corpus with a shared co-choreographer.

    All three dances have a co-choreographer of "TEST_CoBob" (or main
    Bob variant on d3) so we can verify the co-choreographer endpoint
    returns dances where the person appears as either main or co.
    """
    created = []
    # d1: multi-name credit that auto-splits
    d1 = _make_dance(
        api, auth_headers,
        f"{TEST_PREFIX}Dance1",
        f"{TEST_PREFIX}Alice & {TEST_PREFIX}CoBob",
    )
    created.append(d1)
    # d2: three-way split with slash
    d2 = _make_dance(
        api, auth_headers,
        f"{TEST_PREFIX}Dance2",
        f"{TEST_PREFIX}Carol / {TEST_PREFIX}CoBob / {TEST_PREFIX}Dave",
    )
    created.append(d2)
    # d3: CoBob is the MAIN choreographer here (so the co-endpoint
    # should include this dance too).
    d3 = _make_dance(
        api, auth_headers,
        f"{TEST_PREFIX}Dance3",
        f"{TEST_PREFIX}CoBob",
    )
    created.append(d3)

    yield created

    # Cleanup — delete every test dance we created.
    for d in created:
        did = d.get("id")
        if did:
            try:
                api.delete(f"{BASE_URL}/api/dances/{did}", headers=auth_headers)
            except Exception:
                pass


# ---------------- Unit tests (import directly) ----------------
class TestSplitChoreographers:
    """Pure-function tests for the parser — no DB needed."""

    def test_ampersand(self):
        from services.choreographer_follows import split_choreographers
        assert split_choreographers("Alice & Bob") == ["Alice", "Bob"]

    def test_slash(self):
        from services.choreographer_follows import split_choreographers
        assert split_choreographers("Alice / Bob") == ["Alice", "Bob"]

    def test_comma(self):
        from services.choreographer_follows import split_choreographers
        assert split_choreographers("Alice, Bob, Carol") == ["Alice", "Bob", "Carol"]

    def test_semicolon(self):
        from services.choreographer_follows import split_choreographers
        assert split_choreographers("Alice; Bob") == ["Alice", "Bob"]

    def test_and_word(self):
        from services.choreographer_follows import split_choreographers
        assert split_choreographers("Alice and Bob") == ["Alice", "Bob"]

    def test_feat_and_ft(self):
        from services.choreographer_follows import split_choreographers
        assert split_choreographers("Alice feat. Bob") == ["Alice", "Bob"]
        assert split_choreographers("Alice ft. Bob") == ["Alice", "Bob"]
        assert split_choreographers("Alice ft Bob") == ["Alice", "Bob"]

    def test_plus(self):
        from services.choreographer_follows import split_choreographers
        assert split_choreographers("Alice + Bob") == ["Alice", "Bob"]

    def test_case_insensitive_splitters(self):
        from services.choreographer_follows import split_choreographers
        assert split_choreographers("Alice AND Bob") == ["Alice", "Bob"]
        assert split_choreographers("Alice FEAT. Bob") == ["Alice", "Bob"]

    def test_dedup_case_insensitive(self):
        from services.choreographer_follows import split_choreographers
        # "Foo & foo" — dedupe should preserve first casing
        out = split_choreographers("Foo & foo")
        assert out == ["Foo"]

    def test_no_split_on_hyphen(self):
        from services.choreographer_follows import split_choreographers
        assert split_choreographers("Rachael McEnaney-White") == [
            "Rachael McEnaney-White"
        ]

    def test_no_split_on_dot(self):
        from services.choreographer_follows import split_choreographers
        # "A.T. Kinson" — dots inside a name must stay intact.
        assert split_choreographers("A.T. Kinson") == ["A.T. Kinson"]

    def test_no_split_on_parens(self):
        from services.choreographer_follows import split_choreographers
        assert split_choreographers("Adrian Lefebour (AUS)") == [
            "Adrian Lefebour (AUS)"
        ]

    def test_empty_and_none(self):
        from services.choreographer_follows import split_choreographers
        assert split_choreographers("") == []
        assert split_choreographers(None) == []
        assert split_choreographers("   ") == []

    def test_parse_main_and_co(self):
        from services.choreographer_follows import parse_main_and_co
        main, co = parse_main_and_co("Alice & Bob & Carol")
        assert main == "Alice"
        assert co == ["Bob", "Carol"]

    def test_parse_main_and_co_solo(self):
        from services.choreographer_follows import parse_main_and_co
        main, co = parse_main_and_co("Solo Person")
        assert main == "Solo Person"
        assert co == []


class TestBootStepperNormalise:
    """Unit test the BootStepper normaliser preserves the multi-name
    roster via ``danceChoreographers[]``."""

    def test_normalise_preserves_co_choreographers(self):
        from services import bootstepper as bs
        item = {
            "id": "TESTID1",
            "title": "Test Dance",
            "counts": 32,
            "walls": 4,
            "difficultyLevel": "Beginner",
            "danceChoreographers": [
                {"choreographer": {"name": "Alice", "country": "US"}},
                {"choreographer": {"name": "Bob", "country": "UK"}},
                {"choreographer": {"name": "Carol", "country": ""}},
            ],
            "danceSongs": [{"song": {"title": "Song", "artist": "Artist"}}],
        }
        out = bs._normalise(item)
        assert out["choreographer"] == "Alice"
        assert out["co_choreographers"] == ["Bob", "Carol"]
        assert out["choreographer_country"] == "US"

    def test_normalise_dedupes_case_insensitively(self):
        from services import bootstepper as bs
        item = {
            "id": "TESTID2",
            "title": "Test",
            "danceChoreographers": [
                {"choreographer": {"name": "Alice"}},
                {"choreographer": {"name": "alice"}},
                {"choreographer": {"name": "Bob"}},
            ],
        }
        out = bs._normalise(item)
        assert out["choreographer"] == "Alice"
        assert out["co_choreographers"] == ["Bob"]

    def test_normalise_solo(self):
        from services import bootstepper as bs
        item = {
            "id": "TESTID3",
            "title": "Solo",
            "danceChoreographers": [
                {"choreographer": {"name": "SoloPerson"}},
            ],
        }
        out = bs._normalise(item)
        assert out["choreographer"] == "SoloPerson"
        assert out["co_choreographers"] == []


# ---------------- API tests ----------------
class TestDanceCreateSplits:
    def test_create_dance_splits_ampersand(self, api, auth_headers):
        r = api.post(
            f"{BASE_URL}/api/dances",
            json={
                "name": f"{TEST_PREFIX}SplitTest1",
                "choreographer": f"{TEST_PREFIX}MainX & {TEST_PREFIX}CoY",
                "song": "s",
                "difficulty": "Beginner",
                "is_published": True,
            },
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        try:
            assert d["choreographer"] == f"{TEST_PREFIX}MainX"
            assert d["co_choreographers"] == [f"{TEST_PREFIX}CoY"]
        finally:
            api.delete(f"{BASE_URL}/api/dances/{d['id']}", headers=auth_headers)

    def test_get_dance_has_co_choreographers_array_always(
        self, api, auth_headers, seeded_dances
    ):
        # Any seeded dance — array must always be present
        d = seeded_dances[0]
        r = api.get(f"{BASE_URL}/api/dances/{d['id']}", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert "co_choreographers" in body
        assert isinstance(body["co_choreographers"], list)

    def test_solo_dance_has_empty_co_array(self, api, auth_headers, seeded_dances):
        # d3 is a solo dance ("TEST_CoBob" only)
        solo = seeded_dances[2]
        r = api.get(f"{BASE_URL}/api/dances/{solo['id']}", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["co_choreographers"] == []


class TestDanceUpdateResplits:
    def test_put_re_splits_on_choreographer_change(self, api, auth_headers):
        # Create a solo dance first
        created = _make_dance(
            api, auth_headers,
            f"{TEST_PREFIX}UpdateTest",
            f"{TEST_PREFIX}Solo",
        )
        did = created["id"]
        try:
            # Now PUT with a multi-name string
            r = api.put(
                f"{BASE_URL}/api/dances/{did}",
                json={
                    "name": created["name"],
                    "choreographer": f"{TEST_PREFIX}NewMain & {TEST_PREFIX}NewCo1 & {TEST_PREFIX}NewCo2",
                    "song": created["song"],
                    "difficulty": created["difficulty"],
                    "is_published": True,
                },
                headers=auth_headers,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["choreographer"] == f"{TEST_PREFIX}NewMain"
            assert body["co_choreographers"] == [
                f"{TEST_PREFIX}NewCo1",
                f"{TEST_PREFIX}NewCo2",
            ]

            # Verify via GET
            r2 = api.get(f"{BASE_URL}/api/dances/{did}", headers=auth_headers)
            assert r2.status_code == 200
            body2 = r2.json()
            assert body2["choreographer"] == f"{TEST_PREFIX}NewMain"
            assert body2["co_choreographers"] == [
                f"{TEST_PREFIX}NewCo1",
                f"{TEST_PREFIX}NewCo2",
            ]
        finally:
            api.delete(f"{BASE_URL}/api/dances/{did}", headers=auth_headers)


class TestChoreographerLibraryExcludesCoOnly:
    def test_co_only_person_not_in_library(self, api, auth_headers, seeded_dances):
        """The library must group by MAIN choreographer only.
        TEST_CoBob is a co-choreographer on d1 and d2, and also a
        MAIN on d3 (so it WILL appear thanks to d3). We check the
        stronger invariant using a person who only ever appears as
        co: TEST_Dave (only on d2 as third co).
        """
        # Search for a co-only name (Dave from d2 only)
        r = api.get(
            f"{BASE_URL}/api/choreographers",
            params={"q": f"{TEST_PREFIX}Dave", "limit": 50},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        rows = r.json().get("choreographers", [])
        names = [row.get("choreographer", "") for row in rows]
        # Dave is ONLY co on d2, so must NOT appear in the library
        assert not any(
            f"{TEST_PREFIX}Dave" in n for n in names
        ), f"Co-only person leaked into library: {names}"

    def test_main_person_appears_in_library(self, api, auth_headers, seeded_dances):
        # Alice is the MAIN on d1 — should appear
        r = api.get(
            f"{BASE_URL}/api/choreographers",
            params={"q": f"{TEST_PREFIX}Alice", "limit": 50},
            headers=auth_headers,
        )
        assert r.status_code == 200
        rows = r.json().get("choreographers", [])
        names = [row.get("choreographer", "") for row in rows]
        assert any(f"{TEST_PREFIX}Alice" in n for n in names), \
            f"Main choreographer missing from library: {names}"


class TestDanceSearchMatchesCo:
    def test_search_matches_on_co_choreographers(
        self, api, auth_headers, seeded_dances
    ):
        # Dave only appears as co-choreographer on d2
        r = api.get(
            f"{BASE_URL}/api/dances",
            params={"q": f"{TEST_PREFIX}Dave"},
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        ids = [d["id"] for d in rows]
        assert seeded_dances[1]["id"] in ids, \
            f"Search on co-choreographer didn't return the dance: {ids}"


class TestCoChoreographerEndpoint:
    def test_requires_auth(self, api):
        r = api.get(
            f"{BASE_URL}/api/co-choreographers/SomePerson/dances"
        )
        # Either 401 or 403 is acceptable proof of auth-required
        assert r.status_code in (401, 403), r.status_code

    def test_returns_dances_with_person_as_main_or_co(
        self, api, auth_headers, seeded_dances
    ):
        # TEST_CoBob is main on d3, co on d1 and d2 — endpoint should
        # return ALL THREE, newest first.
        name = f"{TEST_PREFIX}CoBob"
        r = api.get(
            f"{BASE_URL}/api/co-choreographers/{name}/dances",
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("choreographer") == name
        dances = body.get("dances", [])
        returned_ids = {d["id"] for d in dances}
        expected_ids = {seeded_dances[0]["id"], seeded_dances[1]["id"], seeded_dances[2]["id"]}
        assert expected_ids.issubset(returned_ids), (
            f"Missing dances. Expected {expected_ids}, got {returned_ids}"
        )
        assert body.get("dance_count") == len(dances)

    def test_case_insensitive_match(self, api, auth_headers, seeded_dances):
        # Lowercase the name — must still match d3 (main) at minimum
        name = f"{TEST_PREFIX}CoBob".lower()
        r = api.get(
            f"{BASE_URL}/api/co-choreographers/{name}/dances",
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        dances = r.json().get("dances", [])
        returned_ids = {d["id"] for d in dances}
        # d3 has main == "TEST_CoBob"; case-insensitive main match is
        # via choreographer_key so must be returned regardless of casing
        assert seeded_dances[2]["id"] in returned_ids

    def test_newest_first(self, api, auth_headers, seeded_dances):
        name = f"{TEST_PREFIX}CoBob"
        r = api.get(
            f"{BASE_URL}/api/co-choreographers/{name}/dances",
            headers=auth_headers,
        )
        assert r.status_code == 200
        dances = r.json().get("dances", [])
        # Filter to only the ones we seeded (there may be others)
        ours = [d for d in dances if str(d.get("name", "")).startswith(TEST_PREFIX)]
        if len(ours) >= 2:
            created_ats = [d.get("created_at", "") for d in ours]
            assert created_ats == sorted(created_ats, reverse=True), (
                f"Not newest-first: {created_ats}"
            )

    def test_empty_name_rejected(self, api, auth_headers):
        # Route uses {name:path} — an empty name would resolve to
        # /api/co-choreographers//dances. That's a 404 from the router,
        # which is an acceptable rejection.
        r = api.get(
            f"{BASE_URL}/api/co-choreographers/%20/dances",
            headers=auth_headers,
        )
        assert r.status_code in (400, 404), r.status_code
