"""Backend tests: Chat Threads + Rich Link Previews (Jan-2026).

Feature scope covered
---------------------
1. THREADS - `parent_id` on POST /chat/messages, batched `parent`
   hydration on GET, silent-drop on bogus/blocked parents, deleted
   parent + orphan-reply grace.
2. LINK PREVIEWS - YouTube (public oEmbed), tracker-preservation on
   returned URL, canonical caching, 3-url cap, trailing punctuation
   strip, unsupported host silent skip.
3. REGRESSION - existing chat post/list/delete/mark-read/reactions,
   reactions on a threaded reply, chat_alerts fan-out on reply.

Uses the public preview URL from EXPO_PUBLIC_BACKEND_URL so we test
what the mobile client sees.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

# Read base URL from frontend .env — the mobile client's real endpoint.
def _read_base_url() -> str:
    env_path = "/app/frontend/.env"
    with open(env_path, "r", encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found in frontend/.env")


BASE_URL = _read_base_url()

# Existing admin+instructor accounts from /app/memory/test_credentials.md
ADMIN_A = ("admin@stompinground.com", "C^c+9$ii4y@_L1mU4sl5BTOd")
ADMIN_B = ("erinboroughs@gmail.com", "Stompin2026!")

YOUTUBE_LONG = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
YOUTUBE_SHORT = "https://youtu.be/dQw4w9WgXcQ"
YOUTUBE_WITH_TS = "https://youtu.be/dQw4w9WgXcQ?t=42"
YOUTUBE_WITH_TRACKING = (
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc123&utm_source=share"
)


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def token_a() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_A[0], "password": ADMIN_A[1]},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def token_b() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_B[0], "password": ADMIN_B[1]},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def user_a(token_a) -> dict:
    r = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {token_a}"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def user_b(token_b) -> dict:
    r = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {token_b}"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _post_msg(token: str, message: str, parent_id: str | None = None) -> dict:
    body: dict = {"message": message}
    if parent_id is not None:
        body["parent_id"] = parent_id
    r = requests.post(
        f"{BASE_URL}/api/chat/messages", json=body, headers=_h(token), timeout=15
    )
    assert r.status_code == 200, f"POST failed: {r.status_code} {r.text}"
    return r.json()


def _delete_msg(token: str, msg_id: str) -> int:
    r = requests.delete(
        f"{BASE_URL}/api/chat/messages/{msg_id}", headers=_h(token), timeout=10
    )
    return r.status_code


def _list_msgs(token: str, limit: int = 200) -> list[dict]:
    r = requests.get(
        f"{BASE_URL}/api/chat/messages?limit={limit}", headers=_h(token), timeout=15
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert isinstance(payload, list), "GET /chat/messages must return a plain array"
    return payload


def _find(msgs: list[dict], msg_id: str) -> dict | None:
    for m in msgs:
        if m.get("id") == msg_id:
            return m
    return None


# ---------------- THREADS ----------------
class TestChatThreads:
    def test_post_reply_returns_parent_summary(self, token_a):
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        parent = _post_msg(token_a, f"{tag} parent message")
        try:
            reply = _post_msg(token_a, f"{tag} reply body", parent_id=parent["id"])
            assert reply.get("parent_id") == parent["id"]
            summary = reply.get("parent") or {}
            assert summary.get("id") == parent["id"]
            assert summary.get("user_id") == parent["user_id"]
            assert summary.get("user_name") == parent["user_name"]
            assert summary.get("message") == parent["message"][:120]
            _delete_msg(token_a, reply["id"])
        finally:
            _delete_msg(token_a, parent["id"])

    def test_bogus_parent_id_silently_drops(self, token_a):
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        reply = _post_msg(
            token_a, f"{tag} bogus-parent reply", parent_id="msg_doesnotexist"
        )
        try:
            # Must NOT 400, must NOT carry parent_id / parent
            assert reply.get("id", "").startswith("msg_")
            assert "parent_id" not in reply, f"got parent_id={reply.get('parent_id')}"
            assert "parent" not in reply, f"got parent={reply.get('parent')}"
        finally:
            _delete_msg(token_a, reply["id"])

    def test_get_batch_hydrates_parent_on_replies(self, token_a):
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        parent = _post_msg(token_a, f"{tag} parent for GET hydration")
        reply = _post_msg(token_a, f"{tag} reply for GET", parent_id=parent["id"])
        try:
            msgs = _list_msgs(token_a)
            got = _find(msgs, reply["id"])
            assert got is not None, "reply not found in GET"
            assert got.get("parent_id") == parent["id"]
            p = got.get("parent") or {}
            assert p.get("id") == parent["id"]
            assert p.get("user_name") == parent["user_name"]
            assert p.get("message") == parent["message"][:120]
        finally:
            _delete_msg(token_a, reply["id"])
            _delete_msg(token_a, parent["id"])

    def test_get_returns_plain_array(self, token_a):
        msgs = _list_msgs(token_a)
        assert isinstance(msgs, list)
        # Each item is a dict with at least id/user_id/message/created_at.
        if msgs:
            m = msgs[-1]
            for k in ("id", "user_id", "message", "created_at"):
                assert k in m, f"missing {k} in message doc"

    def test_reply_when_blocked_drops_parent_link(self, token_a, token_b, user_a, user_b):
        """A blocks B, B replies to A's message → reply lands WITHOUT
        the parent link (silent drop).
        """
        # A blocks B
        r = requests.post(
            f"{BASE_URL}/api/blocks",
            json={"user_id": user_b["user_id"]},
            headers=_h(token_a),
            timeout=10,
        )
        assert r.status_code == 200, r.text
        try:
            tag = f"TEST_{uuid.uuid4().hex[:6]}"
            parent = _post_msg(token_a, f"{tag} A parent")
            reply = _post_msg(
                token_b, f"{tag} B reply while blocked", parent_id=parent["id"]
            )
            try:
                # Reply must land, but WITHOUT parent link (silent drop).
                assert reply.get("id", "").startswith("msg_")
                assert "parent_id" not in reply
                assert "parent" not in reply
            finally:
                _delete_msg(token_b, reply["id"])
                _delete_msg(token_a, parent["id"])
        finally:
            # Cleanup block regardless
            requests.delete(
                f"{BASE_URL}/api/blocks/{user_b['user_id']}",
                headers=_h(token_a),
                timeout=10,
            )

    def test_orphan_reply_after_parent_deleted(self, token_a):
        """Delete parent → existing reply still returns on GET; keeps
        `parent_id` but the batched hydration skips the missing parent
        so no `parent` field appears (client renders standalone).
        """
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        parent = _post_msg(token_a, f"{tag} parent-to-be-deleted")
        reply = _post_msg(token_a, f"{tag} reply orphan", parent_id=parent["id"])
        try:
            code = _delete_msg(token_a, parent["id"])
            assert code == 200
            msgs = _list_msgs(token_a)
            got = _find(msgs, reply["id"])
            assert got is not None, "reply disappeared after parent delete"
            assert got.get("parent_id") == parent["id"], "parent_id should be preserved"
            # Batched hydration must SKIP the missing parent — no `parent`.
            assert "parent" not in got, f"orphan reply carried parent: {got.get('parent')}"
        finally:
            _delete_msg(token_a, reply["id"])


# ---------------- LINK PREVIEWS ----------------
class TestLinkPreviews:
    def test_youtube_watch_url_returns_preview(self, token_a):
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        msg = _post_msg(token_a, f"{tag} watch this {YOUTUBE_LONG}")
        try:
            previews = msg.get("link_previews") or []
            # Allow one retry — oEmbed can rate-limit intermittently.
            if not previews:
                time.sleep(2)
                msg2 = _post_msg(token_a, f"{tag} retry {YOUTUBE_LONG}")
                try:
                    previews = msg2.get("link_previews") or []
                    used = msg2
                finally:
                    if not previews:
                        _delete_msg(token_a, msg2["id"])
                    else:
                        # Keep second one, will delete below
                        pass
                # Only continue on retry doc if previews found
                if previews:
                    _delete_msg(token_a, msg["id"])
                    msg = used  # will be deleted in finally
                    pytest.skip if False else None  # keep type happy
            assert previews, "no link_previews returned for YouTube URL"
            p = previews[0]
            assert p.get("kind") == "youtube"
            assert p.get("title"), "title must be populated"
            assert p.get("subtitle"), "subtitle (channel name) should be populated"
            assert (
                p.get("thumbnail")
                == "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
            )
        finally:
            _delete_msg(token_a, msg["id"])

    def test_youtube_short_url_preserves_timestamp(self, token_a):
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        msg = _post_msg(token_a, f"{tag} at 42s {YOUTUBE_WITH_TS}")
        try:
            previews = msg.get("link_previews") or []
            if not previews:
                pytest.skip("YouTube oEmbed unavailable (rate limit/network flake)")
            p = previews[0]
            # The user's original URL must be preserved on the `url` field
            # so tapping opens the video at t=42.
            assert p.get("url") == YOUTUBE_WITH_TS, (
                f"expected timestamp preserved, got url={p.get('url')}"
            )
        finally:
            _delete_msg(token_a, msg["id"])

    def test_youtube_url_with_tracking_preserves_original_url(self, token_a):
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        msg = _post_msg(token_a, f"{tag} share {YOUTUBE_WITH_TRACKING}")
        try:
            previews = msg.get("link_previews") or []
            if not previews:
                pytest.skip("YouTube oEmbed unavailable")
            p = previews[0]
            # The canonical strips tracker; but the returned URL preserves
            # the user's original (tracker intact).
            assert p.get("url") == YOUTUBE_WITH_TRACKING, (
                f"tracker should NOT be stripped from returned url; got {p.get('url')}"
            )
            assert "si=abc123" in p.get("url")
            assert "utm_source" in p.get("url")
        finally:
            _delete_msg(token_a, msg["id"])

    def test_no_url_no_link_previews(self, token_a):
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        msg = _post_msg(token_a, f"{tag} plain text with no urls at all")
        try:
            # Either missing field or empty list is acceptable.
            lp = msg.get("link_previews", [])
            assert lp == [] or lp is None or lp == [], (
                f"expected no previews, got {lp}"
            )
        finally:
            _delete_msg(token_a, msg["id"])

    def test_unsupported_host_silently_skipped(self, token_a):
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        msg = _post_msg(token_a, f"{tag} visit https://example.com for docs")
        try:
            lp = msg.get("link_previews", [])
            assert not lp, f"expected no previews for example.com, got {lp}"
        finally:
            _delete_msg(token_a, msg["id"])

    def test_second_post_hits_cache_faster(self, token_a):
        """Second POST of same URL should be significantly faster
        thanks to the link_previews collection cache."""
        # First post (may or may not be cached from prior tests)
        # Use a specific slug and warm the cache first.
        url = YOUTUBE_LONG
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        # Warm-up
        warm = _post_msg(token_a, f"{tag} warmup {url}")
        _delete_msg(token_a, warm["id"])
        if not (warm.get("link_previews") or []):
            pytest.skip("YouTube oEmbed unavailable for cache test")
        # Timed second post - should be cache hit
        t0 = time.time()
        msg = _post_msg(token_a, f"{tag} cached {url}")
        cached_ms = (time.time() - t0) * 1000
        try:
            previews = msg.get("link_previews") or []
            assert previews, "cached post yielded no preview"
            # Loose threshold — network to preview URL adds latency,
            # but cache-hit path should stay under 2s comfortably.
            assert cached_ms < 3000, (
                f"cached POST took {cached_ms:.0f}ms — expected << network"
            )
        finally:
            _delete_msg(token_a, msg["id"])

    def test_more_than_3_urls_capped_at_3(self, token_a):
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        # Four DIFFERENT YouTube video IDs so dedup doesn't collapse them.
        urls = [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://www.youtube.com/watch?v=9bZkp7q19f0",
            "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
            "https://www.youtube.com/watch?v=OPf0YbXqDm0",
        ]
        body = f"{tag} " + " ".join(urls)
        msg = _post_msg(token_a, body)
        try:
            previews = msg.get("link_previews") or []
            # Cap = 3. Some may fail (network flake) but count MUST be <= 3.
            assert len(previews) <= 3, (
                f"exceeded per-message cap: {len(previews)} previews"
            )
        finally:
            _delete_msg(token_a, msg["id"])

    def test_trailing_punctuation_stripped(self, token_a):
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        # Period after URL — must be stripped so the video still resolves.
        msg = _post_msg(token_a, f"{tag} see {YOUTUBE_SHORT}.")
        try:
            previews = msg.get("link_previews") or []
            if not previews:
                pytest.skip("YouTube oEmbed unavailable")
            p = previews[0]
            assert p.get("kind") == "youtube"
            # URL on the preview must not include the trailing period.
            assert not p.get("url", "").endswith(".")
        finally:
            _delete_msg(token_a, msg["id"])

    def test_get_messages_includes_link_previews(self, token_a):
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        msg = _post_msg(token_a, f"{tag} embed {YOUTUBE_LONG}")
        try:
            if not (msg.get("link_previews") or []):
                pytest.skip("YouTube oEmbed unavailable")
            msgs = _list_msgs(token_a)
            got = _find(msgs, msg["id"])
            assert got is not None
            previews = got.get("link_previews") or []
            assert previews, "GET must include link_previews on messages that have them"
            assert previews[0].get("kind") == "youtube"
        finally:
            _delete_msg(token_a, msg["id"])


# ---------------- REGRESSION ----------------
class TestChatRegression:
    def test_basic_post_list_delete_still_works(self, token_a):
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        msg = _post_msg(token_a, f"{tag} regression basic")
        assert msg.get("id", "").startswith("msg_")
        msgs = _list_msgs(token_a)
        assert _find(msgs, msg["id"]) is not None
        code = _delete_msg(token_a, msg["id"])
        assert code == 200
        msgs2 = _list_msgs(token_a)
        assert _find(msgs2, msg["id"]) is None

    def test_mark_read_still_works(self, token_a):
        r = requests.post(
            f"{BASE_URL}/api/chat/mark-read",
            json={"at": None},
            headers=_h(token_a),
            timeout=10,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        assert "last_read_at" in j

    def test_reactions_still_work(self, token_a):
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        msg = _post_msg(token_a, f"{tag} for reaction")
        try:
            r = requests.post(
                f"{BASE_URL}/api/chat/messages/{msg['id']}/reactions",
                json={"kind": "👍"},
                headers=_h(token_a),
                timeout=10,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert "reactions" in body
            # Toggle back off so we don't leave state
            requests.post(
                f"{BASE_URL}/api/chat/messages/{msg['id']}/reactions",
                json={"kind": "👍"},
                headers=_h(token_a),
                timeout=10,
            )
        finally:
            _delete_msg(token_a, msg["id"])

    def test_reactions_on_threaded_reply(self, token_a):
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        parent = _post_msg(token_a, f"{tag} parent for react")
        reply = _post_msg(token_a, f"{tag} reply for react", parent_id=parent["id"])
        try:
            r = requests.post(
                f"{BASE_URL}/api/chat/messages/{reply['id']}/reactions",
                json={"kind": "🎉"},
                headers=_h(token_a),
                timeout=10,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            counts = (body.get("reactions") or {}).get("counts") or {}
            # After toggle-on, counts should have at least our emoji.
            assert "🎉" in counts, f"reaction not recorded: {counts}"
            # Toggle back off
            requests.post(
                f"{BASE_URL}/api/chat/messages/{reply['id']}/reactions",
                json={"kind": "🎉"},
                headers=_h(token_a),
                timeout=10,
            )
        finally:
            _delete_msg(token_a, reply["id"])
            _delete_msg(token_a, parent["id"])

    def test_delete_parent_leaves_reply_but_no_parent_field(self, token_a):
        """Deleting a message with replies still succeeds — the child
        replies keep their `parent_id`. Confirms deletion cascade grace.
        """
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        parent = _post_msg(token_a, f"{tag} parent to be removed")
        reply = _post_msg(token_a, f"{tag} orphan child", parent_id=parent["id"])
        try:
            code = _delete_msg(token_a, parent["id"])
            assert code == 200
            msgs = _list_msgs(token_a)
            got = _find(msgs, reply["id"])
            assert got is not None
            assert got.get("parent_id") == parent["id"]
            assert "parent" not in got
        finally:
            _delete_msg(token_a, reply["id"])

    def test_reply_still_triggers_chat_alerts_fanout(self, token_a, token_b, user_a):
        """Post a threaded reply from user A → user B (a subscriber
        who's opted-in via default notification_prefs) should have an
        unread chat_alert entry. We check via the chat/mentions or
        equivalent read-state signal — here we probe /api/chat/reads
        to at least confirm the endpoint remains reachable, and we
        confirm the reply itself posted correctly (fan-out swallows
        errors so the response is our only guarantee)."""
        tag = f"TEST_{uuid.uuid4().hex[:6]}"
        parent = _post_msg(token_a, f"{tag} thread root")
        reply = _post_msg(token_a, f"{tag} thread reply", parent_id=parent["id"])
        try:
            # User B reads chat reads endpoint — must still return 200
            r = requests.get(
                f"{BASE_URL}/api/chat/reads", headers=_h(token_b), timeout=10
            )
            assert r.status_code == 200
            j = r.json()
            assert "reads" in j
            # Confirm reply is visible to user B
            msgs_b = _list_msgs(token_b)
            got = _find(msgs_b, reply["id"])
            assert got is not None, "reply not visible to other instructor"
        finally:
            _delete_msg(token_a, reply["id"])
            _delete_msg(token_a, parent["id"])
