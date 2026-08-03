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
