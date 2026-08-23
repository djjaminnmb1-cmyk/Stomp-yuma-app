"""Apple Sign-in identity-token verification.

The mobile client calls ``ExpoAppleAuthentication.signInAsync()`` and
receives an ``identityToken`` — a JWT signed by Apple. We fetch Apple's
public JWKS, verify the token's signature, issuer, audience, and expiry,
and return the claims dict.

Notes
-----
* We deliberately do NOT trust any name/email supplied by the client
  outside the token — those come as a separate payload on the very first
  sign-in and are stored only if the token is otherwise valid.
* JWKS is cached in-memory for 12 h. Apple rotates keys rarely and the
  ``kid`` header steers us to the right one anyway, so a stale cache
  simply causes a one-time refresh.
* ``APPLE_AUDIENCES`` must include BOTH the App Store bundle id AND
  ``host.exp.Exponent`` while we're still testing in Expo Go. In prod
  the standalone build's bundle id will match ``iss``/``aud`` naturally.
"""
from __future__ import annotations

import os
import time
from typing import Optional

import httpx
import jwt
from jwt.algorithms import RSAAlgorithm

APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"

_JWKS_CACHE: dict = {"keys": {}, "fetched_at": 0.0}
_JWKS_TTL_SEC = 12 * 60 * 60  # 12 h


def _audiences() -> list[str]:
    raw = os.environ.get("APPLE_AUDIENCES", "").strip()
    if not raw:
        return []
    return [a.strip() for a in raw.split(",") if a.strip()]


async def _refresh_jwks() -> None:
    """Fetch Apple JWKS and cache the keyed public keys."""
    async with httpx.AsyncClient(timeout=10) as hc:
        r = await hc.get(APPLE_JWKS_URL)
        r.raise_for_status()
        payload = r.json()
    keys: dict = {}
    for jwk in payload.get("keys") or []:
        kid = jwk.get("kid")
        if not kid:
            continue
        # ``RSAAlgorithm.from_jwk`` accepts either a JSON string or dict.
        keys[kid] = RSAAlgorithm.from_jwk(jwk)
    _JWKS_CACHE["keys"] = keys
    _JWKS_CACHE["fetched_at"] = time.time()


async def _public_key_for(kid: str):
    """Return the cached public key for ``kid`` or refresh the cache
    once if it isn't found."""
    key = _JWKS_CACHE["keys"].get(kid)
    stale = time.time() - _JWKS_CACHE["fetched_at"] > _JWKS_TTL_SEC
    if key is None or stale:
        await _refresh_jwks()
        key = _JWKS_CACHE["keys"].get(kid)
    return key


class AppleTokenError(Exception):
    """Raised when the identity token can't be trusted."""


async def verify_identity_token(id_token: str) -> dict:
    """Verify an Apple ``identityToken`` and return the JWT claims.

    Raises ``AppleTokenError`` with a human-readable message on any
    validation failure — the caller should map that to a 401.
    """
    if not id_token or not isinstance(id_token, str):
        raise AppleTokenError("Missing identity token.")
    try:
        header = jwt.get_unverified_header(id_token)
    except Exception as e:
        raise AppleTokenError(f"Malformed token: {e}") from e
    kid = header.get("kid")
    if not kid:
        raise AppleTokenError("Token missing 'kid'.")
    key = await _public_key_for(kid)
    if key is None:
        raise AppleTokenError("Unknown signing key.")
    auds = _audiences()
    if not auds:
        # Fail closed — better to surface a config error than to accept
        # a token that could belong to any Apple app.
        raise AppleTokenError(
            "Server misconfigured: APPLE_AUDIENCES not set."
        )
    try:
        claims = jwt.decode(
            id_token,
            key=key,
            algorithms=["RS256"],
            audience=auds,
            issuer=APPLE_ISSUER,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except jwt.ExpiredSignatureError as e:
        raise AppleTokenError("Apple token expired.") from e
    except jwt.InvalidAudienceError as e:
        raise AppleTokenError(
            "Apple token audience mismatch — check APPLE_AUDIENCES."
        ) from e
    except jwt.InvalidIssuerError as e:
        raise AppleTokenError("Apple token issuer mismatch.") from e
    except jwt.PyJWTError as e:
        raise AppleTokenError(f"Apple token invalid: {e}") from e
    sub = claims.get("sub")
    if not sub:
        raise AppleTokenError("Token missing 'sub'.")
    return claims


__all__ = ["verify_identity_token", "AppleTokenError"]
