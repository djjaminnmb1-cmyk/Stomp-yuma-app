"""Password reset token helpers (hashing + TTL indexes)."""
from __future__ import annotations

import hashlib
import logging

from core.database import db

logger = logging.getLogger(__name__)


def hash_reset_token(raw: str) -> str:
    """One-way hash of a reset token so we never store raw tokens in Mongo."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def ensure_reset_indexes() -> None:
    """TTL + lookup indexes for ``password_reset_tokens``.

    Safe to call multiple times; Motor no-ops on duplicate index specs.
    """
    try:
        await db.password_reset_tokens.create_index("token_hash", unique=True)
        await db.password_reset_tokens.create_index(
            "expires_at", expireAfterSeconds=0
        )
        await db.password_reset_tokens.create_index("user_id")
    except Exception as e:
        logger.warning(f"reset indexes: {e}")
