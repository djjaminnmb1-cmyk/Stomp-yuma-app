"""Regression tests for two shipped fixes:

1. Timezone off-by-one for "Upcoming" filter — events posted with
   date=today (local) must be returned by:
       GET /api/events/search?date_from=<TODAY_LOCAL>
   and classes must be returned by:
       GET /api/classes?scope=upcoming&date_from=<TODAY_LOCAL>

2. Chat "Seen by N" pill — after user B calls POST /api/chat/mark-read,
   GET /api/chat/reads (called by user A) must include B's row with a
   non-empty ``last_read_at``.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime

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

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://stompin-yuma-app.preview.emergentagent.com",
).rstrip("/")

# Two instructor accounts documented in /app/memory/test_credentials.md
INSTRUCTOR_A_EMAIL = "luvtowork247@yahoo.com"      # Jamin Brown (instructor + admin)
INSTRUCTOR_A_PASSWORD = JAMIN_PASSWORD

INSTRUCTOR_B_EMAIL = "admin@stompinground.com"     # Generic admin (instructor + admin)
INSTRUCTOR_B_PASSWORD = ADMIN_PASSWORD

TODAY_LOCAL = datetime.now().strftime("%Y-%m-%d")
TIMEOUT = 30


# --------------- Fixtures ---------------

@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api, email, password):
    r = api.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def user_a(api):
    data = _login(api, INSTRUCTOR_A_EMAIL, INSTRUCTOR_A_PASSWORD)
    return {
        "token": data["token"],
        "user_id": data["user"]["user_id"],
        "headers": {
            "Authorization": f"Bearer {data['token']}",
            "Content-Type": "application/json",
        },
    }


@pytest.fixture(scope="module")
def user_b(api):
    data = _login(api, INSTRUCTOR_B_EMAIL, INSTRUCTOR_B_PASSWORD)
    return {
        "token": data["token"],
        "user_id": data["user"]["user_id"],
        "headers": {
            "Authorization": f"Bearer {data['token']}",
            "Content-Type": "application/json",
        },
    }


# --------------- 1a. Event dated today shows up ---------------

class TestEventsUpcomingTodayLocal:
    def test_event_created_today_returned_by_date_from_today(self, api, user_a):
        # Create a fresh event dated today (server local, close enough)
        payload = {
            "name": f"TEST Upcoming Today {uuid.uuid4().hex[:6]}",
            "description": "regression test — timezone off-by-one",
            "event_type": "workshop",
            "skill_level": "All levels",
            "date": TODAY_LOCAL,
            "start_time": "19:00",
            "end_time": "21:00",
            "venue_name": "TEST Venue",
            "address": "123 W 1st St",
            "city": "Yuma",
            "state": "AZ",
            "zip_code": "85364",
            "country": "US",
            "price": "$0",
            "is_published": True,
        }
        c = api.post(
            f"{BASE_URL}/api/events",
            json=payload,
            headers=user_a["headers"],
            timeout=TIMEOUT,
        )
        assert c.status_code == 200, f"create: {c.status_code} {c.text}"
        created = c.json()
        event_id = created["id"]
        assert created["date"] == TODAY_LOCAL, created

        try:
            # date_from = today should INCLUDE today (inclusive filter)
            r = api.get(
                f"{BASE_URL}/api/events/search",
                params={
                    "date_from": TODAY_LOCAL,
                    "include_classes": "false",
                    "limit": 100,
                },
                headers=user_a["headers"],
                timeout=TIMEOUT,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert "events" in body, body
            ids = {e.get("id") for e in body["events"]}
            assert event_id in ids, (
                f"event dated {TODAY_LOCAL} missing from search "
                f"date_from={TODAY_LOCAL}. Got {len(ids)} events; "
                f"sample dates={[e.get('date') for e in body['events'][:5]]}"
            )
        finally:
            # Cleanup
            api.delete(
                f"{BASE_URL}/api/events/{event_id}",
                headers=user_a["headers"],
                timeout=TIMEOUT,
            )


# --------------- 1b. Class dated today shows up in "upcoming" ---------------

class TestClassesUpcomingTodayLocal:
    def test_class_dated_today_shows_in_upcoming_scope(self, api, user_a):
        # Create a class dated today
        payload = {
            "date": TODAY_LOCAL,
            "session_label": f"TEST Class Today {uuid.uuid4().hex[:6]}",
            "dance_ids": [],
            "notes": "regression test",
        }
        c = api.post(
            f"{BASE_URL}/api/classes",
            json=payload,
            headers=user_a["headers"],
            timeout=TIMEOUT,
        )
        assert c.status_code == 200, f"create class: {c.status_code} {c.text}"
        created = c.json()
        class_id = created["id"]
        assert created["date"] == TODAY_LOCAL, created

        try:
            r = api.get(
                f"{BASE_URL}/api/classes",
                params={
                    "scope": "upcoming",
                    "date_from": TODAY_LOCAL,
                    "limit": 200,
                },
                headers=user_a["headers"],
                timeout=TIMEOUT,
            )
            assert r.status_code == 200, r.text
            docs = r.json()
            assert isinstance(docs, list), docs
            ids = {d.get("id") for d in docs}
            assert class_id in ids, (
                f"class dated {TODAY_LOCAL} missing from upcoming scope "
                f"with date_from={TODAY_LOCAL}. Got {len(ids)} rows; "
                f"first few dates={[d.get('date') for d in docs[:5]]}"
            )
        finally:
            # Cleanup
            api.delete(
                f"{BASE_URL}/api/classes/{class_id}",
                headers=user_a["headers"],
                timeout=TIMEOUT,
            )

    def test_class_without_date_from_still_works(self, api, user_a):
        """Fallback path — no date_from param, server uses UTC.
        Verifies the optional param doesn't break the existing signature.
        """
        r = api.get(
            f"{BASE_URL}/api/classes",
            params={"scope": "upcoming", "limit": 5},
            headers=user_a["headers"],
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


# --------------- 2. Chat "Seen by N" pill via chat_reads ---------------

class TestChatReads:
    def test_mark_read_by_b_shows_up_in_a_reads_feed(self, api, user_a, user_b):
        # A posts a message
        msg_body = f"TEST seen-by pill {uuid.uuid4().hex[:6]}"
        m = api.post(
            f"{BASE_URL}/api/chat/messages",
            json={"message": msg_body},
            headers=user_a["headers"],
            timeout=TIMEOUT,
        )
        assert m.status_code == 200, f"post msg: {m.status_code} {m.text}"
        msg = m.json()
        assert msg.get("id"), msg
        msg_id = msg["id"]
        msg_created_at = msg.get("created_at")
        assert msg_created_at, "message needs created_at for mark-read"

        # B marks-read with a timestamp >= A's message
        mr = api.post(
            f"{BASE_URL}/api/chat/mark-read",
            json={"at": msg_created_at},
            headers=user_b["headers"],
            timeout=TIMEOUT,
        )
        assert mr.status_code == 200, mr.text
        assert mr.json().get("ok") is True
        persisted = mr.json().get("last_read_at")
        assert persisted, mr.json()

        # A calls /chat/reads — B's row must be present with non-empty stamp
        r = api.get(
            f"{BASE_URL}/api/chat/reads",
            headers=user_a["headers"],
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "reads" in body and "count" in body, body
        b_row = next(
            (x for x in body["reads"] if x.get("user_id") == user_b["user_id"]),
            None,
        )
        assert b_row, (
            f"user B not present in /chat/reads. "
            f"Sample: {[x.get('user_id') for x in body['reads'][:5]]}"
        )
        assert b_row.get("last_read_at"), (
            f"user B row has no last_read_at: {b_row}"
        )
        # last_read_at should be >= the message's created_at
        assert b_row["last_read_at"] >= msg_created_at, (
            f"last_read_at {b_row['last_read_at']} < msg time {msg_created_at}"
        )

        # Cleanup A's message
        api.delete(
            f"{BASE_URL}/api/chat/messages/{msg_id}",
            headers=user_a["headers"],
            timeout=TIMEOUT,
        )

    def test_mark_read_is_monotonic(self, api, user_b):
        """A later mark-read with an EARLIER timestamp must not rewind."""
        # First mark: now
        r1 = api.post(
            f"{BASE_URL}/api/chat/mark-read",
            json={},  # defaults to now
            headers=user_b["headers"],
            timeout=TIMEOUT,
        )
        assert r1.status_code == 200, r1.text
        t1 = r1.json()["last_read_at"]
        assert t1

        # Second mark with a very old timestamp — must not rewind
        r2 = api.post(
            f"{BASE_URL}/api/chat/mark-read",
            json={"at": "2020-01-01T00:00:00+00:00"},
            headers=user_b["headers"],
            timeout=TIMEOUT,
        )
        assert r2.status_code == 200, r2.text
        t2 = r2.json()["last_read_at"]
        assert t2 >= t1, f"pointer rewound from {t1} to {t2}"
