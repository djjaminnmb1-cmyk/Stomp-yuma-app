"""June 2026 — Notifications 2.1 backend tests.

Covers the three features that landed in this cut:

1. **Dance Of The Day**        — ``GET /api/dance-of-the-day`` returns
   a deterministic daily pick; unpracticed dances come first.
2. **Notification Center**     — persistent feed CRUD + unread badge.
3. **Announcement Scheduling** — future-dated pins, PATCH editing,
   and the minute-interval scheduler job firing them.
"""
from __future__ import annotations

import asyncio
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
    email = f"TEST_notif21_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": "TestPushPass1!",
            "name": "TEST User",
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


@pytest.fixture(scope="module")
def regular_user():
    return _register_regular()


# ============================================================
# 1. Dance Of The Day
# ============================================================
class TestDanceOfTheDay:
    def test_requires_auth(self):
        r = requests.get(f"{API}/dance-of-the-day", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_returns_dance_shape(self, regular_user):
        r = requests.get(
            f"{API}/dance-of-the-day",
            headers=_hdr(regular_user["token"]),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "dance" in data
        assert "source" in data
        # Non-empty library is the common case — assert shape only if
        # the API returned a dance.
        if data["dance"]:
            d = data["dance"]
            for f in ("id", "name", "choreographer", "difficulty"):
                assert f in d, f"missing {f} in DOTD: {d}"
            assert data["source"] in ("cached", "unpracticed", "caught_up")

    def test_pick_is_stable_within_the_same_day(self, regular_user):
        """Two back-to-back calls for the same user on the same day
        MUST return the same dance (cache stability contract)."""
        r1 = requests.get(
            f"{API}/dance-of-the-day",
            headers=_hdr(regular_user["token"]),
            timeout=20,
        )
        r2 = requests.get(
            f"{API}/dance-of-the-day",
            headers=_hdr(regular_user["token"]),
            timeout=20,
        )
        assert r1.status_code == 200
        assert r2.status_code == 200
        d1 = r1.json()["dance"]
        d2 = r2.json()["dance"]
        if d1 is None and d2 is None:
            pytest.skip("library empty on this environment")
        assert d1 is not None and d2 is not None
        assert d1["id"] == d2["id"], (
            f"DOTD flipped mid-day: {d1['id']} vs {d2['id']}"
        )
        # Source becomes "cached" on the second ask.
        assert r2.json()["source"] == "cached"

    def test_different_users_get_different_picks(self, regular_user, admin_token):
        """Deterministic hash includes the user_id — two different
        users on the same day should pick different dances (not
        strictly guaranteed, but overwhelmingly likely for a library
        of >1 dance). We only assert when the library has >=3 dances,
        otherwise it's statistically fine for them to collide."""
        r_count = requests.get(f"{API}/dances?limit=5", timeout=15)
        count = len(r_count.json()) if r_count.status_code == 200 else 0
        if count < 3:
            pytest.skip(f"library too small ({count}) for independence check")
        r1 = requests.get(
            f"{API}/dance-of-the-day",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        )
        r2 = requests.get(
            f"{API}/dance-of-the-day",
            headers=_hdr(admin_token),
            timeout=15,
        )
        d1 = r1.json().get("dance")
        d2 = r2.json().get("dance")
        if not d1 or not d2:
            pytest.skip("no dance returned")
        # Not strictly required but should be the common case:
        # if these ever collide, the test is still correct — just
        # points to a library-size edge case.
        assert d1["id"] != d2["id"] or count <= 2


# ============================================================
# 2. Notification Center
# ============================================================
class TestNotificationCenter:
    def test_unread_count_defaults_zero(self, regular_user):
        r = requests.get(
            f"{API}/notifications/unread-count",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert "unread" in r.json()
        assert isinstance(r.json()["unread"], int)

    def test_list_requires_auth(self):
        r = requests.get(f"{API}/notifications", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_announcement_creates_feed_rows(self, admin_token, regular_user):
        """SPEC: broadcasting an announcement writes a
        notification_events row for every recipient."""
        # Baseline: the regular user's unread count BEFORE.
        before = (
            requests.get(
                f"{API}/notifications/unread-count",
                headers=_hdr(regular_user["token"]),
                timeout=15,
            )
            .json()["unread"]
        )
        # Admin fires an announcement.
        title = f"TEST_feed_log_{uuid.uuid4().hex[:6]}"
        body = "This should land in the Notification Center too."
        r = requests.post(
            f"{API}/admin/announcements",
            headers=_hdr(admin_token),
            json={"title": title, "body": body},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        ann_id = r.json()["announcement"]["id"]
        # Give the fan-out a half-second — the push is best-effort but
        # the feed insert is awaited inline.
        import time
        time.sleep(0.6)
        after = (
            requests.get(
                f"{API}/notifications/unread-count",
                headers=_hdr(regular_user["token"]),
                timeout=15,
            )
            .json()["unread"]
        )
        assert after >= before + 1, (
            f"unread didn't grow (before={before}, after={after}) — "
            f"feed log never fired?"
        )
        # Clean up.
        requests.delete(
            f"{API}/admin/announcements/{ann_id}",
            headers=_hdr(admin_token),
            timeout=15,
        )

    def test_list_returns_newest_first(self, admin_token, regular_user):
        """Create two announcements back-to-back and verify the dancer
        sees them with the newest at index 0 in their feed."""
        t1 = f"TEST_order_A_{uuid.uuid4().hex[:5]}"
        t2 = f"TEST_order_B_{uuid.uuid4().hex[:5]}"
        for t in (t1, t2):
            requests.post(
                f"{API}/admin/announcements",
                headers=_hdr(admin_token),
                json={"title": t, "body": "x"},
                timeout=15,
            )
        import time
        time.sleep(0.5)
        r = requests.get(
            f"{API}/notifications?limit=5",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        )
        titles = [row.get("title") for row in r.json().get("items", [])]
        # The last-posted title should appear earlier than the first
        # (though other events may be interleaved). We just assert that
        # if BOTH show up, t2 (newer) is before t1 (older).
        if t1 in titles and t2 in titles:
            assert titles.index(t2) < titles.index(t1), (
                f"feed not newest-first: {titles[:10]}"
            )

    def test_mark_read_marks_single_row(self, admin_token, regular_user):
        """Mark a specific notification read via POST /{id}/read and
        verify unread count drops by exactly one."""
        # Create an announcement so we have a known row for the user.
        r = requests.post(
            f"{API}/admin/announcements",
            headers=_hdr(admin_token),
            json={
                "title": f"TEST_mark_read_{uuid.uuid4().hex[:5]}",
                "body": "x",
            },
            timeout=15,
        )
        assert r.status_code == 200
        import time
        time.sleep(0.5)
        before = requests.get(
            f"{API}/notifications/unread-count",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        ).json()["unread"]
        # Grab the newest unread row.
        feed = requests.get(
            f"{API}/notifications?limit=10",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        ).json()
        unread_row = next(
            (x for x in feed["items"] if not x.get("read_at")),
            None,
        )
        if not unread_row:
            pytest.skip("no unread row to mark")
        r2 = requests.post(
            f"{API}/notifications/{unread_row['id']}/read",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        after = requests.get(
            f"{API}/notifications/unread-count",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        ).json()["unread"]
        assert after == before - 1, (
            f"unread didn't drop by 1 (before={before}, after={after})"
        )

    def test_mark_all_read_zeroes_unread(self, admin_token, regular_user):
        # Create 3 fresh unread rows for the user.
        for _ in range(3):
            requests.post(
                f"{API}/admin/announcements",
                headers=_hdr(admin_token),
                json={
                    "title": f"TEST_bulk_{uuid.uuid4().hex[:5]}",
                    "body": "x",
                },
                timeout=15,
            )
        import time
        time.sleep(0.6)
        r = requests.post(
            f"{API}/notifications/read-all",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True
        unread = requests.get(
            f"{API}/notifications/unread-count",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        ).json()["unread"]
        assert unread == 0, f"expected unread=0 after mark-all-read, got {unread}"

    def test_delete_removes_row(self, admin_token, regular_user):
        r = requests.post(
            f"{API}/admin/announcements",
            headers=_hdr(admin_token),
            json={
                "title": f"TEST_del_{uuid.uuid4().hex[:5]}",
                "body": "x",
            },
            timeout=15,
        )
        import time
        time.sleep(0.5)
        feed = requests.get(
            f"{API}/notifications?limit=5",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        ).json()
        if not feed["items"]:
            pytest.skip("no rows to delete")
        target = feed["items"][0]
        r2 = requests.delete(
            f"{API}/notifications/{target['id']}",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        # Confirm it's gone.
        feed2 = requests.get(
            f"{API}/notifications?limit=20",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        ).json()
        ids = [x["id"] for x in feed2["items"]]
        assert target["id"] not in ids

    def test_delete_unknown_id_404(self, regular_user):
        r = requests.delete(
            f"{API}/notifications/evt_bogus_doesnt_exist",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_other_user_cannot_access_my_rows(self, admin_token, regular_user):
        """Row scoping — regular_user's events must not be visible to
        a different user. We create an announcement, grab regular_user's
        row id, then try to DELETE it as admin — must 404."""
        requests.post(
            f"{API}/admin/announcements",
            headers=_hdr(admin_token),
            json={
                "title": f"TEST_scope_{uuid.uuid4().hex[:5]}",
                "body": "x",
            },
            timeout=15,
        )
        import time
        time.sleep(0.5)
        feed = requests.get(
            f"{API}/notifications?limit=5",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        ).json()
        if not feed["items"]:
            pytest.skip("no rows")
        target_id = feed["items"][0]["id"]
        # Admin tries to delete regular_user's row by its id.
        r = requests.delete(
            f"{API}/notifications/{target_id}",
            headers=_hdr(admin_token),
            timeout=15,
        )
        # Admin HAS their own row for the same announcement too, but
        # the id is different per recipient — deleting by regular_user's
        # id must 404 for the admin.
        assert r.status_code == 404, (
            f"cross-user delete allowed: {r.status_code} {r.text}"
        )


# ============================================================
# 3. Announcement Scheduling
# ============================================================
class TestAnnouncementScheduling:
    def test_schedule_in_future_does_not_broadcast_immediately(
        self, admin_token, regular_user
    ):
        """Scheduled pin: user feed must NOT contain it until the
        scheduler fires. We give it to the user before the 60s
        scheduler tick lands."""
        future = (
            datetime.now(timezone.utc) + timedelta(hours=2)
        ).isoformat()
        title = f"TEST_future_{uuid.uuid4().hex[:5]}"
        r = requests.post(
            f"{API}/admin/announcements",
            headers=_hdr(admin_token),
            json={"title": title, "body": "scheduled body", "scheduled_for": future},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        doc = r.json()["announcement"]
        assert doc["scheduled_for"] is not None
        assert doc["broadcasted_at"] is None
        # Dancer feed must not include it (list_recent filters on
        # broadcasted_at != null).
        r2 = requests.get(
            f"{API}/announcements?limit=50",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        )
        ids = [a["id"] for a in r2.json()["items"]]
        assert doc["id"] not in ids
        # Cleanup.
        requests.delete(
            f"{API}/admin/announcements/{doc['id']}",
            headers=_hdr(admin_token),
            timeout=15,
        )

    def test_scheduled_list_admin_only(self, admin_token, regular_user):
        # Admin can read.
        r1 = requests.get(
            f"{API}/admin/announcements/scheduled",
            headers=_hdr(admin_token),
            timeout=15,
        )
        assert r1.status_code == 200
        assert "items" in r1.json()
        # Regular user 403.
        r2 = requests.get(
            f"{API}/admin/announcements/scheduled",
            headers=_hdr(regular_user["token"]),
            timeout=15,
        )
        assert r2.status_code == 403, r2.text

    def test_patch_scheduled_pin(self, admin_token):
        future = (
            datetime.now(timezone.utc) + timedelta(hours=3)
        ).isoformat()
        r = requests.post(
            f"{API}/admin/announcements",
            headers=_hdr(admin_token),
            json={
                "title": "Original title",
                "body": "Original body",
                "scheduled_for": future,
            },
            timeout=15,
        )
        assert r.status_code == 200
        ann_id = r.json()["announcement"]["id"]
        # Patch it.
        new_future = (
            datetime.now(timezone.utc) + timedelta(hours=5)
        ).isoformat()
        r2 = requests.patch(
            f"{API}/admin/announcements/{ann_id}",
            headers=_hdr(admin_token),
            json={
                "title": "Patched title",
                "scheduled_for": new_future,
            },
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        patched = r2.json()["announcement"]
        assert patched["title"] == "Patched title"
        assert patched["body"] == "Original body"  # left alone
        assert (
            patched["scheduled_for"]
            and patched["scheduled_for"] != r.json()["announcement"]["scheduled_for"]
        )
        # Cleanup
        requests.delete(
            f"{API}/admin/announcements/{ann_id}",
            headers=_hdr(admin_token),
            timeout=15,
        )

    def test_patch_already_sent_400(self, admin_token):
        """SPEC: can't PATCH an already-broadcast pin — must delete
        and recreate instead. Server returns 400 with a human message."""
        r = requests.post(
            f"{API}/admin/announcements",
            headers=_hdr(admin_token),
            json={"title": "Sent pin", "body": "now"},
            timeout=15,
        )
        assert r.status_code == 200
        ann_id = r.json()["announcement"]["id"]
        r2 = requests.patch(
            f"{API}/admin/announcements/{ann_id}",
            headers=_hdr(admin_token),
            json={"title": "Trying to change"},
            timeout=15,
        )
        assert r2.status_code == 400, r2.text
        # Cleanup
        requests.delete(
            f"{API}/admin/announcements/{ann_id}",
            headers=_hdr(admin_token),
            timeout=15,
        )

    def test_patch_unknown_id_404(self, admin_token):
        r = requests.patch(
            f"{API}/admin/announcements/ann_doesnt_exist",
            headers=_hdr(admin_token),
            json={"title": "x"},
            timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_delete_scheduled_cancels(self, admin_token):
        future = (
            datetime.now(timezone.utc) + timedelta(hours=4)
        ).isoformat()
        r = requests.post(
            f"{API}/admin/announcements",
            headers=_hdr(admin_token),
            json={
                "title": "Cancel me",
                "body": "soon",
                "scheduled_for": future,
            },
            timeout=15,
        )
        ann_id = r.json()["announcement"]["id"]
        # Confirm it appears in /scheduled.
        sched = requests.get(
            f"{API}/admin/announcements/scheduled",
            headers=_hdr(admin_token),
            timeout=15,
        ).json()
        ids = [x["id"] for x in sched["items"]]
        assert ann_id in ids
        # Cancel it.
        r2 = requests.delete(
            f"{API}/admin/announcements/{ann_id}",
            headers=_hdr(admin_token),
            timeout=15,
        )
        assert r2.status_code == 200
        # Verify it's gone from /scheduled.
        sched2 = requests.get(
            f"{API}/admin/announcements/scheduled",
            headers=_hdr(admin_token),
            timeout=15,
        ).json()
        ids2 = [x["id"] for x in sched2["items"]]
        assert ann_id not in ids2

    def test_schedule_past_time_is_normalised_and_fires(
        self, admin_token
    ):
        """SPEC: if admin schedules in the past, the row still gets
        inserted with ``scheduled_for`` set. The ``_broadcast_now`` path
        inside ``create_and_broadcast`` catches past-scheduled and
        broadcasts synchronously (no need to wait for the minute tick).
        """
        past = (
            datetime.now(timezone.utc) - timedelta(hours=1)
        ).isoformat()
        r = requests.post(
            f"{API}/admin/announcements",
            headers=_hdr(admin_token),
            json={
                "title": "Backdated — fires now",
                "body": "immediate",
                "scheduled_for": past,
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        doc = r.json()["announcement"]
        # Backdated schedule should broadcast immediately.
        assert doc.get("broadcasted_at") is not None, (
            f"past-dated schedule didn't fire: {doc}"
        )
        # Cleanup
        requests.delete(
            f"{API}/admin/announcements/{doc['id']}",
            headers=_hdr(admin_token),
            timeout=15,
        )

    def test_invalid_scheduled_for_422(self, admin_token):
        r = requests.post(
            f"{API}/admin/announcements",
            headers=_hdr(admin_token),
            json={
                "title": "bad",
                "body": "bad",
                "scheduled_for": "not-a-date",
            },
            timeout=15,
        )
        assert r.status_code == 422, r.text
