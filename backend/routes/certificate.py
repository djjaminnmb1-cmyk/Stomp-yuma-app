"""PDF certificate of completion.

Streams a warm-branded 1-page landscape PDF for a specific dance the caller
has marked as completed. Design language matches the app's celebrate
screen — burnt-orange border, cream background, serif type — so users get
a fridge-worthy keepsake that clearly ties back to Stompin' Ground Yuma.

Design notes:
- Generated server-side with ReportLab (pure Python, no system deps),
  which gives us total control over the layout and identical output
  across iOS / Android / web.
- The PDF is streamed, not persisted — regenerating is deterministic from
  the (user, dance, completion date) triple, and the payload is tiny
  (~30-50KB) so caching isn't worth the storage cost.
- A rate limit prevents an attacker from using the endpoint as a
  server-side rendering CPU sink.
"""
from __future__ import annotations

import io
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from reportlab.lib import colors as rl_colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Image, Paragraph

from pydantic import BaseModel

from core.database import db
from core.rate_limit import client_ip, throttle_check
from core.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------- Themes ----------------
# Each theme is a small immutable dict of ReportLab HexColor values. Adding
# a new theme is a matter of dropping one more entry here — the renderer
# reads every color from the ``theme`` dict passed in, so no other code has
# to change.
#
# ``primary``   — main headline / dance-title color; also the inner border
# ``secondary`` — recipient name + studio eyebrow color
# ``accent``    — border outline + milestone strip + underline flourishes
# ``bg``        — page background (subtle warm off-white per theme)
# ``ink``       — body text color (dark, high-contrast)
def _theme(primary: str, secondary: str, accent: str, bg: str, ink: str) -> dict:
    return {
        "primary": rl_colors.HexColor(primary),
        "secondary": rl_colors.HexColor(secondary),
        "accent": rl_colors.HexColor(accent),
        "bg": rl_colors.HexColor(bg),
        "ink": rl_colors.HexColor(ink),
    }


THEMES: dict[str, dict] = {
    # Classic — the app's core warm palette (burnt-orange + gold on cream).
    "classic": _theme(
        primary="#8B2E1E",     # burnt-orange
        secondary="#1D3B87",   # deep blue eyebrow / recipient script
        accent="#F2A628",      # gold border + accents
        bg="#FBF3E4",          # cream page
        ink="#2A1F18",         # cocoa body ink
    ),
    # Mardi Gras — regal purple + gold + green celebratory palette.
    "mardi_gras": _theme(
        primary="#5D267D",     # rich royal purple
        secondary="#0F7B5A",   # emerald green
        accent="#F2C230",      # king-cake gold
        bg="#FEF7E0",          # warm parchment
        ink="#2C1637",         # deep aubergine
    ),
    # Desert Sunset — warm dusk gradient palette (coral, apricot, dusty rose).
    "desert_sunset": _theme(
        primary="#C34A2C",     # deep terracotta
        secondary="#8B5E3C",   # dusty adobe brown
        accent="#F49E4C",      # peach / apricot
        bg="#FFF3E3",          # sun-bleached sand
        ink="#3B1F14",         # sunset shadow
    ),
}
DEFAULT_THEME = "classic"

# ReportLab ships with Times & Helvetica by default — perfect for a warm
# certificate. If a TTF is added later (e.g. Playfair), it'd be registered
# here inside a try/except so a missing font never crashes the endpoint.
BODY_FONT = "Times-Roman"
BODY_FONT_BOLD = "Times-Bold"
SCRIPT_FONT = "Times-Italic"

# Where the studio logo lives; copied to /app/backend/assets on deploy.
_LOGO_PATH = Path(__file__).parent.parent / "assets" / "logo.png"


def _draw_ornamental_border(
    c: canvas.Canvas, width: float, height: float, theme: dict
) -> None:
    """Two nested rounded rectangles, accent outer + primary inner —
    reads as a proper certificate frame without being fussy."""
    outer_inset = 22
    inner_inset = 32
    # Accent (usually gold-ish) outer
    c.setStrokeColor(theme["accent"])
    c.setLineWidth(4)
    c.roundRect(
        outer_inset,
        outer_inset,
        width - 2 * outer_inset,
        height - 2 * outer_inset,
        10,
        stroke=1,
        fill=0,
    )
    # Primary color inner
    c.setStrokeColor(theme["primary"])
    c.setLineWidth(1.2)
    c.roundRect(
        inner_inset,
        inner_inset,
        width - 2 * inner_inset,
        height - 2 * inner_inset,
        7,
        stroke=1,
        fill=0,
    )
    # Small corner ornaments (four tiny accent-colored diamonds)
    corner_offset = 44
    c.setFillColor(theme["accent"])
    for (cx, cy) in [
        (corner_offset, corner_offset),
        (width - corner_offset, corner_offset),
        (corner_offset, height - corner_offset),
        (width - corner_offset, height - corner_offset),
    ]:
        c.saveState()
        c.translate(cx, cy)
        c.rotate(45)
        c.rect(-4, -4, 8, 8, stroke=0, fill=1)
        c.restoreState()


def _format_completion_date(iso: str) -> str:
    """Turn '2026-06-15T13:42:11+00:00' into 'June 15, 2026'.
    Falls back to today if the string is empty/malformed."""
    try:
        dt = datetime.fromisoformat((iso or "").replace("Z", "+00:00"))
    except Exception:
        dt = datetime.utcnow()
    return dt.strftime("%B %-d, %Y") if hasattr(dt, "strftime") else dt.isoformat()


def _milestone_label(count: int) -> str:
    """Cheerful, human milestone descriptor matching the celebrate screen."""
    if count <= 0:
        return "One for the record books."
    if count == 1:
        return "Your first completed dance!"
    if count in (5, 10, 25, 50, 100):
        return f"{count} dances mastered — a bona fide milestone!"
    if count > 100 and count % 25 == 0:
        return f"{count} dances — legendary."
    if count % 10 == 0:
        return f"{count} dances down — keep it rollin'."
    return f"That's {count} dances mastered."


async def _resolve_instructor_signature() -> str:
    """Prefer Erin's display name for the signature line (studio owner);
    fall back to the first whitelisted step-sheet editor, then a generic."""
    for email in ("erinboroughs@gmail.com", "luvtowork247@yahoo.com"):
        doc = await db.users.find_one({"email": email}, {"_id": 0, "name": 1})
        if doc and doc.get("name"):
            return doc["name"]
    return "Stompin' Ground Yuma"


def _sanitize_filename(name: str) -> str:
    """ASCII-safe filename fragment for the Content-Disposition header."""
    keep = []
    for ch in (name or ""):
        if ch.isalnum():
            keep.append(ch)
        elif ch in (" ", "-", "_"):
            keep.append("_")
    out = "".join(keep).strip("_")
    return (out[:60] or "certificate").lower()


@router.get("/certificate/{dance_id}")
async def get_certificate(
    dance_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
    # Optional palette override. Falls back to the caller's stored
    # preference (``users.certificate_theme``), then to ``classic``.
    # Unknown values silently reset to ``classic`` so a stale client can't
    # break the endpoint.
    theme: Optional[str] = Query(default=None),
):
    """Return a downloadable PDF certificate for a dance the caller has
    marked completed. 404 if they haven't completed it (or the dance
    doesn't exist)."""
    # Rate limit: generous but not unlimited — 30 PDFs / 5 min per user
    # covers a legitimate "batch-download my whole My Dances tab" burst
    # without opening a CPU-sink surface.
    ok, retry = throttle_check(
        f"cert:{user['user_id']}", max_hits=30, window_sec=5 * 60
    )
    if not ok:
        raise HTTPException(
            429,
            f"Whoa there — please wait {int(retry)}s before generating another certificate.",
        )
    # Secondary per-IP throttle blocks shared-account abuse.
    ip = client_ip(request)
    ok2, retry2 = throttle_check(
        f"cert-ip:{ip}", max_hits=120, window_sec=5 * 60
    )
    if not ok2:
        raise HTTPException(
            429, f"Too many certificate requests — try again in {int(retry2)}s.",
        )

    # Verify the user completed this dance.
    tracking = await db.tracking.find_one(
        {
            "user_id": user["user_id"],
            "dance_id": dance_id,
            "status": "completed",
        },
        {"_id": 0},
    )
    if not tracking:
        # Same 404 for "no such dance" and "not completed yet" — nothing to
        # gain by disclosing which case we're in.
        raise HTTPException(404, "No certificate available for this dance.")

    dance = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not dance:
        raise HTTPException(404, "No certificate available for this dance.")

    # Count total completions for a milestone flourish.
    total_completed = await db.tracking.count_documents(
        {"user_id": user["user_id"], "status": "completed"}
    )
    signature_name = await _resolve_instructor_signature()
    completion_iso = tracking.get("updated_at", "") or ""

    # Resolve final theme: explicit ?theme= wins, else user's stored pref,
    # else the default. Unknown themes silently fall back so a stale client
    # can't 400 out.
    theme_key = (theme or user.get("certificate_theme") or DEFAULT_THEME).strip().lower()
    theme_palette = THEMES.get(theme_key) or THEMES[DEFAULT_THEME]

    pdf_bytes = _render_certificate(
        recipient_name=user.get("name") or user.get("email", "").split("@")[0] or "A Line Dancer",
        dance_name=dance.get("name", "a line dance"),
        choreographer=dance.get("choreographer", "") or "",
        difficulty=dance.get("difficulty", "") or "",
        completed_at=completion_iso,
        total_count=int(total_completed or 0),
        signature_name=signature_name,
        theme=theme_palette,
    )

    filename = (
        f"sgy_certificate_"
        f"{_sanitize_filename(dance.get('name', 'dance'))}.pdf"
    )
    headers = {
        # Force download in browsers; native shares will just save/preview.
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
    }
    logger.info(
        "certificate generated for user=%s dance=%s (count=%d)",
        user.get("email"), dance_id, total_completed,
    )
    return StreamingResponse(
        io.BytesIO(pdf_bytes), media_type="application/pdf", headers=headers
    )


@router.get("/certificate-themes")
async def list_certificate_themes():
    """Public: return the list of certificate themes for the client picker.
    Each theme carries its palette so the client can render a live preview
    without needing to hard-code the colors.
    """
    out = []
    labels = {
        "classic": "Classic",
        "mardi_gras": "Mardi Gras",
        "desert_sunset": "Desert Sunset",
    }
    for key, palette in THEMES.items():
        # Convert ReportLab Color objects back to hex strings for the client
        def _hex(color) -> str:
            r, g, b = int(color.red * 255), int(color.green * 255), int(color.blue * 255)
            return f"#{r:02X}{g:02X}{b:02X}"

        out.append({
            "key": key,
            "label": labels.get(key, key.replace("_", " ").title()),
            "colors": {name: _hex(palette[name]) for name in ("primary", "secondary", "accent", "bg", "ink")},
        })
    return {"themes": out, "default": DEFAULT_THEME}


@router.patch("/users/me/certificate-theme")
async def set_certificate_theme(
    body: dict, user: dict = Depends(get_current_user)
):
    """Save the caller's preferred certificate theme to their profile.

    Body: ``{ "theme": "classic" | "mardi_gras" | "desert_sunset" }``.
    Invalid themes → 400. Silently no-ops if the value already matches.
    """
    key = str((body or {}).get("theme", "")).strip().lower()
    if key not in THEMES:
        raise HTTPException(400, f"Unknown theme. Choose one of: {', '.join(THEMES.keys())}")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"certificate_theme": key}},
    )
    return {"ok": True, "theme": key}


def _render_certificate(
    *,
    recipient_name: str,
    dance_name: str,
    choreographer: str,
    difficulty: str,
    completed_at: str,
    total_count: int,
    signature_name: str,
    theme: dict,
) -> bytes:
    """Return the PDF payload as bytes. Pure function — trivial to unit-test
    without hitting the DB. ``theme`` is one of the palette dicts from
    ``THEMES`` (fall back to ``THEMES[DEFAULT_THEME]`` if unknown)."""
    buf = io.BytesIO()
    page_size = landscape(letter)
    width, height = page_size
    c = canvas.Canvas(buf, pagesize=page_size)

    # -------- Background --------
    c.setFillColor(theme["bg"])
    c.rect(0, 0, width, height, stroke=0, fill=1)

    # -------- Ornamental border --------
    _draw_ornamental_border(c, width, height, theme)

    # -------- Studio logo (top-center) --------
    if _LOGO_PATH.exists():
        try:
            logo_w = 72
            logo_h = 72
            c.drawImage(
                str(_LOGO_PATH),
                (width - logo_w) / 2,
                height - 100,
                width=logo_w,
                height=logo_h,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception as e:  # ImageReader can raise on bad file; degrade gracefully
            logger.warning("certificate logo render failed: %s", e)

    # -------- Eyebrow (studio name) --------
    c.setFillColor(theme["secondary"])
    c.setFont(BODY_FONT_BOLD, 11)
    c.drawCentredString(width / 2, height - 118, "STOMPIN' GROUND YUMA")

    # -------- Main title --------
    c.setFillColor(theme["primary"])
    c.setFont(BODY_FONT_BOLD, 38)
    c.drawCentredString(width / 2, height - 168, "Certificate of Completion")

    # Decorative divider (accent-colored line)
    c.setStrokeColor(theme["accent"])
    c.setLineWidth(1.8)
    divider_w = 220
    c.line(
        (width - divider_w) / 2,
        height - 190,
        (width + divider_w) / 2,
        height - 190,
    )

    # -------- Presentation preamble --------
    c.setFillColor(theme["ink"])
    c.setFont(BODY_FONT, 14)
    c.drawCentredString(
        width / 2, height - 220, "This certifies that"
    )

    # -------- Recipient name (script-ish) --------
    c.setFillColor(theme["secondary"])
    c.setFont(SCRIPT_FONT, 34)
    # Auto-fit long names: shrink font if the drawn width would exceed
    # 80% of page width (so the name never overflows the frame).
    display_name = (recipient_name or "").strip() or "A Line Dancer"
    max_name_width = width * 0.8
    font_size = 34
    while (
        pdfmetrics.stringWidth(display_name, SCRIPT_FONT, font_size) > max_name_width
        and font_size > 20
    ):
        font_size -= 1
        c.setFont(SCRIPT_FONT, font_size)
    c.drawCentredString(width / 2, height - 262, display_name)

    # Underline for the recipient
    text_w = pdfmetrics.stringWidth(display_name, SCRIPT_FONT, font_size)
    c.setStrokeColor(theme["accent"])
    c.setLineWidth(0.8)
    c.line(
        (width - text_w) / 2 - 4,
        height - 268,
        (width + text_w) / 2 + 4,
        height - 268,
    )

    # -------- Middle paragraph --------
    c.setFillColor(theme["ink"])
    c.setFont(BODY_FONT, 14)
    c.drawCentredString(
        width / 2, height - 302, "has successfully learned and completed the line dance"
    )

    # -------- Dance title --------
    c.setFillColor(theme["primary"])
    c.setFont(BODY_FONT_BOLD, 26)
    display_dance = f"\u201C{dance_name}\u201D"
    dance_font_size = 26
    while (
        pdfmetrics.stringWidth(display_dance, BODY_FONT_BOLD, dance_font_size)
        > width * 0.85
        and dance_font_size > 16
    ):
        dance_font_size -= 1
        c.setFont(BODY_FONT_BOLD, dance_font_size)
    c.drawCentredString(width / 2, height - 344, display_dance)

    # Choreographer + difficulty line
    if choreographer or difficulty:
        c.setFillColor(theme["ink"])
        c.setFont(BODY_FONT, 12)
        parts = []
        if choreographer:
            parts.append(f"Choreography by {choreographer}")
        if difficulty:
            parts.append(f"{difficulty} level")
        c.drawCentredString(width / 2, height - 366, "  \u00b7  ".join(parts))

    # -------- Milestone strip --------
    c.setFillColor(theme["accent"])
    c.setFont(BODY_FONT_BOLD, 12)
    c.drawCentredString(
        width / 2, height - 400, _milestone_label(total_count).upper()
    )

    # -------- Bottom row: date + signature --------
    bottom_y = 78
    # Signature block (right)
    sig_x_center = width * 0.72
    c.setStrokeColor(theme["ink"])
    c.setLineWidth(0.6)
    c.line(sig_x_center - 90, bottom_y + 22, sig_x_center + 90, bottom_y + 22)
    c.setFillColor(theme["ink"])
    c.setFont(SCRIPT_FONT, 16)
    c.drawCentredString(sig_x_center, bottom_y + 26, signature_name)
    c.setFont(BODY_FONT, 10)
    c.drawCentredString(sig_x_center, bottom_y + 6, "Line Dance Instructor")

    # Date block (left)
    date_x_center = width * 0.28
    c.line(date_x_center - 90, bottom_y + 22, date_x_center + 90, bottom_y + 22)
    c.setFont(BODY_FONT_BOLD, 14)
    c.drawCentredString(date_x_center, bottom_y + 26, _format_completion_date(completed_at))
    c.setFont(BODY_FONT, 10)
    c.drawCentredString(date_x_center, bottom_y + 6, "Date of Completion")

    # -------- Footer eyebrow --------
    c.setFillColor(theme["secondary"])
    c.setFont(BODY_FONT, 9)
    c.drawCentredString(
        width / 2, 44,
        "Yuma, Arizona  \u00b7  All ages welcome  \u00b7  stompinground.yuma",
    )

    c.showPage()
    c.save()
    return buf.getvalue()
