"""June 2026 — DOTD Streak + Audience Picker backend tests.

Covers:

* ``GET /api/dance-of-the-day/streak``
* ``POST /api/dance-of-the-day/open``
* ``POST /api/admin/announcements`` with ``audience`` payload
* ``POST /api/admin/announcements/audience/preview``
* ``GET /api/admin/announcements/instructor-picker``
* ``GET /api/admin/announcements/difficulty-tiers``
* Badge award: ``dotd_daily_devotee`` crossing threshold

Each test is independent — the DOTD streak tests reset the user's
``dotd_streak_*`` fields + the ``dotd_opens`` ledger between runs by
registering a brand-new user per test.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

from _creds import (
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    ERIN_EMAIL,
    ERIN_PASSWORD,
    skip_if_missing,
)

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get(
    "EXPO_BACKEND_URL"
)
if not BASE_URL:
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
BASE_URL = (BASE_URL or "").rstrip("/")
API = f"{BASE_URL}/api"
TERMS_VERSION = "2026-06-24"


def _login(email: str, password: str) -> str:
    r = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=20,
    )
    assert r.status_code == 200, f"login: {r.status_code} {r.text}"
    return r.json()["token"]


def _register_regular() -> dict:
    email = f"TEST_dotd_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": "TestPushPass1!",
            "name": "TEST Dancer",
            "accepted_terms_version": TERMS_VERSION,
        },
        timeout=20,
    )
    assert r.status_code == 200, r.text
    j = r.json()
    return {
        "email": email,
        "token": j["token"],
        "user_id": j["user"]["user_id"],
    }


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    skip_if_missing(ADMIN_PASSWORD)
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def erin_token():
    skip_if_missing(ERIN_PASSWORD)
    return _login(ERIN_EMAIL, ERIN_PASSWORD)


# ============================================================
# 1. DOTD Streak endpoints
# ============================================================
class TestDotdStreakEndpoints:
    def test_streak_requires_auth(self):
        r = requests.get(f"{API}/dance-of-the-day/streak", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_open_requires_auth(self):
        r = requests.post(
            f"{API}/dance-of-the-day/open",
            json={"dance_id": "whatever"},
            timeout=15,
        )
        assert r.status_code in (401, 403), r.text

    def test_streak_defaults_zero_for_new_user(self):
        u = _register_regular()
        r = requests.get(
            f"{API}/dance-of-the-day/streak",
            headers=_hdr(u["token"]),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["current"] == 0
        assert data["longest"] == 0
        assert data["today_done"] is False

    def test_open_bumps_streak_to_one(self):
        """First open of today's DOTD → current=1, longest=1,
        today_done=True."""
        u = _register_regular()
        # Fetch today's DOTD id for this user.
        dotd = requests.get(
            f"{API}/dance-of-the-day",
            headers=_hdr(u["token"]),
            timeout=15,
        ).json()
        if not dotd.get("dance"):
            pytest.skip("library empty on this environment")
        dance_id = dotd["dance"]["id"]
        # Record the open.
        r = requests.post(
            f"{API}/dance-of-the-day/open",
            headers=_hdr(u["token"]),
            json={"dance_id": dance_id},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["dance_matches"] is True
        assert data["streak"]["current"] == 1
        assert data["streak"]["longest"] == 1
        assert data["streak"]["today_done"] is True

    def test_open_wrong_dance_id_returns_dance_matches_false(self):
        u = _register_regular()
        r = requests.post(
            f"{API}/dance-of-the-day/open",
            headers=_hdr(u["token"]),
            json={"dance_id": "dance_definitely_not_todays"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["dance_matches"] is False
        # Streak must NOT be bumped on a mismatch.
        assert data["streak"]["current"] == 0

    def test_open_missing_dance_id_400(self):
        u = _register_regular()
        r = requests.post(
            f"{API}/dance-of-the-day/open",
            headers=_hdr(u["token"]),
            json={},
            timeout=15,
        )
        assert r.status_code in (400, 422), r.text

    def test_second_open_same_day_does_not_re_bump(self):
        """Idempotency contract — two opens on the same day leave the
        streak at 1, not 2."""
        u = _register_regular()
        dotd = requests.get(
            f"{API}/dance-of-the-day",
            headers=_hdr(u["token"]),
            timeout=15,
        ).json()
        if not dotd.get("dance"):
            pytest.skip("library empty")
        dance_id = dotd["dance"]["id"]
        requests.post(
            f"{API}/dance-of-the-day/open",
            headers=_hdr(u["token"]),
            json={"dance_id": dance_id},
            timeout=15,
        )
        # Second open — same user, same day.
        r2 = requests.post(
            f"{API}/dance-of-the-day/open",
            headers=_hdr(u["token"]),
            json={"dance_id": dance_id},
            timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json()["streak"]["current"] == 1


# ============================================================
# 2. DOTD Streak badges — simulate a 3-day streak via DB
# ============================================================
class TestDotdStreakBadges:
    def test_three_day_streak_awards_daily_devotee(self):
        """We can't wait three real days in CI. Instead, we poke the
        user's streak counter directly to simulate "day 3" and
        verify evaluate_badges awards ``dotd_daily_devotee``.
        """
        import asyncio
        from datetime import date, timedelta as _td
        from core.database import db
        from services.badges import evaluate_badges

        u = _register_regular()
        uid = u["user_id"]
        # Simulate 3-day streak hitting today.
        today = date.today()

        async def _setup():
            await db.users.update_one(
                {"user_id": uid},
                {
                    "$set": {
                        "dotd_streak_current": 3,
                        "dotd_streak_longest": 3,
                        "dotd_last_open_day": today.isoformat(),
                    }
                },
            )
            # Insert ledger rows for the past 3 days so the record is
            # consistent (not strictly required by evaluate_badges but
            # keeps the data clean for other checks).
            for i in range(3):
                d = (today - _td(days=i)).isoformat()
                await db.dotd_opens.insert_one(
                    {
                        "user_id": uid,
                        "day": d,
                        "dance_id": "test",
                        "opens": 1,
                    }
                )
            return await evaluate_badges(uid)

        earned = asyncio.get_event_loop().run_until_complete(_setup())
        earned_ids = [b.get("id") or b.get("badge_id") for b in earned]
        assert "dotd_daily_devotee" in earned_ids, (
            f"expected dotd_daily_devotee in {earned_ids}"
        )

    def test_seven_day_streak_awards_weekly_devotee(self):
        import asyncio
        from datetime import date, timedelta as _td
        from core.database import db
        from services.badges import evaluate_badges

        u = _register_regular()
        uid = u["user_id"]
        today = date.today()

        async def _setup():
            await db.users.update_one(
                {"user_id": uid},
                {
                    "$set": {
                        "dotd_streak_current": 7,
                        "dotd_streak_longest": 7,
                        "dotd_last_open_day": today.isoformat(),
                    }
                },
            )
            for i in range(7):
                d = (today - _td(days=i)).isoformat()
                await db.dotd_opens.insert_one(
                    {
                        "user_id": uid,
                        "day": d,
                        "dance_id": "test",
                        "opens": 1,
                    }
                )
            return await evaluate_badges(uid)

        earned = asyncio.get_event_loop().run_until_complete(_setup())
        earned_ids = [b.get("id") or b.get("badge_id") for b in earned]
        assert "dotd_daily_devotee" in earned_ids
        assert "dotd_weekly_devotee" in earned_ids


# ============================================================
# 3. Audience picker metadata endpoints
# ============================================================
class TestAudiencePickerMetadata:
    def test_instructor_picker_admin_only(self, admin_token):
        u = _register_regular()
        r1 = requests.get(
            f"{API}/admin/announcements/instructor-picker",
            headers=_hdr(admin_token),
            timeout=15,
        )
        assert r1.status_code == 200
        assert "items" in r1.json()
        assert isinstance(r1.json()["items"], list)
        # Picker should include at least one instructor-rated user.
        for it in r1.json()["items"]:
            assert "user_id" in it
            assert "name" in it

        r2 = requests.get(
            f"{API}/admin/announcements/instructor-picker",
            headers=_hdr(u["token"]),
            timeout=15,
        )
        assert r2.status_code == 403, r2.text

    def test_difficulty_tiers_admin_only(self, admin_token):
        u = _register_regular()
        r1 = requests.get(
            f"{API}/admin/announcements/difficulty-tiers",
            headers=_hdr(admin_token),
            timeout=15,
        )
        assert r1.status_code == 200
        tiers = r1.json()["items"]
        # Must include the canonical set.
        for canonical in ("Beginner", "Improver", "Intermediate", "Advanced"):
            assert canonical in tiers, (
                f"{canonical} missing from tiers {tiers}"
            )

        r2 = requests.get(
            f"{API}/admin/announcements/difficulty-tiers",
            headers=_hdr(u["token"]),
            timeout=15,
        )
        assert r2.status_code == 403


# ============================================================
# 4. Audience preview endpoint
# ============================================================
class TestAudiencePreview:
    def test_preview_everyone_returns_count(self, admin_token):
        r = requests.post(
            f"{API}/admin/announcements/audience/preview",
            headers=_hdr(admin_token),
            json={"scope": "everyone"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "count" in data and isinstance(data["count"], int)
        assert data["count"] >= 0
        assert "sample_names" in data
        assert isinstance(data["sample_names"], list)

    def test_preview_custom_no_filters_falls_back_to_everyone(
        self, admin_token
    ):
        """scope=custom with no filters normalizes to everyone server-
        side — so the count should match 'everyone'."""
        r_every = requests.post(
            f"{API}/admin/announcements/audience/preview",
            headers=_hdr(admin_token),
            json={"scope": "everyone"},
            timeout=15,
        )
        r_custom = requests.post(
            f"{API}/admin/announcements/audience/preview",
            headers=_hdr(admin_token),
            json={"scope": "custom"},
            timeout=15,
        )
        assert r_every.status_code == 200
        assert r_custom.status_code == 200
        assert r_every.json()["count"] == r_custom.json()["count"]

    def test_preview_tier_filter_narrows_count(self, admin_token):
        """A tier that nobody has practiced should yield a smaller
        count than 'everyone'."""
        r_every = requests.post(
            f"{API}/admin/announcements/audience/preview",
            headers=_hdr(admin_token),
            json={"scope": "everyone"},
            timeout=15,
        )
        r_tier = requests.post(
            f"{API}/admin/announcements/audience/preview",
            headers=_hdr(admin_token),
            json={
                "scope": "custom",
                "difficulty_tiers": ["Advanced"],
            },
            timeout=15,
        )
        assert r_every.status_code == 200
        assert r_tier.status_code == 200
        # Tier-filtered count MUST be <= everyone's count.
        assert r_tier.json()["count"] <= r_every.json()["count"]

    def test_preview_non_admin_403(self):
        u = _register_regular()
        r = requests.post(
            f"{API}/admin/announcements/audience/preview",
            headers=_hdr(u["token"]),
            json={"scope": "everyone"},
            timeout=15,
        )
        assert r.status_code == 403, r.text


# ============================================================
# 5. Audience-filtered announcements — scope is persisted + used
# ============================================================
class TestAudienceOnAnnouncements:
    def test_create_with_audience_stores_scope(self, admin_token):
        """Scheduling tomorrow with scope=custom + a tier filter must
        persist the audience shape on the stored doc."""
        future = (
            datetime.now(timezone.utc) + timedelta(hours=5)
        ).isoformat()
        r = requests.post(
            f"{API}/admin/announcements",
            headers=_hdr(admin_token),
            json={
                "title": "Beginners only",
                "body": "A pin just for new dancers",
                "scheduled_for": future,
                "audience": {
                    "scope": "custom",
                    "difficulty_tiers": ["Beginner"],
                },
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        doc = r.json()["announcement"]
        assert doc["audience"]["scope"] == "custom"
        assert "Beginner" in (doc["audience"].get("difficulty_tiers") or [])
        # Cleanup
        requests.delete(
            f"{API}/admin/announcements/{doc['id']}",
            headers=_hdr(admin_token),
            timeout=15,
        )

    def test_patch_audience_round_trip(self, admin_token):
        """Changing the audience on a scheduled pin via PATCH should
        land on the stored doc."""
        future = (
            datetime.now(timezone.utc) + timedelta(hours=6)
        ).isoformat()
        r = requests.post(
            f"{API}/admin/announcements",
            headers=_hdr(admin_token),
            json={
                "title": "Pin audience test",
                "body": "body",
                "scheduled_for": future,
            },
            timeout=15,
        )
        ann_id = r.json()["announcement"]["id"]
        # Patch to a tier-filtered audience.
        r2 = requests.patch(
            f"{API}/admin/announcements/{ann_id}",
            headers=_hdr(admin_token),
            json={
                "audience": {
                    "scope": "custom",
                    "difficulty_tiers": ["Intermediate"],
                }
            },
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        updated = r2.json()["announcement"]
        assert updated["audience"]["scope"] == "custom"
        assert "Intermediate" in (
            updated["audience"].get("difficulty_tiers") or []
        )
        requests.delete(
            f"{API}/admin/announcements/{ann_id}",
            headers=_hdr(admin_token),
            timeout=15,
        )

    def test_create_without_audience_defaults_everyone(self, admin_token):
        """Backward-compat: omitting audience → scope='everyone'."""
        r = requests.post(
            f"{API}/admin/announcements",
            headers=_hdr(admin_token),
            json={"title": "No audience", "body": "default"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        doc = r.json()["announcement"]
        assert (doc.get("audience") or {}).get("scope") == "everyone"
        requests.delete(
            f"{API}/admin/announcements/{doc['id']}",
            headers=_hdr(admin_token),
            timeout=15,
        )

    def test_audience_filter_narrows_fan_out(self, admin_token):
        """Create a tier-filtered announcement and verify the regular
        user (who has no recent practice sessions = no tier) does NOT
        appear in the recipient pool."""
        u = _register_regular()
        import time
        # Fire tier-filtered pin (user has no practice history yet).
        r = requests.post(
            f"{API}/admin/announcements",
            headers=_hdr(admin_token),
            json={
                "title": f"TEST_narrow_{uuid.uuid4().hex[:5]}",
                "body": "tier only",
                "audience": {
                    "scope": "custom",
                    "difficulty_tiers": ["Beginner"],
                },
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        ann_id = r.json()["announcement"]["id"]
        time.sleep(0.6)
        # The regular user (no practice history) must NOT have a feed
        # row for this announcement.
        feed = requests.get(
            f"{API}/notifications?limit=20",
            headers=_hdr(u["token"]),
            timeout=15,
        ).json()
        matching = [
            x
            for x in feed["items"]
            if x.get("metadata", {}).get("entity_id") == ann_id
        ]
        assert len(matching) == 0, (
            f"tier-filtered pin leaked to a user with no tier: {matching}"
        )
        requests.delete(
            f"{API}/admin/announcements/{ann_id}",
            headers=_hdr(admin_token),
            timeout=15,
        )
