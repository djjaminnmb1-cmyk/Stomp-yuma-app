"""Dance Of The Day route — ``GET /api/dance-of-the-day``.

Returns a tiny envelope with today's featured dance plus the ``source``
hint (``cached | unpracticed | caught_up``) so the home-screen hero
can show a subtle "You've practiced everything — fresh rotation!" tag
when the user is caught up.

If the library has no published dances the response is
``{"dance": null, "source": null}`` and the hero hides itself.

Streak endpoints (June 2026)
----------------------------
* ``GET  /api/dance-of-the-day/streak`` — current + longest + today_done.
* ``POST /api/dance-of-the-day/open``   — credit a hero-tap toward
  the DOTD streak. Body: ``{dance_id}``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.security import get_current_user
from services.dance_of_the_day import pick_for
from services.dotd_streak import get_streak, record_open

router = APIRouter()


@router.get("/dance-of-the-day")
async def dance_of_the_day(user: dict = Depends(get_current_user)):
    dance = await pick_for(user["user_id"])
    if not dance:
        return {"dance": None, "source": None}
    source = dance.pop("_dotd_source", None)
    return {"dance": dance, "source": source}


@router.get("/dance-of-the-day/streak")
async def dotd_streak_read(user: dict = Depends(get_current_user)):
    """Lightweight read for the hero flame indicator. Doesn't bump
    anything — pure projection off the user doc."""
    s = await get_streak(user["user_id"])
    return s


class _OpenBody(BaseModel):
    dance_id: str


@router.post("/dance-of-the-day/open")
async def dotd_open(
    body: _OpenBody, user: dict = Depends(get_current_user)
):
    """Credit the hero tap toward the streak. Pass today's featured
    dance id — the server verifies it against the user's own pick
    so a stale cache can't manufacture streaks.

    Returns ``{streak, newly_earned, dance_matches}``:
    * ``streak`` = ``{current, longest, today_done}``
    * ``newly_earned`` = badges unlocked by this bump (0-N dicts)
    * ``dance_matches`` = False if the submitted id wasn't today's
      pick — in that case nothing changed.
    """
    if not body or not body.dance_id:
        raise HTTPException(400, "dance_id is required")
    out = await record_open(user["user_id"], body.dance_id)
    return out
