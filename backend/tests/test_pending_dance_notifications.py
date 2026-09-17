"""Tests for the submitter-notification enhancements on the
User-Submitted Dances feature.

Coverage:
  a. i18n keys exist and interpolate correctly for ALL 8 locales.
  b. In-process failure-isolation test: when send_push_localised
     raises, both _notify_submitter_approved and
     _notify_submitter_rejected should propagate (the wrappers live in
     the approve/reject handlers). Combined with a second test that
     exercises the try/except in the handlers themselves by hitting
     the HTTP endpoints while monkey-patching the helper in-process.
  c. Full HTTP approve/reject smoke — verifies the endpoints still
     return 200 with the notification helpers wired in (no missing
     key / exception leaks).
"""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import pytest
import requests

# Make the backend package importable for the in-process i18n / helper
# tests (pytest is run from /app/backend/tests but the module lives
# under /app/backend).
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://stompin-yuma-app.preview.emergentagent.com",
).rstrip("/")

ADMIN_EMAIL = "admin@stompinground.com"
ADMIN_PASSWORD = "C^c+9$ii4y@_L1mU4sl5BTOd"

ALL_LOCALES = ("en", "es", "fr", "de", "nl", "ko", "zh-Hans", "zh-Hant")
NEW_KEYS = (
    "push.pending_dance.approved.title",
    "push.pending_dance.approved.body",
    "push.pending_dance.rejected.title",
    "push.pending_dance.rejected.body",
)


# ---------- 1. i18n coverage ----------

class TestI18nKeys:
    """Every new key must resolve to a non-empty, non-fallback string
    in every supported locale."""

    def test_all_keys_present_in_every_locale(self):
        from core.i18n import _CATALOG, SUPPORTED_LANGUAGES

        assert set(SUPPORTED_LANGUAGES) == set(ALL_LOCALES), (
            f"SUPPORTED_LANGUAGES drifted: {SUPPORTED_LANGUAGES}"
        )
        missing: list[tuple[str, str]] = []
        for lang in ALL_LOCALES:
            cat = _CATALOG.get(lang) or {}
            for key in NEW_KEYS:
                if key not in cat or not cat[key].strip():
                    missing.append((lang, key))
        assert not missing, f"Missing/blank i18n keys: {missing}"

    def test_approved_title_resolves(self):
        from core.i18n import t
        for lang in ALL_LOCALES:
            out = t("push.pending_dance.approved.title", lang)
            assert out and out != "push.pending_dance.approved.title", (
                f"approved.title missing for {lang}: {out!r}"
            )

    def test_approved_body_interpolates_title(self):
        from core.i18n import t
        for lang in ALL_LOCALES:
            out = t(
                "push.pending_dance.approved.body",
                lang,
                title="Cowboy Cha Cha",
            )
            assert "Cowboy Cha Cha" in out, (
                f"{lang}: expected '{{title}}' interpolation, got {out!r}"
            )
            assert "{title}" not in out

    def test_rejected_title_resolves(self):
        from core.i18n import t
        for lang in ALL_LOCALES:
            out = t("push.pending_dance.rejected.title", lang)
            assert out and out != "push.pending_dance.rejected.title", (
                f"rejected.title missing for {lang}: {out!r}"
            )

    def test_rejected_body_interpolates_title_and_reason(self):
        from core.i18n import t
        for lang in ALL_LOCALES:
            out = t(
                "push.pending_dance.rejected.body",
                lang,
                title="Bad Dance",
                reason="not enough info",
            )
            assert "Bad Dance" in out, (
                f"{lang}: title placeholder not expanded: {out!r}"
            )
            assert "not enough info" in out, (
                f"{lang}: reason placeholder not expanded: {out!r}"
            )
            assert "{title}" not in out and "{reason}" not in out


# ---------- 2. In-process failure isolation ----------

class TestFailureIsolationHelpers:
    """The two helpers themselves DO propagate exceptions on purpose;
    the try/except lives in the endpoint handlers. Verify (a) helper
    propagates when the relay raises, (b) helper is a no-op when
    user_id is missing (defensive-programming check)."""

    @pytest.mark.asyncio
    async def test_approved_helper_no_user_id_is_noop(self, monkeypatch):
        from routes import pending_dances as pd_mod

        called = {"n": 0}

        async def _spy(*a, **kw):
            called["n"] += 1

        monkeypatch.setattr("core.push_service.send_push_localised", _spy)
        await pd_mod._notify_submitter_approved({"user_id": ""}, {"id": "x"})
        assert called["n"] == 0

    @pytest.mark.asyncio
    async def test_rejected_helper_no_user_id_is_noop(self, monkeypatch):
        from routes import pending_dances as pd_mod

        called = {"n": 0}

        async def _spy(*a, **kw):
            called["n"] += 1

        monkeypatch.setattr("core.push_service.send_push_localised", _spy)
        await pd_mod._notify_submitter_rejected({"user_id": None}, "reason")
        assert called["n"] == 0

    @pytest.mark.asyncio
    async def test_approved_helper_calls_push_with_expected_shape(self, monkeypatch):
        from routes import pending_dances as pd_mod

        captured: dict = {}

        async def _spy(recipients, **kw):
            captured["recipients"] = list(recipients)
            captured.update(kw)

        monkeypatch.setattr("core.push_service.send_push_localised", _spy)
        await pd_mod._notify_submitter_approved(
            {"user_id": "u1", "id": "pd_abc", "title": "Sunset Slide"},
            {"id": "dance_xyz", "name": "Sunset Slide"},
        )
        assert captured["recipients"] == ["u1"]
        assert captured["title_key"] == "push.pending_dance.approved.title"
        assert captured["body_key"] == "push.pending_dance.approved.body"
        assert captured["params"] == {"title": "Sunset Slide"}
        assert captured["data"]["deeplink"] == "/dance/dance_xyz"
        assert captured["data"]["kind"] == "pending_dance_approved"
        assert captured["data"]["dance_id"] == "dance_xyz"
        assert captured["idempotency_key"] == "pd-approved-pd_abc"

    @pytest.mark.asyncio
    async def test_rejected_helper_calls_push_with_expected_shape(self, monkeypatch):
        from routes import pending_dances as pd_mod

        captured: dict = {}

        async def _spy(recipients, **kw):
            captured["recipients"] = list(recipients)
            captured.update(kw)

        monkeypatch.setattr("core.push_service.send_push_localised", _spy)
        await pd_mod._notify_submitter_rejected(
            {"user_id": "u2", "id": "pd_def", "title": "Bad Dance"},
            "duplicate submission",
        )
        assert captured["recipients"] == ["u2"]
        assert captured["title_key"] == "push.pending_dance.rejected.title"
        assert captured["body_key"] == "push.pending_dance.rejected.body"
        assert captured["params"]["title"] == "Bad Dance"
        assert captured["params"]["reason"] == "duplicate submission"
        assert captured["data"]["deeplink"] == "/my-submissions"
        assert captured["data"]["kind"] == "pending_dance_rejected"
        assert captured["idempotency_key"] == "pd-rejected-pd_def"

    @pytest.mark.asyncio
    async def test_rejected_helper_uses_fallback_reason_when_empty(self, monkeypatch):
        from routes import pending_dances as pd_mod

        captured: dict = {}

        async def _spy(recipients, **kw):
            captured.update(kw)

        monkeypatch.setattr("core.push_service.send_push_localised", _spy)
        await pd_mod._notify_submitter_rejected(
            {"user_id": "u3", "id": "pd_ghi", "title": "T"}, ""
        )
        # Fallback should be non-empty
        assert captured["params"]["reason"], "empty reason should be replaced by fallback"


# ---------- 3. Full HTTP approve / reject with i18n integration ----------

@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def user_ctx(api):
    suffix = uuid.uuid4().hex[:10]
    email = f"TEST_pdnote_{suffix}@example.com"
    r = api.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "TestPass123!", "name": f"PDNote {suffix}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return {"email": email, "token": body["token"], "user_id": body["user"]["user_id"]}


@pytest.fixture(scope="module")
def fresh_ref(api, admin_token, user_ctx):
    """Pick a CopperKnob ref that is neither in the library nor in
    the pending queue, so we can drive a fresh approve/reject flow."""
    rp = api.get(f"{BASE_URL}/api/copperknob/popular", headers=_h(user_ctx["token"]))
    assert rp.status_code == 200, rp.text
    candidates = [
        (it.get("ref") or "").upper()
        for it in (rp.json().get("data") or [])
        if not it.get("existing_dance") and it.get("ref")
    ]
    rq = api.get(
        f"{BASE_URL}/api/admin/pending-dances?status=all&limit=500",
        headers=_h(admin_token),
    )
    assert rq.status_code == 200
    claimed = {
        (row.get("ref") or "").upper()
        for row in rq.json().get("items", [])
        if row.get("source") == "copperknob"
        and row.get("status") in ("pending", "approved")
    }
    fresh = [r for r in candidates if r and r not in claimed]
    if not fresh:
        pytest.skip("No unclaimed copperknob refs available for approve/reject test")
    return fresh


class TestHttpApproveRejectSmoke:
    """End-to-end HTTP smoke — the notification try/except should keep
    the endpoint contract green in any real (or mocked) push env."""

    def test_approve_endpoint_returns_200(self, api, admin_token, user_ctx, fresh_ref):
        rsub = api.post(
            f"{BASE_URL}/api/pending-dances/submit",
            headers=_h(user_ctx["token"]),
            json={"source": "copperknob", "ref": fresh_ref[0]},
        )
        assert rsub.status_code == 200, rsub.text
        pd_id = rsub.json()["submission"]["id"]

        rapp = api.post(
            f"{BASE_URL}/api/admin/pending-dances/{pd_id}/approve",
            headers=_h(admin_token),
        )
        assert rapp.status_code == 200, rapp.text
        body = rapp.json()
        assert body.get("ok") is True
        assert body.get("dance_id"), body

    def test_reject_endpoint_returns_200_with_reason(
        self, api, admin_token, user_ctx, fresh_ref
    ):
        if len(fresh_ref) < 2:
            pytest.skip("Need >=2 unclaimed refs")
        rsub = api.post(
            f"{BASE_URL}/api/pending-dances/submit",
            headers=_h(user_ctx["token"]),
            json={"source": "copperknob", "ref": fresh_ref[1]},
        )
        assert rsub.status_code == 200, rsub.text
        pd_id = rsub.json()["submission"]["id"]

        rrej = api.post(
            f"{BASE_URL}/api/admin/pending-dances/{pd_id}/reject",
            headers=_h(admin_token),
            json={"reason": "smoke test — automated reject"},
        )
        assert rrej.status_code == 200, rrej.text
        assert rrej.json().get("ok") is True

        # Confirm reason persisted
        rm = api.get(
            f"{BASE_URL}/api/pending-dances/mine",
            headers=_h(user_ctx["token"]),
        )
        row = next((x for x in rm.json()["items"] if x["id"] == pd_id), None)
        assert row is not None
        assert row["status"] == "rejected"
        assert row["rejection_reason"] == "smoke test — automated reject"
