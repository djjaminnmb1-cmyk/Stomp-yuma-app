"""Test-suite credentials — read from environment, NEVER hard-coded.

The Stompin' Ground Yuma test suite hits the live backend and needs
real logins for the seeded admin / instructor accounts. Baking those
passwords into tracked test files was the second SEC-001 leak the
June-2026 security audit surfaced — every plaintext copy in the repo
is a credential in the wild.

This module is the single source of truth for those values. It reads
each password from the environment (values come from ``backend/.env``,
which is git-ignored) and re-exports plain module constants so tests
can ``from tests._creds import ADMIN_PASSWORD`` and stay ergonomic.

If any variable is missing at import time the corresponding constant
is an empty string; tests that need it either call
``skip_if_missing()`` or let the ``/api/auth/login`` call fail with a
clear "creds unset" assertion — safer than silently substituting a
default. Rotate a password by editing ``backend/.env`` and restarting
the backend; no test file needs to change.
"""
from __future__ import annotations

import os

import pytest
from dotenv import load_dotenv

# Pytest runs from the workspace root; make sure both ``backend/.env``
# (seed passwords) AND ``frontend/.env`` (``EXPO_PUBLIC_BACKEND_URL``
# the tests use to reach the live server) are loaded even when the
# test invocation didn't come via the FastAPI process. Idempotent —
# no-ops if the vars are already set.
_HERE = os.path.dirname(__file__)
load_dotenv(dotenv_path=os.path.join(_HERE, "..", ".env"))
load_dotenv(dotenv_path=os.path.join(_HERE, "..", "..", "frontend", ".env"))


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


# ---- Seeded operator accounts (see core/config.py + services/startup.py) ----
ADMIN_EMAIL = "admin@stompinground.com"
ADMIN_PASSWORD = _env("SEED_PW_ADMIN_STOMPINGROUND_COM")

ERIN_EMAIL = "erinboroughs@gmail.com"
ERIN_PASSWORD = _env("SEED_PW_ERINBOROUGHS_GMAIL_COM")

JAMIN_EMAIL = "luvtowork247@yahoo.com"
JAMIN_PASSWORD = _env("SEED_PW_LUVTOWORK247_YAHOO_COM")


def skip_if_missing(*passwords: str) -> None:
    """Skip the current test if any required password is missing.

    Callers pass the specific ``_PASSWORD`` constants they need, e.g.
    ``skip_if_missing(ADMIN_PASSWORD, ERIN_PASSWORD)``. Missing values
    become a clean pytest skip (not a hard failure) so a partially
    configured CI env doesn't red-splash the whole run.
    """
    if not all(p for p in passwords):
        pytest.skip(
            "Required seed-account password is unset — check backend/.env "
            "(SEED_PW_ADMIN_STOMPINGROUND_COM / "
            "SEED_PW_ERINBOROUGHS_GMAIL_COM / "
            "SEED_PW_LUVTOWORK247_YAHOO_COM)."
        )
