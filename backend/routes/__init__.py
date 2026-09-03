"""Assembles the top-level ``/api`` router from all per-resource routers.

Each ``routes/<resource>.py`` file exposes a ``router`` variable. Ordering
matters here for routes with overlapping paths — specifically the
``routes.dances`` module already lays out its ``/dances/removed`` and
``/dances/restore-by-name`` before ``/dances/{dance_id}`` within itself,
so we only need to include it once here.
"""
from fastapi import APIRouter

from . import (
    admin_refresh_recommendations,
    auth,
    activity,
    admin_bulk_import,
    admin_leaderboard,
    admin_users,
    badges,
    blocks,
    bootstepper,
    bulk_import,
    certificate,
    chat,
    choreographer_follows,
    classes,
    copperknob,
    dances,
    dashboard,
    events,
    external_search,
    feedback,
    instructors,
    leaderboard,
    legal,
    misc,
    notification_prefs,
    prizes,
    push,
    social,
    song_preview,
    suggestions,
    tracking,
    weekly_recap,
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
api_router.include_router(admin_bulk_import.router)
api_router.include_router(admin_users.router)
api_router.include_router(admin_refresh_recommendations.router)
api_router.include_router(feedback.router)
api_router.include_router(dashboard.router)
api_router.include_router(activity.router)
api_router.include_router(certificate.router)
api_router.include_router(badges.router)
api_router.include_router(social.router)
api_router.include_router(choreographer_follows.router)
api_router.include_router(blocks.router)
api_router.include_router(copperknob.router)
api_router.include_router(bootstepper.router)
api_router.include_router(external_search.router)
api_router.include_router(bulk_import.router)
api_router.include_router(events.router)
api_router.include_router(instructors.router)
api_router.include_router(song_preview.router)
api_router.include_router(push.router)
api_router.include_router(notification_prefs.router)
api_router.include_router(weekly_recap.router)
api_router.include_router(legal.router)
api_router.include_router(misc.router)

__all__ = ["api_router"]
