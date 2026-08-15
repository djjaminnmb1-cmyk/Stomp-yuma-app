"""Response serializers.

Central point that shapes the DB docs into the wire format our clients
consume. Keeping these functions here (rather than inside route handlers)
guarantees a consistent shape for a given resource everywhere the app
returns it (dance, user, etc.).
"""
from __future__ import annotations

from typing import Optional

from core.security import user_can_edit_step_sheets


def user_to_out(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "picture": u.get("picture", ""),
        "is_admin": bool(u.get("is_admin")),
        "is_instructor": bool(u.get("is_admin")) or bool(u.get("is_instructor")),
        "can_edit_step_sheets": user_can_edit_step_sheets(u),
        "show_on_leaderboard": bool(u.get("show_on_leaderboard", False)),
        "certificate_theme": u.get("certificate_theme", "classic") or "classic",
        "current_streak": int(u.get("current_streak") or 0),
        "longest_streak": int(u.get("longest_streak") or 0),
        "last_streak_date": u.get("last_streak_date", "") or "",
        "auth_provider": u.get("auth_provider", "email"),
    }


def dance_to_out(d: dict, viewer_user_id: Optional[str] = None) -> dict:
    """Serialise a dance for API responses.

    ``viewer_user_id`` — when supplied, ``created_by`` (a user_id) is only
    echoed back to the owner themselves. All other callers see it as an
    empty string; this prevents leaking internal user_ids on the public
    feed (SEC-005). ``created_by_name`` (display name only) is always
    returned.
    """
    owner_id = d.get("created_by", "") or ""
    show_owner = bool(viewer_user_id and viewer_user_id == owner_id)
    return {
        "id": d["id"],
        "name": d.get("name", ""),
        "choreographer": d.get("choreographer", ""),
        "choreographer_country": d.get("choreographer_country", ""),
        "song": d.get("song", ""),
        "artist": d.get("artist", ""),
        "difficulty": d.get("difficulty", "Beginner"),
        "bpm": d.get("bpm"),
        "count": d.get("count", ""),
        "youtube_url": d.get("youtube_url", ""),
        "step_sheet": d.get("step_sheet", ""),
        "step_sheet_image": d.get("step_sheet_image", ""),
        "description": d.get("description", ""),
        "tags": d.get("tags", []),
        "is_published": bool(d.get("is_published", True)),
        "created_by": owner_id if show_owner else "",
        "created_by_name": d.get("created_by_name", ""),
        "created_at": d.get("created_at", ""),
    }


def youtube_search_url(query: str) -> str:
    q = "+".join(query.strip().split())
    return f"https://www.youtube.com/results?search_query={q}"
