"""Tests for the User-Submitted Dances (pending approval) feature.

Covers:
  - GET  /api/pending-dances/quota
  - POST /api/pending-dances/submit
  - GET  /api/pending-dances/mine
  - GET  /api/admin/pending-dances
  - POST /api/admin/pending-dances/{id}/approve
  - POST /api/admin/pending-dances/{id}/reject
  - Regression: /api/copperknob/popular, /api/bootstepper/popular,
    /api/dances?scope=public
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://stompin-yuma-app.preview.emergentagent.com",
).rstrip("/")

ADMIN_EMAIL = "admin@stompinground.com"
ADMIN_PASSWORD = "C^c+9$ii4y@_L1mU4sl5BTOd"


# ---------------------------- Fixtures ----------------------------


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def user_ctx(api):
    """Register a fresh, isolated regular user."""
    suffix = uuid.uuid4().hex[:10]
    email = f"TEST_pd_{suffix}@example.com"
    r = api.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "TestPass123!", "name": f"PD Tester {suffix}"},
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text[:200]}"
    body = r.json()
    return {
        "email": email,
        "token": body["token"],
        "user_id": body["user"]["user_id"],
    }


@pytest.fixture(scope="module")
def user2_ctx(api):
    """A second isolated user, so we can exercise the daily-quota limit
    without polluting the primary user's queue."""
    suffix = uuid.uuid4().hex[:10]
    email = f"TEST_pd2_{suffix}@example.com"
    r = api.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "TestPass123!", "name": f"PD Quota {suffix}"},
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text[:200]}"
    body = r.json()
    return {"email": email, "token": body["token"], "user_id": body["user"]["user_id"]}


@pytest.fixture(scope="module")
def user3_ctx(api):
    suffix = uuid.uuid4().hex[:10]
    email = f"TEST_pd3_{suffix}@example.com"
    r = api.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "TestPass123!", "name": f"PD Third {suffix}"},
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text[:200]}"
    body = r.json()
    return {"email": email, "token": body["token"], "user_id": body["user"]["user_id"]}


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def popular_refs(api, user_ctx, admin_token):
    """Grab many CopperKnob popular refs that are NOT already in the
    library AND not already in the pending_dances queue (so re-runs of
    this suite don't collide with previous submissions)."""
    r = api.get(f"{BASE_URL}/api/copperknob/popular", headers=_h(user_ctx["token"]))
    assert r.status_code == 200, f"popular failed: {r.status_code} {r.text[:200]}"
    data = r.json().get("data") or []
    fresh = [
        (item.get("ref") or "").upper()
        for item in data
        if not item.get("existing_dance") and item.get("ref")
    ]
    # Filter out anything already sitting in the pending-dances queue
    # (pending or approved rows would 409 on submit).
    rq = api.get(
        f"{BASE_URL}/api/admin/pending-dances?status=all&limit=500",
        headers=_h(admin_token),
    )
    assert rq.status_code == 200, rq.text
    claimed = {
        (row.get("ref") or "").upper()
        for row in rq.json().get("items", [])
        if row.get("source") == "copperknob" and row.get("status") in ("pending", "approved")
    }
    # Dedupe while preserving order, skipping claimed refs
    seen: set = set()
    ordered: list = []
    for ref in fresh:
        if ref in seen or ref in claimed:
            continue
        seen.add(ref)
        ordered.append(ref)
    assert len(ordered) >= 8, (
        f"Need >=8 unclaimed refs; only found {len(ordered)}. "
        "The pending_dances queue may be exhausting the popular list — "
        "clean up old TEST rows or bump the CopperKnob popular endpoint size."
    )
    return ordered


# ---------------------------- 1. Quota ----------------------------


class TestQuota:
    def test_quota_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/pending-dances/quota")
        assert r.status_code == 401

    def test_quota_fresh_user(self, api, user_ctx):
        r = api.get(
            f"{BASE_URL}/api/pending-dances/quota",
            headers=_h(user_ctx["token"]),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["used"] == 0
        assert body["limit"] == 5
        assert body["remaining"] == 5
        assert isinstance(body["resets_at"], str) and body["resets_at"].endswith("Z")


# ---------------------------- 2. Submit ----------------------------


class TestSubmit:
    def test_submit_valid_copperknob(self, api, user_ctx, popular_refs):
        ref = popular_refs[0]
        r = api.post(
            f"{BASE_URL}/api/pending-dances/submit",
            headers=_h(user_ctx["token"]),
            json={"source": "copperknob", "ref": ref},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "submission" in body and "quota" in body
        sub = body["submission"]
        assert sub["status"] == "pending"
        assert sub["source"] == "copperknob"
        assert sub["ref"] == ref
        assert sub["user_id"] == user_ctx["user_id"]
        assert sub["title"], "title should be populated from CopperKnob metadata"
        assert body["quota"]["used"] == 1
        assert body["quota"]["remaining"] == 4
        # stash for follow-up tests
        pytest.pd_first_ref = ref
        pytest.pd_first_id = sub["id"]

    def test_submit_duplicate_same_ref(self, api, user_ctx):
        r = api.post(
            f"{BASE_URL}/api/pending-dances/submit",
            headers=_h(user_ctx["token"]),
            json={"source": "copperknob", "ref": pytest.pd_first_ref},
        )
        assert r.status_code == 409, r.text
        detail = r.json().get("detail") or {}
        assert isinstance(detail, dict), f"expected dict detail, got {detail!r}"
        assert detail.get("code") == "already_pending"

    def test_submit_unknown_source(self, api, user_ctx, popular_refs):
        r = api.post(
            f"{BASE_URL}/api/pending-dances/submit",
            headers=_h(user_ctx["token"]),
            json={"source": "randomsite", "ref": popular_refs[1]},
        )
        assert r.status_code == 400, r.text

    def test_submit_empty_ref(self, api, user_ctx):
        r = api.post(
            f"{BASE_URL}/api/pending-dances/submit",
            headers=_h(user_ctx["token"]),
            json={"source": "copperknob", "ref": ""},
        )
        # Pydantic min_length=1 raises 422 before hitting the endpoint;
        # allow either (either shape signals "bad ref").
        assert r.status_code in (400, 422), r.text

    def test_submit_ref_already_in_library(self, api, user_ctx):
        """Find a public dance carrying a copperknob_ref and try to
        submit it — must return 409 with already_in_library."""
        r = api.get(
            f"{BASE_URL}/api/dances?scope=public&limit=200",
            headers=_h(user_ctx["token"]),
        )
        assert r.status_code == 200, r.text
        payload = r.json()
        if isinstance(payload, list):
            dances = payload
        elif isinstance(payload, dict):
            dances = (
                payload.get("items")
                or payload.get("dances")
                or payload.get("results")
                or []
            )
        else:
            dances = []
        candidate = next(
            (d for d in dances if d.get("copperknob_ref")),
            None,
        )
        if not candidate:
            pytest.skip("No public dance with copperknob_ref found — cannot exercise already_in_library")
        r2 = api.post(
            f"{BASE_URL}/api/pending-dances/submit",
            headers=_h(user_ctx["token"]),
            json={"source": "copperknob", "ref": candidate["copperknob_ref"]},
        )
        assert r2.status_code == 409, r2.text
        detail = r2.json().get("detail") or {}
        assert isinstance(detail, dict)
        assert detail.get("code") == "already_in_library"


# ---------------------------- 2g. Daily limit ----------------------------


class TestDailyLimit:
    def test_daily_limit_reached_on_6th(self, api, user2_ctx, popular_refs):
        """Use an isolated user so the previous suite's submissions don't
        count. Submit 5 unique refs, then expect 6th to 429."""
        # popular_refs now excludes queue-claimed refs; index 0 was
        # consumed by TestSubmit, so reserve [1:6] for user2's 5 slots
        # and [6] for the 6th (429) attempt.
        refs = popular_refs[1:6]  # need 5
        if len(refs) < 5:
            pytest.skip(f"Not enough unclaimed refs (need 5, have {len(refs)})")

        for i, ref in enumerate(refs, start=1):
            r = api.post(
                f"{BASE_URL}/api/pending-dances/submit",
                headers=_h(user2_ctx["token"]),
                json={"source": "copperknob", "ref": ref},
            )
            assert r.status_code == 200, f"submit #{i} failed for {ref}: {r.status_code} {r.text[:200]}"
            time.sleep(0.1)

        # Quota should now report 0 remaining
        rq = api.get(
            f"{BASE_URL}/api/pending-dances/quota",
            headers=_h(user2_ctx["token"]),
        )
        assert rq.status_code == 200
        assert rq.json()["remaining"] == 0

        # 6th submission — any fresh ref should still 429
        r6 = api.post(
            f"{BASE_URL}/api/pending-dances/submit",
            headers=_h(user2_ctx["token"]),
            json={"source": "copperknob", "ref": popular_refs[6] if len(popular_refs) > 6 else "ZZZZZZZ"},
        )
        assert r6.status_code == 429, r6.text
        detail = r6.json().get("detail") or {}
        assert isinstance(detail, dict)
        assert detail.get("code") == "daily_limit_reached"


# ---------------------------- 3. My submissions ----------------------------


class TestMine:
    def test_mine_lists_own_submissions_newest_first(self, api, user_ctx):
        r = api.get(
            f"{BASE_URL}/api/pending-dances/mine",
            headers=_h(user_ctx["token"]),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and "count" in body
        assert body["count"] >= 1
        # Verify newest-first order
        times = [row["submitted_at"] for row in body["items"]]
        assert times == sorted(times, reverse=True), "items not newest-first"
        # Verify only own submissions returned
        assert all(row["user_id"] == user_ctx["user_id"] for row in body["items"])


# ---------------------------- 4. Admin list ----------------------------


class TestAdminList:
    def test_regular_user_forbidden(self, api, user_ctx):
        r = api.get(
            f"{BASE_URL}/api/admin/pending-dances",
            headers=_h(user_ctx["token"]),
        )
        assert r.status_code == 403, r.text

    def test_admin_list_default_pending(self, api, admin_token):
        r = api.get(
            f"{BASE_URL}/api/admin/pending-dances",
            headers=_h(admin_token),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and "count" in body and "pending_count" in body
        assert body["pending_count"] >= 1  # we've submitted several
        assert all(x["status"] == "pending" for x in body["items"])

    def test_admin_list_filter_all(self, api, admin_token):
        r = api.get(
            f"{BASE_URL}/api/admin/pending-dances?status=all",
            headers=_h(admin_token),
        )
        assert r.status_code == 200
        # "all" returns everything, regardless of status
        statuses = {x["status"] for x in r.json()["items"]}
        assert statuses  # non-empty


# ---------------------------- 5. Approve ----------------------------


class TestApprove:
    def test_approve_creates_real_dance(self, api, admin_token, user_ctx):
        # Approve the primary user's first submission (still pending)
        pd_id = pytest.pd_first_id
        r = api.post(
            f"{BASE_URL}/api/admin/pending-dances/{pd_id}/approve",
            headers=_h(admin_token),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Two possible shapes: fresh insert -> dance_id; auto-dup -> already_in_library
        assert body.get("ok") is True
        dance_id = body.get("dance_id")
        assert dance_id, f"no dance_id returned: {body}"

        # Verify queue row now shows approved + approved_dance_id
        rm = api.get(
            f"{BASE_URL}/api/pending-dances/mine",
            headers=_h(user_ctx["token"]),
        )
        rows = rm.json()["items"]
        row = next((x for x in rows if x["id"] == pd_id), None)
        assert row is not None
        assert row["status"] == "approved"
        assert row["approved_dance_id"] == dance_id

        # Verify the real dance exists via GET /api/dances/{id}
        rd = api.get(
            f"{BASE_URL}/api/dances/{dance_id}",
            headers=_h(user_ctx["token"]),
        )
        assert rd.status_code == 200, rd.text
        dance = rd.json()
        assert dance.get("is_published") is True
        assert dance.get("created_by") == user_ctx["user_id"]
        # Must carry the source ref
        if not body.get("already_in_library"):
            assert dance.get("copperknob_ref") == pytest.pd_first_ref

        pytest.pd_approved_dance_id = dance_id

    def test_approve_already_reviewed_is_409(self, api, admin_token):
        pd_id = pytest.pd_first_id
        r = api.post(
            f"{BASE_URL}/api/admin/pending-dances/{pd_id}/approve",
            headers=_h(admin_token),
        )
        assert r.status_code == 409, r.text


# ---------------------------- 6. Reject ----------------------------


class TestReject:
    def test_reject_and_quota_untouched(self, api, admin_token, user3_ctx, popular_refs):
        """Create a fresh submission (user3), reject it, verify status
        + reason + that the user's daily quota is unaffected."""
        # Pick a ref that user2 hasn't taken (7:12 range) and user_ctx
        # hasn't taken (index 0 & maybe 1). Use tail of list.
        ref = popular_refs[-1]
        rsub = api.post(
            f"{BASE_URL}/api/pending-dances/submit",
            headers=_h(user3_ctx["token"]),
            json={"source": "copperknob", "ref": ref},
        )
        assert rsub.status_code == 200, rsub.text
        pd_id = rsub.json()["submission"]["id"]

        # Quota after 1 submit == used 1
        rq = api.get(
            f"{BASE_URL}/api/pending-dances/quota",
            headers=_h(user3_ctx["token"]),
        )
        assert rq.json()["used"] == 1

        rrej = api.post(
            f"{BASE_URL}/api/admin/pending-dances/{pd_id}/reject",
            headers=_h(admin_token),
            json={"reason": "test reason — automated"},
        )
        assert rrej.status_code == 200, rrej.text
        assert rrej.json().get("ok") is True

        # After rejection, quota `used` should drop back to 0 (rejected
        # rows don't count toward the daily limit).
        rq2 = api.get(
            f"{BASE_URL}/api/pending-dances/quota",
            headers=_h(user3_ctx["token"]),
        )
        assert rq2.status_code == 200
        assert rq2.json()["used"] == 0, (
            f"rejected submissions should not count toward quota; got used={rq2.json()['used']}"
        )

        # Confirm the row itself shows rejected + reason
        rm = api.get(
            f"{BASE_URL}/api/pending-dances/mine",
            headers=_h(user3_ctx["token"]),
        )
        row = next((x for x in rm.json()["items"] if x["id"] == pd_id), None)
        assert row is not None
        assert row["status"] == "rejected"
        assert row["rejection_reason"] == "test reason — automated"

        pytest.pd_rejected_id = pd_id

    def test_reject_already_reviewed_is_409(self, api, admin_token):
        r = api.post(
            f"{BASE_URL}/api/admin/pending-dances/{pytest.pd_rejected_id}/reject",
            headers=_h(admin_token),
            json={"reason": "second attempt"},
        )
        assert r.status_code == 409, r.text


# ---------------------------- 7. Regression sanity ----------------------------


class TestRegression:
    def test_copperknob_popular_still_works(self, api, user_ctx):
        r = api.get(
            f"{BASE_URL}/api/copperknob/popular",
            headers=_h(user_ctx["token"]),
        )
        assert r.status_code == 200
        assert isinstance(r.json().get("data"), list)

    def test_bootstepper_popular_still_works(self, api, user_ctx):
        r = api.get(
            f"{BASE_URL}/api/bootstepper/popular",
            headers=_h(user_ctx["token"]),
        )
        # Some environments block bootstepper upstream; accept 200 or upstream 502/503.
        assert r.status_code in (200, 502, 503), r.text
        if r.status_code == 200:
            assert isinstance(r.json().get("data"), list) or "results" in r.json()

    def test_public_dances_list_still_works(self, api, user_ctx):
        r = api.get(
            f"{BASE_URL}/api/dances?scope=public&limit=5",
            headers=_h(user_ctx["token"]),
        )
        assert r.status_code == 200
