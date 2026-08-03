"""Instructor dashboard — community-wide aggregate view.

Roster with per-student completion / wishlist / attendance counts, overview
stats (active students, weekly completions, classes taught), top-completed
dances, and recent classes with attendee counts.

Email is admin-only to reduce PII exposure to plain instructors.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import get_current_user

router = APIRouter()

@router.get("/instructor/dashboard")
async def instructor_dashboard(user: dict = Depends(get_current_user)):
    if not (user.get("is_admin") or user.get("is_instructor")):
        raise HTTPException(403, "Instructor only")

    is_admin = bool(user.get("is_admin"))

    now = datetime.now(timezone.utc)
    week_ago_iso = (now - timedelta(days=7)).isoformat()

    # ---- Overview counts ----
    total_users = await db.users.count_documents({})
    completions_all_time = await db.tracking.count_documents({"status": "completed"})
    completions_last_7d = await db.tracking.count_documents({
        "status": "completed",
        "updated_at": {"$gte": week_ago_iso},
    })
    classes_last_30d = await db.classes.count_documents({
        "date": {"$gte": (now - timedelta(days=30)).strftime("%Y-%m-%d")}
    })
    attendance_records = await db.attendance.count_documents({})

    # Distinct users active in the last 7 days (via tracking updates).
    active_ids = await db.tracking.distinct(
        "user_id", {"updated_at": {"$gte": week_ago_iso}}
    )
    students_last_7d_active = len(active_ids)

    # ---- Top-completed dances (top 10) ----
    top_pipeline = [
        {"$match": {"status": "completed"}},
        {"$group": {"_id": "$dance_id", "completions": {"$sum": 1}}},
        {"$sort": {"completions": -1}},
        {"$limit": 10},
    ]
    top_rows = await db.tracking.aggregate(top_pipeline).to_list(20)
    dance_ids = [r["_id"] for r in top_rows]
    dances = await db.dances.find(
        {"id": {"$in": dance_ids}},
        {"_id": 0, "id": 1, "name": 1, "choreographer": 1, "difficulty": 1, "bpm": 1},
    ).to_list(len(dance_ids) or 1)
    dance_by_id = {d["id"]: d for d in dances}
    top_dances = []
    for r in top_rows:
        d = dance_by_id.get(r["_id"])
        if not d:
            continue
        top_dances.append({
            "dance_id": d["id"],
            "name": d.get("name", ""),
            "choreographer": d.get("choreographer", ""),
            "difficulty": d.get("difficulty", ""),
            "bpm": d.get("bpm"),
            "completions": int(r["completions"]),
        })

    # ---- Per-student roster ----
    # Aggregate completed / wishlist counts + last completion time per user.
    tracking_pipeline = [
        {
            "$group": {
                "_id": {"user_id": "$user_id", "status": "$status"},
                "count": {"$sum": 1},
                "last_updated_at": {"$max": "$updated_at"},
            }
        }
    ]
    tracking_rows = await db.tracking.aggregate(tracking_pipeline).to_list(20000)

    per_user: dict = {}
    for row in tracking_rows:
        uid = row["_id"].get("user_id")
        status = row["_id"].get("status", "")
        if not uid:
            continue
        u = per_user.setdefault(uid, {
            "completed_count": 0,
            "wishlist_count": 0,
            "last_completed_at": "",
            "last_wishlist_at": "",
        })
        if status == "completed":
            u["completed_count"] = int(row["count"])
            u["last_completed_at"] = row.get("last_updated_at", "")
        elif status == "wishlist":
            u["wishlist_count"] = int(row["count"])
            u["last_wishlist_at"] = row.get("last_updated_at", "")

    # Attendance count per user.
    attendance_pipeline = [
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}, "last_at": {"$max": "$class_date"}}},
    ]
    attendance_rows = await db.attendance.aggregate(attendance_pipeline).to_list(20000)
    attendance_by_user = {
        r["_id"]: {"attendance_count": int(r["count"]), "last_class_date": r.get("last_at", "")}
        for r in attendance_rows if r.get("_id")
    }

    # Union of all user IDs (some students may have attendance but no tracking).
    all_uids = set(per_user.keys()) | set(attendance_by_user.keys())
    users_docs = await db.users.find(
        {"user_id": {"$in": list(all_uids)}},
        {
            "_id": 0,
            "user_id": 1,
            "name": 1,
            "email": 1,
            "picture": 1,
            "is_instructor": 1,
            "is_admin": 1,
            "created_at": 1,
        },
    ).to_list(len(all_uids) or 1)

    students: list = []
    for u in users_docs:
        uid = u["user_id"]
        pu = per_user.get(uid, {})
        att = attendance_by_user.get(uid, {})
        last_active = max(
            pu.get("last_completed_at", "") or "",
            pu.get("last_wishlist_at", "") or "",
            att.get("last_class_date", "") or "",
        )
        row: dict = {
            "user_id": uid,
            "name": u.get("name", "") or "(deleted)",
            "picture": u.get("picture", "") or "",
            "is_instructor": bool(u.get("is_instructor") or u.get("is_admin")),
            "completed_count": pu.get("completed_count", 0),
            "wishlist_count": pu.get("wishlist_count", 0),
            "attendance_count": att.get("attendance_count", 0),
            "last_completed_at": pu.get("last_completed_at", "") or "",
            "last_class_date": att.get("last_class_date", "") or "",
            "last_active_at": last_active,
            "joined_at": u.get("created_at", "") or "",
        }
        # Email is admin-only to reduce PII exposure to plain instructors.
        if is_admin:
            row["email"] = u.get("email", "") or ""
        students.append(row)

    # Sort roster by completed count desc, then attendance desc, then name.
    students.sort(
        key=lambda r: (
            -r["completed_count"],
            -r["attendance_count"],
            r["name"].lower(),
        )
    )

    # ---- Recent classes with attendee counts ----
    recent_class_docs = await db.classes.find(
        {}, {"_id": 0, "id": 1, "date": 1, "session_label": 1, "dance_ids": 1}
    ).sort("date", -1).to_list(20)
    class_ids = [c["id"] for c in recent_class_docs]
    att_counts = await db.attendance.aggregate([
        {"$match": {"class_id": {"$in": class_ids}}},
        {"$group": {"_id": "$class_id", "count": {"$sum": 1}}},
    ]).to_list(len(class_ids) or 1)
    att_by_class = {r["_id"]: int(r["count"]) for r in att_counts}
    recent_classes = [
        {
            "id": c["id"],
            "date": c.get("date", ""),
            "label": c.get("session_label", "") or "",
            "dance_count": len(c.get("dance_ids") or []),
            "attendee_count": att_by_class.get(c["id"], 0),
        }
        for c in recent_class_docs
    ]

    return {
        "as_admin": is_admin,
        "overview": {
            "total_students": total_users,
            "students_last_7d_active": students_last_7d_active,
            "classes_last_30d": classes_last_30d,
            "completions_all_time": completions_all_time,
            "completions_last_7d": completions_last_7d,
            "attendance_records": attendance_records,
        },
        "top_dances": top_dances,
        "students": students,
        "recent_classes": recent_classes,
    }


@router.get("/instructor/trend")
async def instructor_trend(
    weeks: int = 8, user: dict = Depends(get_current_user)
):
    """Return weekly rollups of attendance + completions + classes for the
    last ``weeks`` full weeks (default 8), oldest-first so the chart draws
    left-to-right.

    Each entry:
      - ``week_start`` — Monday of that ISO week (YYYY-MM-DD)
      - ``attendance`` — attendance records whose ``class_date`` falls in
        that week
      - ``completions`` — tracking rows with ``status=completed`` whose
        ``updated_at`` falls in that week
      - ``classes`` — classes whose ``date`` falls in that week
    """
    if not (user.get("is_admin") or user.get("is_instructor")):
        raise HTTPException(403, "Instructor only")
    weeks = max(2, min(26, int(weeks or 8)))  # clamp: 2..26 weeks

    now = datetime.now(timezone.utc)
    # Anchor to Monday of the current UTC week.
    today = now.date()
    monday = today - timedelta(days=today.weekday())
    # Build the ``weeks`` most recent Monday-starts in ascending order.
    windows = [monday - timedelta(days=7 * i) for i in range(weeks - 1, -1, -1)]
    # Range covered by the trend (needed for a single fetch).
    range_start = windows[0]
    range_start_iso = datetime(
        range_start.year, range_start.month, range_start.day,
        tzinfo=timezone.utc,
    ).isoformat()
    range_end_iso = (now + timedelta(days=1)).isoformat()

    # Fetch minimal fields — we group in Python for clarity and to avoid
    # asking Mongo to do date arithmetic on ISO strings.
    tracking_rows = await db.tracking.find(
        {
            "status": "completed",
            "updated_at": {"$gte": range_start_iso, "$lte": range_end_iso},
        },
        {"_id": 0, "updated_at": 1},
    ).to_list(50000)

    attendance_rows = await db.attendance.find(
        {"class_date": {"$gte": range_start.strftime("%Y-%m-%d")}},
        {"_id": 0, "class_date": 1},
    ).to_list(50000)

    class_rows = await db.classes.find(
        {"date": {"$gte": range_start.strftime("%Y-%m-%d")}},
        {"_id": 0, "date": 1},
    ).to_list(50000)

    # Pre-seed the bucket dict so weeks with 0 activity still appear.
    buckets: dict[str, dict] = {}
    for m in windows:
        key = m.strftime("%Y-%m-%d")
        buckets[key] = {
            "week_start": key,
            "attendance": 0,
            "completions": 0,
            "classes": 0,
        }

    def _bucket_for_date(d) -> str | None:
        # Round down to that date's Monday
        m = d - timedelta(days=d.weekday())
        key = m.strftime("%Y-%m-%d")
        return key if key in buckets else None

    # Completions (ISO-8601 timestamp string)
    for r in tracking_rows:
        raw = r.get("updated_at", "")
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
        except Exception:
            continue
        k = _bucket_for_date(dt)
        if k:
            buckets[k]["completions"] += 1

    # Attendance / classes (YYYY-MM-DD strings)
    for r in attendance_rows:
        raw = r.get("class_date", "")
        try:
            dt = datetime.strptime(raw, "%Y-%m-%d").date()
        except Exception:
            continue
        k = _bucket_for_date(dt)
        if k:
            buckets[k]["attendance"] += 1
    for r in class_rows:
        raw = r.get("date", "")
        try:
            dt = datetime.strptime(raw, "%Y-%m-%d").date()
        except Exception:
            continue
        k = _bucket_for_date(dt)
        if k:
            buckets[k]["classes"] += 1

    ordered = [buckets[m.strftime("%Y-%m-%d")] for m in windows]
    totals = {
        "attendance": sum(b["attendance"] for b in ordered),
        "completions": sum(b["completions"] for b in ordered),
        "classes": sum(b["classes"] for b in ordered),
    }
    peaks = {
        "attendance": max((b["attendance"] for b in ordered), default=0),
        "completions": max((b["completions"] for b in ordered), default=0),
    }

    return {
        "weeks": ordered,
        "totals": totals,
        "peaks": peaks,
    }
