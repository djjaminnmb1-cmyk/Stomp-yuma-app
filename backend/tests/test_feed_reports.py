"""Tests for Age-Gate / Instructor-Badge / Feed-Report features.

Focus:
  * GET  /api/feed/report-reasons          → 6 reasons, expected shape
  * POST /api/feed/{id}/report              → happy path + idempotent upsert
  * POST /api/feed/{id}/report              → 400 bogus, 404 missing, 400 self
  * GET  /api/admin/feed/reports            → 403 non-admin, 200 admin,
                                              newest-first + name hydration
  * GET  /api/feed                          → carries user.is_instructor
                                              (True for Erin, False for
                                              a fresh regular user)
  * Regression: DELETE /api/auth/me         → also purges feed_reports rows
"""

from __future__ import annotations

import os
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

ERIN = ("erinboroughs@gmail.com", "Stompin2026!")
JAMIN = ("luvtowork247@yahoo.com", "BootsDance49!")

EXPECTED_REASONS = {
    "harassment",
    "hate_speech",
    "spam",
    "impersonation",
    "sexual_content",
    "other",
}


# ---------- session + helpers ----------
@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _login(s: requests.Session, email: str, password: str) -> str:
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    j = r.json()
    tok = j.get("token") or j.get("session_token") or j.get("access_token")
    assert tok, f"no token in login response: {j}"
    return tok


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _me(s, tok):
    r = s.get(f"{BASE}/api/auth/me", headers=_hdr(tok))
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("user_id") or (j.get("user") or {}).get("user_id"), j


@pytest.fixture(scope="module")
def erin_token(s):
    return _login(s, *ERIN)


@pytest.fixture(scope="module")
def jamin_token(s):
    return _login(s, *JAMIN)


@pytest.fixture(scope="module")
def erin_uid(s, erin_token):
    uid, _ = _me(s, erin_token)
    return uid


@pytest.fixture(scope="module")
def fresh_user(s):
    tag = uuid.uuid4().hex[:8]
    email = f"TEST_reporter_{tag}@example.com"
    pw = "ReportPass123!"
    r = s.post(f"{BASE}/api/auth/register",
               json={"email": email, "password": pw,
                     "name": f"TEST Reporter {tag}"},
               timeout=20)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("session_token")
    uid = (data.get("user") or {}).get("user_id") or data.get("user_id")
    if not uid:
        uid, _ = _me(s, tok)
    return {"token": tok, "user_id": uid, "email": email, "password": pw}


def _ensure_completion_event_for(s, tok):
    """Create a completion event for the given user's account."""
    r = s.get(f"{BASE}/api/dances?limit=25", headers=_hdr(tok))
    assert r.status_code == 200, r.text
    body = r.json()
    dances = body if isinstance(body, list) else (
        body.get("dances") or body.get("items") or []
    )
    assert dances, "no dances seeded"
    # Try each dance until one hasn't been completed yet (feed dedup rule)
    for d in dances:
        dance_id = d.get("id") or d.get("dance_id")
        if not dance_id:
            continue
        tr = s.post(f"{BASE}/api/tracking/{dance_id}",
                    headers=_hdr(tok), json={"status": "completed"})
        if tr.status_code not in (200, 201):
            continue
        fr = s.get(f"{BASE}/api/feed?limit=50", headers=_hdr(tok))
        assert fr.status_code == 200, fr.text
        for e in fr.json().get("events", []):
            if e.get("type") == "completion" and e.get("id"):
                return e["id"]
    pytest.skip("Couldn't produce a completion event")


@pytest.fixture(scope="module")
def erin_event_id(s, erin_token):
    return _ensure_completion_event_for(s, erin_token)


# ---------- report-reasons catalog ----------
class TestReportReasons:
    def test_returns_six_reasons(self, s, erin_token):
        r = s.get(f"{BASE}/api/feed/report-reasons", headers=_hdr(erin_token))
        assert r.status_code == 200, r.text
        payload = r.json()
        reasons = payload.get("reasons", [])
        assert len(reasons) == 6, reasons
        slugs = {row["reason"] for row in reasons}
        assert slugs == EXPECTED_REASONS
        for row in reasons:
            assert row.get("label"), row

    def test_requires_auth(self, s):
        r = s.get(f"{BASE}/api/feed/report-reasons")
        assert r.status_code in (401, 403), r.status_code


# ---------- report happy path + validations ----------
class TestReportFeedEvent:
    def test_cross_user_report_creates_row(
        self, s, fresh_user, erin_event_id
    ):
        r = s.post(
            f"{BASE}/api/feed/{erin_event_id}/report",
            headers=_hdr(fresh_user["token"]),
            json={"reason": "spam", "note": "TEST cross-user report"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        # created may be True the first time OR False if a prior test run
        # already inserted the row — still shape-check.
        assert "created" in body

    def test_re_report_is_idempotent(self, s, fresh_user, erin_event_id):
        # Ensure a row exists first
        s.post(f"{BASE}/api/feed/{erin_event_id}/report",
               headers=_hdr(fresh_user["token"]),
               json={"reason": "harassment", "note": ""})
        r2 = s.post(
            f"{BASE}/api/feed/{erin_event_id}/report",
            headers=_hdr(fresh_user["token"]),
            json={"reason": "harassment", "note": "updated"},
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body["ok"] is True
        assert body["created"] is False, body

    def test_bogus_reason_400(self, s, fresh_user, erin_event_id):
        r = s.post(
            f"{BASE}/api/feed/{erin_event_id}/report",
            headers=_hdr(fresh_user["token"]),
            json={"reason": "bogus"},
        )
        assert r.status_code == 400, r.text

    def test_missing_event_404(self, s, fresh_user):
        bogus = f"evt_{uuid.uuid4().hex[:12]}"
        r = s.post(
            f"{BASE}/api/feed/{bogus}/report",
            headers=_hdr(fresh_user["token"]),
            json={"reason": "spam"},
        )
        assert r.status_code == 404, r.text

    def test_self_report_400(self, s, erin_token, erin_event_id):
        r = s.post(
            f"{BASE}/api/feed/{erin_event_id}/report",
            headers=_hdr(erin_token),
            json={"reason": "spam", "note": "own post"},
        )
        assert r.status_code == 400, r.text

    def test_requires_auth(self, s, erin_event_id):
        r = s.post(f"{BASE}/api/feed/{erin_event_id}/report",
                   json={"reason": "spam"})
        assert r.status_code in (401, 403)


# ---------- admin queue ----------
class TestAdminFeedReports:
    def test_non_admin_forbidden(self, s, fresh_user):
        r = s.get(f"{BASE}/api/admin/feed/reports",
                  headers=_hdr(fresh_user["token"]))
        assert r.status_code == 403, r.text

    def test_jamin_instructor_but_not_admin_forbidden(self, s, jamin_token):
        r = s.get(f"{BASE}/api/admin/feed/reports",
                  headers=_hdr(jamin_token))
        assert r.status_code == 403, r.text

    def test_admin_gets_queue_hydrated(
        self, s, erin_token, fresh_user, erin_event_id
    ):
        # Guarantee at least one row from cross-user report path
        s.post(
            f"{BASE}/api/feed/{erin_event_id}/report",
            headers=_hdr(fresh_user["token"]),
            json={"reason": "hate_speech", "note": "TEST admin queue"},
        )
        r = s.get(f"{BASE}/api/admin/feed/reports?limit=50",
                  headers=_hdr(erin_token))
        assert r.status_code == 200, r.text
        payload = r.json()
        reports = payload.get("reports", [])
        assert reports, "expected at least one moderation report"
        # Find our row
        mine = next(
            (row for row in reports
             if row.get("reporter_id") == fresh_user["user_id"]
             and row.get("event_id") == erin_event_id),
            None,
        )
        assert mine, f"our report not found in queue: {reports[:3]}"
        assert mine.get("reason") in EXPECTED_REASONS
        assert mine.get("status") == "open"
        assert "created_at" in mine
        # Hydrated names
        assert mine.get("reporter_name"), mine
        assert mine.get("reported_user_name"), mine
        # Newest-first ordering
        created_ats = [row.get("created_at", "") for row in reports]
        assert created_ats == sorted(created_ats, reverse=True), \
            "reports not newest-first"
        # _id should be excluded
        for row in reports:
            assert "_id" not in row


# ---------- feed hydration: is_instructor ----------
class TestFeedInstructorFlag:
    def test_erin_events_are_instructor(self, s, erin_token, erin_event_id):
        r = s.get(f"{BASE}/api/feed?limit=30", headers=_hdr(erin_token))
        assert r.status_code == 200, r.text
        events = r.json().get("events", [])
        target = next((e for e in events if e["id"] == erin_event_id), None)
        assert target, "erin's event missing"
        user_obj = target.get("user") or {}
        assert user_obj.get("is_instructor") is True, user_obj

    def test_fresh_user_events_are_not_instructor(self, s, fresh_user):
        # Produce a completion event on the fresh user
        eid = _ensure_completion_event_for(s, fresh_user["token"])
        r = s.get(f"{BASE}/api/feed?limit=30",
                  headers=_hdr(fresh_user["token"]))
        assert r.status_code == 200, r.text
        events = r.json().get("events", [])
        target = next((e for e in events if e["id"] == eid), None)
        assert target, "fresh user's event missing"
        user_obj = target.get("user") or {}
        assert user_obj.get("is_instructor") is False, user_obj


# ---------- regression: purge_user removes reports ----------
class TestAccountDeletionPurgesReports:
    def test_delete_me_also_deletes_reports(self, s, erin_token, erin_event_id):
        # Create a throw-away user, have them file a report, then delete
        tag = uuid.uuid4().hex[:8]
        email = f"TEST_purge_{tag}@example.com"
        pw = "PurgeMe123!"
        reg = s.post(f"{BASE}/api/auth/register",
                     json={"email": email, "password": pw,
                           "name": f"TEST Purge {tag}"}, timeout=20)
        assert reg.status_code in (200, 201), reg.text
        data = reg.json()
        tok = data.get("token") or data.get("session_token")
        uid = (data.get("user") or {}).get("user_id") or data.get("user_id")
        if not uid:
            uid, _ = _me(s, tok)

        rep = s.post(
            f"{BASE}/api/feed/{erin_event_id}/report",
            headers=_hdr(tok),
            json={"reason": "impersonation", "note": "TEST purge"},
        )
        assert rep.status_code == 200, rep.text

        # Confirm row is in the admin queue
        q1 = s.get(f"{BASE}/api/admin/feed/reports?limit=100",
                   headers=_hdr(erin_token))
        assert q1.status_code == 200
        pre_ids = {row.get("reporter_id") for row in q1.json().get("reports", [])}
        assert uid in pre_ids, "throwaway reporter not in queue before delete"

        # Delete the user
        d = s.delete(f"{BASE}/api/auth/me", headers=_hdr(tok))
        if d.status_code == 404:
            pytest.skip("DELETE /api/auth/me not implemented in this build")
        assert d.status_code in (200, 204), d.text

        # Now the report tied to that reporter must be gone
        q2 = s.get(f"{BASE}/api/admin/feed/reports?limit=200",
                   headers=_hdr(erin_token))
        assert q2.status_code == 200
        post_ids = {row.get("reporter_id") for row in q2.json().get("reports", [])}
        assert uid not in post_ids, \
            "purge_user did not remove feed_reports for deleted user"
