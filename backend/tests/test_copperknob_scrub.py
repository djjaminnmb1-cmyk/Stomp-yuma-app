"""
Verification tests for the CopperKnob scrub / step_sheet normalization migration.

Checks:
1. GET /api/dances returns 507 dances.
2. No dance step_sheet contains 'copperknob' (case-insensitive).
3. No dance step_sheet contains 'copperknob.co.uk'.
4. Every dance has a non-empty choreographer.
5. Every dance has a non-empty song.
6. Stompin' Ground dance has Erin Boroughs + DJ Jamin credits, movement summary,
   no 'copperknob' mention and no dangling 'Official step sheet:' line.
7. At least one dance uses the canonical clean placeholder text.
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for local runs - read frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass

CANONICAL_PLACEHOLDER = (
    "Step sheet not yet uploaded to this dance. Instructors can attach the "
    "official printable image via the dance detail page — tap Edit next to Step Sheet."
)


@pytest.fixture(scope="module")
def dances():
    assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL is required"
    resp = requests.get(f"{BASE_URL}/api/dances", timeout=30)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:200]}"
    data = resp.json()
    # Support both list and paginated shapes
    if isinstance(data, dict) and "dances" in data:
        return data["dances"]
    return data


class TestDanceCount:
    def test_dance_count_is_507(self, dances):
        assert len(dances) == 507, f"Expected 507 dances, got {len(dances)}"


class TestNoCopperKnobReferences:
    def test_no_copperknob_substring_anywhere(self, dances):
        offenders = []
        for d in dances:
            step = (d.get("step_sheet") or "")
            if "copperknob" in step.lower():
                offenders.append(d.get("name"))
        assert not offenders, f"Dances still mention copperknob: {offenders[:20]}"

    def test_no_copperknob_url(self, dances):
        offenders = []
        for d in dances:
            step = (d.get("step_sheet") or "")
            if "copperknob.co.uk" in step.lower():
                offenders.append(d.get("name"))
        assert not offenders, f"Dances still link copperknob.co.uk: {offenders[:20]}"


class TestMetadataPresent:
    def test_every_dance_has_choreographer(self, dances):
        missing = [d.get("name") for d in dances if not (d.get("choreographer") or "").strip()]
        assert not missing, f"Dances missing choreographer ({len(missing)}): {missing[:20]}"

    def test_every_dance_has_song(self, dances):
        missing = [d.get("name") for d in dances if not (d.get("song") or "").strip()]
        assert not missing, f"Dances missing song ({len(missing)}): {missing[:20]}"


class TestStompinGround:
    def _get(self, dances):
        for d in dances:
            if d.get("name") == "Stompin' Ground":
                return d
        pytest.fail("Stompin' Ground dance not found")

    def test_has_erin_credit(self, dances):
        step = (self._get(dances).get("step_sheet") or "")
        assert re.search(r"Erin Boroughs", step, re.IGNORECASE), \
            f"Erin Boroughs credit missing. step_sheet={step[:300]}"

    def test_has_dj_jamin_credit(self, dances):
        step = (self._get(dances).get("step_sheet") or "")
        assert re.search(r"DJ\s*Jamin", step, re.IGNORECASE), \
            f"DJ Jamin credit missing. step_sheet={step[:300]}"

    def test_has_movement_summary(self, dances):
        step = (self._get(dances).get("step_sheet") or "").lower()
        # movement summary keywords like grapevine/kick/step/turn
        has_movement = any(k in step for k in ["grapevine", "kick", "step", "turn", "shuffle", "count"])
        assert has_movement, f"Movement summary keywords missing. step_sheet={step[:300]}"

    def test_no_copperknob_in_stompin(self, dances):
        step = (self._get(dances).get("step_sheet") or "")
        assert "copperknob" not in step.lower()

    def test_no_dangling_official_step_sheet_line(self, dances):
        step = (self._get(dances).get("step_sheet") or "")
        # dangling means a line 'Official step sheet:' with nothing/whitespace after it (or on its own line)
        assert not re.search(r"Official step sheet:\s*$", step, re.MULTILINE), \
            f"Dangling 'Official step sheet:' line present. step_sheet={step!r}"


class TestCanonicalPlaceholder:
    def test_placeholder_present_in_some_dance(self, dances):
        matches = [d.get("name") for d in dances if (d.get("step_sheet") or "").strip() == CANONICAL_PLACEHOLDER]
        assert len(matches) >= 1, (
            f"Canonical placeholder not found in any dance. Sample step_sheets: "
            f"{[(d.get('name'), (d.get('step_sheet') or '')[:80]) for d in dances[:5]]}"
        )

    def test_placeholder_present_in_many_dances(self, dances):
        # Expected roughly ~350
        matches = [d for d in dances if (d.get("step_sheet") or "").strip() == CANONICAL_PLACEHOLDER]
        # Just informational; assert lower bound
        assert len(matches) >= 100, f"Expected ~350 dances with canonical placeholder, got {len(matches)}"
