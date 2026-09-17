"""Instructor-only chat: post/list/delete messages.

Message visibility respects user blocks — if A has blocked B (or B has
blocked A), neither sees the other's messages in the list. Deletes and
posts are unaffected: a blocked user can still post to the room, they
just become invisible to whoever's blocked them.

@mention fan-out: chat posts are parsed for ``@name`` tokens; each
resolved user is written to ``chat_mentions`` and receives a push.
See ``services/chat_mentions.py`` for the parser + push logic.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import db
from core.security import get_current_user, require_instructor
from core.time_helpers import now_iso
from models.schemas import ChatMessageIn
from services.blocks import hidden_user_ids
from services.chat_mentions import (
    fan_out_mentions,
    list_for_user as list_mentions_for_user,
    mark_seen as mark_mentions_seen,
    unread_count as chat_mentions_unread_count,
)
from services.chat_notifications import fan_out_chat_post
from services.chat_reactions import (
    ensure_indexes as ensure_chat_reaction_indexes,  # noqa: F401 — kept for startup
    purge_message as purge_message_reactions,
    summarize_for_messages as summarize_reactions,
    toggle as toggle_chat_reaction,
)
from services.chat_reads import (
    mark_read as chat_mark_read,
    read_state_for_room as chat_read_state,
)
from services.link_previews import preview_for_message


def _parent_summary(doc: dict) -> dict:
    """Trim a parent message down to just what the reply bubble needs
    to render its "replying to …" strip. Keeps the payload small and
    keeps deletion cascades simple — deleting a parent only breaks
    the strip, not the reply itself.
    """
    if not doc:
        return {}
    return {
        "id": doc.get("id") or "",
        "user_id": doc.get("user_id") or "",
        "user_name": doc.get("user_name") or "",
        # 120 chars is enough for a preview line without wrapping on a
        # phone screen. The full text is still one tap away.
        "message": (doc.get("message") or "")[:120],
    }

router = APIRouter()


@router.get("/chat/messages")
async def list_chat(
    instructor: dict = Depends(require_instructor), limit: int = 200
):
    """Return chat with blocked users' posts filtered out.

    We over-fetch a little when a block list exists so a viewer with
    many blocks doesn't end up with a suspiciously short room. Cap is
    still ``limit`` after filtering.
    """
    hidden = await hidden_user_ids(instructor["user_id"])
    lim = max(1, min(int(limit or 200), 500))

    if hidden:
        query = {"user_id": {"$nin": list(hidden)}}
        # Over-fetch by (blocked-count + 20%) so the returned page stays
        # near ``limit`` even if the room has a spammy blocked poster.
        fetch = min(500, lim + max(20, len(hidden) * 4))
    else:
        query = {}
        fetch = lim

    docs = (
        await db.instructor_messages.find(query, {"_id": 0})
        .sort("created_at", -1)
        .to_list(fetch)
    )
    docs = docs[:lim]
    docs = list(reversed(docs))  # oldest → newest

    # Reaction summary — one aggregate over the visible window so the
    # chat bubbles can render their emoji chips without a per-message
    # round-trip. Empty buckets are omitted so the payload stays lean.
    msg_ids = [d["id"] for d in docs if d.get("id")]
    if msg_ids:
        buckets = await summarize_reactions(msg_ids, instructor["user_id"])
        for d in docs:
            r = buckets.get(d.get("id") or "")
            if r:
                d["reactions"] = r

    # Thread hydration — a reply carries ``parent_id`` on the wire;
    # we hydrate a compact ``parent`` snippet in ONE batched find so
    # every reply can render "replying to X: …" without per-message
    # round-trips. Blocked-parent replies still render the parent
    # (the parent is by the caller's blocker, but ledgering the reply
    # made it visible earlier so hiding the parent now would just
    # confuse the strip).
    #
    # Defense-in-depth: any ``parent`` field that slipped through from
    # an older POST-time persist (pre-fix) is stripped up-front, so
    # the only source of truth for the strip is the live parent doc.
    for d in docs:
        d.pop("parent", None)
    parent_ids = [d.get("parent_id") for d in docs if d.get("parent_id")]
    if parent_ids:
        # Dedup — a lively thread will have many replies pointing at
        # the same parent.
        parent_ids = list({p for p in parent_ids if p})
        parents_by_id: dict[str, dict] = {}
        async for p in db.instructor_messages.find(
            {"id": {"$in": parent_ids}},
            {"_id": 0, "id": 1, "user_id": 1, "user_name": 1, "message": 1},
        ):
            pid = p.get("id")
            if pid:
                parents_by_id[pid] = _parent_summary(p)
        for d in docs:
            pid = d.get("parent_id")
            if pid and pid in parents_by_id:
                d["parent"] = parents_by_id[pid]

    # Link-preview backfill — messages posted BEFORE link-preview
    # existed, or whose fetcher was flaky at post time, will have
    # ``link_previews`` missing. Retry now against the shared cache
    # so a later poll upgrades the card silently. Only fires for
    # messages without a preview and only when the text contains at
    # least one supported URL, so the common no-links case is a
    # no-op.
    for d in docs:
        if d.get("link_previews") is not None:
            continue
        if "://" not in (d.get("message") or ""):
            continue  # cheap short-circuit — most messages have no URL
        try:
            previews = await preview_for_message(d.get("message") or "")
            if previews:
                d["link_previews"] = previews
                # Persist for next poll so we don't re-resolve.
                await db.instructor_messages.update_one(
                    {"id": d["id"]},
                    {"$set": {"link_previews": previews}},
                )
        except Exception:
            pass
    return docs


# ---------------- Read receipts ----------------
@router.get("/chat/reads")
async def get_chat_reads(
    instructor: dict = Depends(require_instructor),
):
    """Return every instructor / admin's ``last_read_at`` timestamp so
    the client can render "seen by …" avatar rows.

    Piggybacks the same 6s poll the chat feed already runs. Users with
    no ``chat_reads`` row (never opened the room) return
    ``last_read_at=""`` so the client can show them as "hasn't caught
    up".
    """
    reads = await chat_read_state()
    return {"reads": reads, "count": len(reads)}


class MarkChatReadBody(BaseModel):
    at: Optional[str] = None  # ISO timestamp of the newest visible msg


@router.post("/chat/mark-read")
async def post_mark_chat_read(
    body: MarkChatReadBody,
    instructor: dict = Depends(require_instructor),
):
    """Bump the caller's chat ``last_read_at`` marker.

    Called by the chat screen when it mounts, whenever a new inbound
    message appears while the tab is focused, and on the "scroll to
    bottom" tap. Idempotent + monotonic — ``mark_read`` never rewinds
    the pointer, so a background poll can't clobber a fresher UI
    read.
    """
    persisted = await chat_mark_read(instructor["user_id"], at=body.at)
    return {"ok": True, "last_read_at": persisted}


@router.post("/chat/messages")
async def post_chat(
    inp: ChatMessageIn, instructor: dict = Depends(require_instructor)
):
    text = (inp.message or "").strip()
    if not text:
        raise HTTPException(400, "Empty message")
    # Apple UGC 1.2: pre-insert content filter. Blocks obvious slurs,
    # threats, sexual solicitation, and spam patterns BEFORE the row
    # lands in the DB. Admins are NOT exempt — the filter is agnostic
    # of role.
    from services import content_filter
    verdict = content_filter.check(text)
    if not verdict.ok:
        content_filter.log_block(
            user_id=instructor["user_id"],
            category=verdict.category or "unknown",
            detail=verdict.detail,
            surface="chat",
        )
        raise HTTPException(
            400,
            {
                "code": "content_blocked",
                "message": verdict.message,
                "category": verdict.category,
            },
        )
    doc = {
        "id": f"msg_{uuid.uuid4().hex[:10]}",
        "user_id": instructor["user_id"],
        "user_name": instructor.get("name", ""),
        "message": text[:2000],
        "created_at": now_iso(),
    }
    # Thread parent — best-effort. If the parent doesn't exist or the
    # caller has blocked its author (or vice versa), we drop the link
    # rather than 400 the whole POST. The reply still lands as a
    # normal message so the user's typing isn't lost.
    #
    # We store ONLY ``parent_id`` on the doc — the ``parent`` snippet
    # is re-hydrated at read time from the current parent state. This
    # keeps orphaned replies (whose parent was later deleted) from
    # returning a stale summary, and keeps a parent's edits reflected
    # in every reply's strip.
    parent_snippet: Optional[dict] = None
    if inp.parent_id:
        parent = await db.instructor_messages.find_one(
            {"id": inp.parent_id},
            {"_id": 0, "id": 1, "user_id": 1, "user_name": 1, "message": 1},
        )
        if parent:
            hidden = await hidden_user_ids(instructor["user_id"])
            if parent.get("user_id") not in hidden:
                doc["parent_id"] = parent["id"]
                # Keep the snippet for the IMMEDIATE POST response so
                # the poster's UI can render the strip without a
                # follow-up GET. Not persisted.
                parent_snippet = _parent_summary(parent)
    # Link previews — pre-resolve now so the composer's message shows
    # cards immediately for the poster (and every reader in the next
    # 6s poll). Best-effort; oEmbed / BootStepper / CopperKnob
    # failures leave the message intact without cards.
    try:
        previews = await preview_for_message(doc["message"])
        if previews:
            doc["link_previews"] = previews
    except Exception:
        pass
    await db.instructor_messages.insert_one(doc)
    doc.pop("_id", None)
    # Fan-out @mentions — best-effort. Runs INLINE so a follower who's
    # actively in the app on a slow network still sees the ledger row
    # by the time they tap the push. If the resolver misfires the
    # helper swallows the error rather than blocking the send.
    mentioned: list[str] = []
    try:
        mentioned = await fan_out_mentions(
            text=doc["message"],
            mentioner_id=instructor["user_id"],
            mentioner_name=instructor.get("name", ""),
            message_id=doc["id"],
        )
        if mentioned:
            doc["mentioned_user_ids"] = mentioned
    except Exception:
        pass
    # Fan-out "someone posted" push to everyone else in the room who
    # hasn't opted out via ``notification_prefs.chat_alerts``. Users
    # already notified by the mention fan-out above are skipped so a
    # single ``@Erin nice one!`` never buzzes Erin twice.
    try:
        await fan_out_chat_post(
            message_id=doc["id"],
            message_text=doc["message"],
            poster_user_id=instructor["user_id"],
            poster_name=instructor.get("name", ""),
            already_notified=mentioned,
        )
    except Exception:
        # Never let a push flake break the POST — chat still returns
        # the fresh doc so the poster sees their message immediately.
        pass
    # Attach the parent snippet to the RESPONSE only — not persisted,
    # so a later deletion of the parent leaves the reply as a
    # standalone message (see the GET hydration for the read-time
    # story).
    if parent_snippet:
        doc["parent"] = parent_snippet
    return doc


@router.delete("/chat/messages/{msg_id}")
async def delete_chat(
    msg_id: str, instructor: dict = Depends(require_instructor)
):
    doc = await db.instructor_messages.find_one({"id": msg_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if doc["user_id"] != instructor["user_id"] and not instructor.get("is_admin"):
        raise HTTPException(403, "Not allowed")
    await db.instructor_messages.delete_one({"id": msg_id})
    # Cascade — a deleted bubble shouldn't leave orphan reaction rows.
    await purge_message_reactions(msg_id)
    return {"ok": True}


# ---------------- Reactions ----------------
class ReactionBody(BaseModel):
    kind: str  # short emoji token, e.g. "👍" or "🎉"


@router.post("/chat/messages/{msg_id}/reactions")
async def post_react(
    msg_id: str,
    body: ReactionBody,
    instructor: dict = Depends(require_instructor),
):
    """Toggle an emoji reaction for the caller on this message.

    Idempotent under retry — a duplicate add just flips back to
    removed. Blocked users still can't be reacted-to (they don't show
    up in the caller's chat list at all, so ``msg_id`` would 404).
    """
    doc = await db.instructor_messages.find_one({"id": msg_id}, {"_id": 0, "user_id": 1})
    if not doc:
        raise HTTPException(404, "Not found")
    # Respect blocks — if the message author blocked the caller (or
    # vice versa), don't let a reaction sneak through as an
    # ambient signal that the caller is still there.
    hidden = await hidden_user_ids(instructor["user_id"])
    if doc.get("user_id") in hidden:
        raise HTTPException(404, "Not found")
    result = await toggle_chat_reaction(
        message_id=msg_id,
        kind=body.kind,
        user_id=instructor["user_id"],
        user_name=instructor.get("name", ""),
    )
    # Return the fresh summary for JUST this message so the client can
    # re-render its chip row in a single call.
    buckets = await summarize_reactions([msg_id], instructor["user_id"])
    return {**result, "reactions": buckets.get(msg_id, {"counts": {}, "mine": []})}


# ---------------- @mentions (recipient view) ----------------
@router.get("/chat/mentions/me")
async def get_my_mentions(
    limit: int = Query(default=40, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    """List the caller's chat mentions, most recent first.

    Available to ANY authenticated user — students / dancers who
    aren't in the chat room still receive mentions and can view
    them from the "My mentions" screen. The chat room itself
    remains gated behind ``require_instructor``.
    """
    rows = await list_mentions_for_user(user["user_id"], limit=limit)
    unread = await chat_mentions_unread_count(user["user_id"])
    return {
        "mentions": rows,
        "count": len(rows),
        "unread_count": unread,
    }


class MarkMentionsSeenBody(BaseModel):
    mention_ids: Optional[list[str]] = None


@router.post("/chat/mentions/mark-seen")
async def post_mark_mentions_seen(
    body: MarkMentionsSeenBody,
    user: dict = Depends(get_current_user),
):
    """Flip ``seen=True`` for the passed mention ids (or ALL of the
    caller's unread mentions if the list is None / empty)."""
    updated = await mark_mentions_seen(user["user_id"], body.mention_ids)
    return {"ok": True, "updated": int(updated)}
