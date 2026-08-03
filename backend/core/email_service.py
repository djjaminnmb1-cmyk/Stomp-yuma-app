"""SMTP email helper.

Password-reset flow is the only in-app consumer today. Body contents
(especially raw reset tokens) MUST NEVER be logged; we log only a
correlation-id so ops can debug delivery failures without leaking secrets.
"""
from __future__ import annotations

import logging
import secrets as _secrets_mod
from email.message import EmailMessage
from typing import Optional

import aiosmtplib

from core.config import (
    SMTP_FROM,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USERNAME,
)

logger = logging.getLogger(__name__)


def _smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD and SMTP_FROM)


async def send_email(
    to: str, subject: str, text: str, html: Optional[str] = None
) -> bool:
    """Best-effort email send via SMTP with STARTTLS.

    Returns True on success. On failure (or when SMTP isn't configured yet),
    logs ONLY a correlation-id so ops can debug without leaking the email
    body (which for password resets includes the raw reset token).
    """
    corr_id = _secrets_mod.token_urlsafe(6)
    if not _smtp_configured():
        logger.warning(
            "[EMAIL:UNCONFIGURED] cid=%s to=%s subject=%r "
            "(body suppressed — contains sensitive tokens; check SMTP_* env vars)",
            corr_id, to, subject,
        )
        return False
    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USERNAME,
            password=SMTP_PASSWORD,
            start_tls=True,
            timeout=15,
        )
        logger.info("[EMAIL:SENT] cid=%s to=%s subject=%r", corr_id, to, subject)
        return True
    except Exception as e:
        # NEVER log the body — password-reset emails carry a working token.
        logger.error(
            "[EMAIL:FAILED] cid=%s to=%s subject=%r err=%s",
            corr_id, to, subject, e,
        )
        return False
