"""Dance Of The Day route — ``GET /api/dance-of-the-day``.

Returns a tiny envelope with today's featured dance plus the ``source``
hint (``cached | unpracticed | caught_up``) so the home-screen hero
can show a subtle "You've practiced everything — fresh rotation!" tag
when the user is caught up.

If the library has no published dances the response is
``{"dance": null, "source": null}`` and the hero hides itself.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from core.security import get_current_user
from services.dance_of_the_day import pick_for

router = APIRouter()


@router.get("/dance-of-the-day")
async def dance_of_the_day(user: dict = Depends(get_current_user)):
    dance = await pick_for(user["user_id"])
    if not dance:
        return {"dance": None, "source": None}
    source = dance.pop("_dotd_source", None)
    return {"dance": dance, "source": source}
