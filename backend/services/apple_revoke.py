"""Apple Sign in with Apple — REST-side helpers.

Companion to ``services/apple_auth.py`` (which handles identity-token
verification). This module owns the two REST endpoints Apple exposes
for server-to-server flows:

- ``/auth/token``  — exchange the ``authorizationCode`` we get from
  ``expo-apple-authentication`` on the very first native sign-in for a
  long-lived ``refresh_token``. We persist that refresh token on the
  user doc.
- ``/auth/revoke`` — invalidate the refresh token when the user
  deletes their account. **Required by App Store Guideline 5.1.1(v)**;
  without it Apple rejects apps that offer Sign in with Apple.

Both calls need a per-request ``client_secret`` JWT signed ES256 with
the ``.p8`` private key we downloaded from developer.apple.com. Apple
caps that JWT at ~6 months so we mint a fresh one every call — cheap
and avoids the silent-expiry footgun.

Env vars
--------
- ``APPLE_TEAM_ID``           — 10-char Apple Developer Team ID (JWT ``iss``)
- ``APPLE_KEY_ID``            — 10-char Key ID from the "Sign in with Apple"
  key you registered (JWT ``kid`` header)
- ``APPLE_CLIENT_ID``         — Bundle ID for native iOS sign-in
  (defaults to the first entry in ``APPLE_AUDIENCES``)
- ``APPLE_PRIVATE_KEY_PEM``   — full ``.p8`` PEM contents (multi-line);
  preferred in production
- ``APPLE_PRIVATE_KEY_PEM_B64`` — base64-encoded PEM if your env store
  can't handle newlines; loader decodes automatically
- ``APPLE_PRIVATE_KEY_PATH``  — path to the ``.p8`` file on disk;
  handy for local / preview

If none of the credential trio (team id + key id + private key) is
configured, the helpers no-op with a warning so account-deletion still
succeeds — that keeps the delete flow working even before an operator
finishes the Apple Developer setup.
"""
from __future__ import annotations

import base64
import logging
import os
import time
from typing import Optional

import httpx
import jwt

logger = logging.getLogger(__name__)

APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke"


def _audiences() -> set[str]:
    """Same env-var contract as ``services/apple_auth._audiences`` — kept
    local so we don't create a cross-module import cycle."""
    raw = os.environ.get("APPLE_AUDIENCES", "").strip()
    return {p.strip() for p in raw.split(",") if p.strip()}


class AppleRevokeError(Exception):
    """Raised for unexpected HTTP-level failures against Apple's REST API.

    Missing-config and network hiccups don't raise — they log and the
    caller treats the operation as best-effort. See individual
    functions for their contracts.
    """


def _client_id() -> str:
    """Bundle ID / Services ID used as ``client_id`` in every Apple
    REST call. For native iOS sign-in this IS the bundle ID."""
    explicit = os.environ.get("APPLE_CLIENT_ID", "").strip()
    if explicit:
        return explicit
    # Fall back to the first audience from the existing sign-in config
    # so a single env var covers both flows.
    auds = _audiences()
    return next(iter(auds)) if auds else ""


def _load_private_key_pem() -> Optional[str]:
    """Resolve the ``.p8`` PEM contents from any of three env shapes.

    Priority: raw PEM env var → base64 PEM env var → file path. Returns
    ``None`` if nothing is configured (revocation is opt-in).
    """
    pem = os.environ.get("APPLE_PRIVATE_KEY_PEM", "").strip()
    if pem:
        return pem
    b64 = os.environ.get("APPLE_PRIVATE_KEY_PEM_B64", "").strip()
    if b64:
        try:
            return base64.b64decode(b64).decode("utf-8")
        except Exception:  # pragma: no cover — bad env
            logger.warning("APPLE_PRIVATE_KEY_PEM_B64 is not valid base64")
            return None
    path = os.environ.get("APPLE_PRIVATE_KEY_PATH", "").strip()
    if path and os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:  # pragma: no cover
            logger.warning("Failed to read APPLE_PRIVATE_KEY_PATH=%s: %s", path, e)
    return None


def is_configured() -> bool:
    """Cheap gate used at call sites. Logs at most once per boot."""
    ok = bool(
        os.environ.get("APPLE_TEAM_ID", "").strip()
        and os.environ.get("APPLE_KEY_ID", "").strip()
        and _client_id()
        and _load_private_key_pem()
    )
    if not ok and not _WARNED["once"]:
        logger.warning(
            "Apple REST is not fully configured — account deletion "
            "will delete the local user record but WILL NOT revoke "
            "Apple tokens (App Store 5.1.1(v)). Set APPLE_TEAM_ID + "
            "APPLE_KEY_ID + APPLE_PRIVATE_KEY_PEM (or _PATH) to enable."
        )
        _WARNED["once"] = True
    return ok


# Simple module-scoped once-flag so we don't spam logs on every request.
_WARNED = {"once": False}


def build_client_secret() -> str:
    """Mint a fresh ES256-signed client_secret JWT.

    Apple caps ``exp`` at 6 months but we use 5 minutes — plenty for a
    single POST and safer than caching a long-lived secret. Header
    ``kid`` MUST match the Key ID exactly or Apple returns
    ``invalid_client``.
    """
    team_id = os.environ["APPLE_TEAM_ID"].strip()
    key_id = os.environ["APPLE_KEY_ID"].strip()
    client_id = _client_id()
    pem = _load_private_key_pem() or ""
    now = int(time.time())
    payload = {
        "iss": team_id,
        "iat": now,
        "exp": now + 300,  # 5 minutes — one-shot use
        "aud": "https://appleid.apple.com",
        "sub": client_id,
    }
    return jwt.encode(
        payload,
        pem,
        algorithm="ES256",
        headers={"kid": key_id, "alg": "ES256"},
    )


async def exchange_code_for_refresh_token(
    authorization_code: str,
) -> Optional[str]:
    """POST /auth/token with grant_type=authorization_code.

    Returns the ``refresh_token`` string on success or ``None`` if:
    - Apple credentials aren't configured yet
    - the code is empty / already-used
    - the call fails for any reason

    We swallow errors here so a mis-configured Apple REST setup never
    breaks the user-facing sign-in flow — the identity token has
    already been verified by the caller by the time we get here.
    """
    code = (authorization_code or "").strip()
    if not code or not is_configured():
        return None
    try:
        client_secret = build_client_secret()
    except Exception as e:  # pragma: no cover — bad key material
        logger.warning("Failed to build Apple client_secret JWT: %s", e)
        return None

    data = {
        "client_id": _client_id(),
        "client_secret": client_secret,
        "code": code,
        "grant_type": "authorization_code",
        # No redirect_uri for native flows — Apple accepts its absence
        # when client_id is a bundle ID.
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.post(
                APPLE_TOKEN_URL,
                data=data,
                headers={"content-type": "application/x-www-form-urlencoded"},
            )
        if r.status_code >= 400:
            # Common: ``invalid_grant`` if the code was reused (Apple codes
            # are single-use). Log body only in dev to avoid leaking.
            logger.info(
                "Apple /auth/token returned %s: %s", r.status_code, r.text[:200]
            )
            return None
        j = r.json()
        return (j or {}).get("refresh_token") or None
    except Exception as e:
        logger.warning("Apple /auth/token network error: %s", e)
        return None


async def revoke_refresh_token(refresh_token: str) -> bool:
    """POST /auth/revoke — required on account deletion.

    Returns ``True`` on success (2xx from Apple, or already-revoked)
    and ``False`` on any error. Callers should treat this as
    best-effort: if it fails we still delete the local user record so
    the user isn't stuck, and Apple's server-to-server "consent
    revoked" webhook is the eventual reconciliation path.
    """
    token = (refresh_token or "").strip()
    if not token:
        return False
    if not is_configured():
        return False
    try:
        client_secret = build_client_secret()
    except Exception as e:  # pragma: no cover
        logger.warning("Failed to build Apple client_secret JWT: %s", e)
        return False

    data = {
        "client_id": _client_id(),
        "client_secret": client_secret,
        "token": token,
        "token_type_hint": "refresh_token",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.post(
                APPLE_REVOKE_URL,
                data=data,
                headers={"content-type": "application/x-www-form-urlencoded"},
            )
    except Exception as e:
        logger.warning("Apple /auth/revoke network error: %s", e)
        return False
    if r.status_code == 200:
        return True
    # Apple returns 400 with ``invalid_grant`` if the token was already
    # revoked — treat that as success so re-runs are idempotent.
    body = (r.text or "")[:400]
    if r.status_code == 400 and "invalid_grant" in body:
        return True
    logger.warning(
        "Apple /auth/revoke returned %s: %s", r.status_code, body
    )
    return False
