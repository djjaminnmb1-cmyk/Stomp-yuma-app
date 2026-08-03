"""Assembles the top-level ``/api`` router from all per-resource routers.

Each ``routes/<resource>.py`` file exposes a ``router`` variable. Ordering
matters here for routes with overlapping paths — specifically the
``routes.dances`` module already lays out its ``/dances/removed`` and
``/dances/restore-by-name`` before ``/dances/{dance_id}`` within itself,
so we only need to include it once here.
"""
from fastapi import APIRouter

from . import (
    auth,
    activity,
    admin_leaderboard,
    chat,
    classes,
    dances,
    dashboard,
    leaderboard,
    misc,
    prizes,
    push,
    song_preview,
    suggestions,
    tracking,
)

api_router = APIRouter(prefix="/api")

# Include each resource router. Order is largely irrelevant since each
# module keeps its own internal ordering, but keeping "misc" last means
# the root probe (`GET /api/`) always sits at the tail of the OpenAPI doc.
api_router.include_router(auth.router)
api_router.include_router(dances.router)
api_router.include_router(tracking.router)
api_router.include_router(classes.router)
api_router.include_router(suggestions.router)
api_router.include_router(chat.router)
api_router.include_router(leaderboard.router)
api_router.include_router(prizes.router)
api_router.include_router(admin_leaderboard.router)
api_router.include_router(dashboard.router)
api_router.include_router(activity.router)
api_router.include_router(song_preview.router)
api_router.include_router(push.router)
api_router.include_router(misc.router)

__all__ = ["api_router"]
