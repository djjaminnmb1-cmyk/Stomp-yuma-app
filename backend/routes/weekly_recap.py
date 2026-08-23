"""Weekly recap — summary of the caller's dance activity for the current
calendar week (Monday → today).

Powers the celebratory "Weekly Recap" card on Home. Aggregates two
signals so the count feels honest even for members who mostly complete
dances instead of opening Practice Mode:

- ``practice_daily``      — per-day count of Practice Mode opens
- ``tracking``            — status="completed" rows updated this week

Response shape is tuned for a compact home card and avoids paging.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from core.database import db
from core.security import get_current_user

router = APIRouter()


def _week_bounds_utc(now: datetime | None = None) -> tuple[list[str], str]:
    """Return (all_iso_days_in_week, today_iso).

    Week starts on Monday to match how classes are typically scheduled
    in the studio. Days beyond today are still listed so the UI can
    render 7 dots — the counts stay 0 until they occur.
    """
    now = now or datetime.now(timezone.utc)
    today = now.date()
    # Mon=0, Sun=6
    days_since_monday = today.weekday()
    monday = today - timedelta(days=days_since_monday)
    week = [(monday + timedelta(days=i)).isoformat() for i in range(7)]
    return week, today.isoformat()


@router.get("/weekly-recap")
async def weekly_recap(user: dict = Depends(get_current_user)):
    week_days, today_iso = _week_bounds_utc()
    monday = week_days[0]
    sunday = week_days[-1]

    # -------- Practices (Practice Mode opens) --------
    practice_rows = await db.practice_daily.find(
        {
            "user_id": user["user_id"],
            "day": {"$gte": monday, "$lte": sunday},
        },
        {"_id": 0, "day": 1, "count": 1},
    ).to_list(length=7)
    by_day_practice: dict[str, int] = {
        r["day"]: int(r.get("count") or 0) for r in practice_rows
    }

    # -------- Completions (tracking rows updated this week) --------
    # ``updated_at`` is ISO-8601 UTC — lex compare works because the
    # format is fixed-width and TZ-normalised.
    from_ts = f"{monday}T00:00:00"
    to_ts = f"{sunday}T23:59:59.999999+00:00"
    completions = await db.tracking.find(
        {
            "user_id": user["user_id"],
            "status": "completed",
            "updated_at": {"$gte": from_ts, "$lte": to_ts},
        },
        {"_id": 0, "updated_at": 1},
    ).to_list(length=500)
    by_day_complete: dict[str, int] = {}
    for c in completions:
        ts = (c.get("updated_at") or "")[:10]
        if ts in week_days:
            by_day_complete[ts] = by_day_complete.get(ts, 0) + 1

    # -------- Merge into a per-day summary --------
    days_out: list[dict] = []
    for iso in week_days:
        p = by_day_practice.get(iso, 0)
        c = by_day_complete.get(iso, 0)
        days_out.append(
            {
                "date": iso,
                "practices": p,
                "completions": c,
                "count": p + c,
            }
        )

    total_practices = sum(d["practices"] for d in days_out)
    total_completions = sum(d["completions"] for d in days_out)
    total = total_practices + total_completions
    days_active = sum(1 for d in days_out if d["count"] > 0)
    best_day = max(days_out, key=lambda d: d["count"]) if days_out else None

    return {
        "week_start": monday,
        "week_end": sunday,
        "today": today_iso,
        "days": days_out,
        "practices": total_practices,
        "completions": total_completions,
        "total": total,
        "days_active": days_active,
        "best_day": best_day,
    }
