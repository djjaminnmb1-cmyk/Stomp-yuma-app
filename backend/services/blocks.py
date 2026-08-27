"""User-blocking helpers.

Blocks are mutual — if A blocks B, neither A nor B sees the other's
messages / activity events / reactions anywhere in the app. This
mirrors the way most modern messaging apps handle it and gives users a
real "make them go away" affordance rather than a one-directional mute.

Data
----
``db.user_blocks`` documents::

    {
      "blocker_id":  str,
      "blocked_id":  str,
      "blocked_email":  str,   # denormalised for the block-list UI
      "blocked_name":   str,
      "created_at":  ISO-8601 str
    }

Indexes are created in ``services/startup.py`` — see ``_ensure_indexes``.
"""
from __future__ import annotations

from core.database import db


async def ensure_indexes() -> None:
    """Idempotent — safe to call at every boot."""
    await db.user_blocks.create_index(
        [("blocker_id", 1), ("blocked_id", 1)], unique=True
    )
    await db.user_blocks.create_index("blocker_id")
    await db.user_blocks.create_index("blocked_id")


async def blocked_by_ids(viewer_id: str) -> set[str]:
    """IDs of users the ``viewer_id`` account has explicitly blocked."""
    if not viewer_id:
        return set()
    return set(
        await db.user_blocks.distinct("blocked_id", {"blocker_id": viewer_id})
    )


async def blocking_me_ids(viewer_id: str) -> set[str]:
    """IDs of users who've blocked ``viewer_id``."""
    if not viewer_id:
        return set()
    return set(
        await db.user_blocks.distinct("blocker_id", {"blocked_id": viewer_id})
    )


async def hidden_user_ids(viewer_id: str) -> set[str]:
    """Union of the two — the set of user_ids whose content should
    disappear entirely from ``viewer_id``'s view.

    Used by chat / feed / reactor lists.
    """
    a = await blocked_by_ids(viewer_id)
    b = await blocking_me_ids(viewer_id)
    return a | b


async def is_blocked_between(a: str, b: str) -> bool:
    """True if either direction of the block exists between two users."""
    if not a or not b or a == b:
        return False
    doc = await db.user_blocks.find_one(
        {
            "$or": [
                {"blocker_id": a, "blocked_id": b},
                {"blocker_id": b, "blocked_id": a},
            ]
        },
        {"_id": 1},
    )
    return doc is not None


async def block_user(
    blocker_id: str,
    blocked_id: str,
    blocked_email: str = "",
    blocked_name: str = "",
) -> dict:
    """Create the block row (idempotent) and mutually-unfollow.

    Auto-unfollow both directions so the block feels clean — being
    blocked shouldn't leave you appearing as a follower on their
    profile, and vice-versa.
    """
    from core.time_helpers import now_iso

    if blocker_id == blocked_id:
        return {"ok": False, "reason": "self-block"}

    await db.user_blocks.update_one(
        {"blocker_id": blocker_id, "blocked_id": blocked_id},
        {
            "$setOnInsert": {
                "blocker_id": blocker_id,
                "blocked_id": blocked_id,
                "created_at": now_iso(),
            },
            "$set": {
                "blocked_email": (blocked_email or "").lower(),
                "blocked_name": blocked_name or "",
            },
        },
        upsert=True,
    )
    # Mutually break the follow graph so the blocked user isn't in
    # your feed (they wouldn't be anyway, but this keeps counts honest).
    try:
        await db.follows.delete_many(
            {
                "$or": [
                    {"follower_id": blocker_id, "followee_id": blocked_id},
                    {"follower_id": blocked_id, "followee_id": blocker_id},
                ]
            }
        )
    except Exception:
        pass
    return {"ok": True}


async def unblock_user(blocker_id: str, blocked_id: str) -> bool:
    res = await db.user_blocks.delete_one(
        {"blocker_id": blocker_id, "blocked_id": blocked_id}
    )
    return bool(res.deleted_count)


async def list_blocks(blocker_id: str) -> list[dict]:
    """Hydrated block list for the "Blocked users" UI."""
    rows = await db.user_blocks.find(
        {"blocker_id": blocker_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    if not rows:
        return []

    # Refresh name/email/picture from the users table so renames /
    # avatar changes stay in sync even if the block row was written
    # months ago.
    ids = [r["blocked_id"] for r in rows]
    profiles: dict[str, dict] = {}
    async for u in db.users.find(
        {"user_id": {"$in": ids}},
        {"_id": 0, "user_id": 1, "email": 1, "name": 1, "picture": 1},
    ):
        profiles[u["user_id"]] = u
    for r in rows:
        p = profiles.get(r["blocked_id"]) or {}
        # Fall back to the denormalised snapshot if the user was deleted.
        r["blocked_email"] = p.get("email") or r.get("blocked_email", "")
        r["blocked_name"] = p.get("name") or r.get("blocked_name", "")
        r["blocked_picture"] = p.get("picture", "")
    return rows


async def purge_user(user_id: str) -> None:
    """Delete every block row that references this user (either side).

    Called from account-deletion so we don't leave dangling references.
    """
    await db.user_blocks.delete_many({"blocker_id": user_id})
    await db.user_blocks.delete_many({"blocked_id": user_id})
