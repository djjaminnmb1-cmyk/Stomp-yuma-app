"""Scheduler + idempotency tests for send_24h_class_reminders.

Directly invokes the scheduled coroutine to verify:
- creates a sent_reminders entry when there's a tomorrow-dated class with attendance
- repeated invocation does NOT create a duplicate (unique index on 'key')
- send_push swallowing upstream 401 does not break the insert
- no-attendance classes do NOT create a reminder row
"""
import os
import sys
import uuid
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
import requests

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://stompin-yuma-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
ERIN_EMAIL = "stompingroundyuma@gmail.com"
ERIN_PASS = "Stompin2026!"


def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def test_scheduler_end_to_end():
    """Combined end-to-end test (single event loop) covering:
    1. tomorrow-dated class with attendance -> exactly one sent_reminders row
    2. second scheduler invocation -> still one row (idempotent)
    3. tomorrow-dated class WITHOUT attendance -> zero rows
    """
    erin_login = _login(ERIN_EMAIL, ERIN_PASS)
    erin_tok = erin_login["token"]

    reg_email = f"TEST_sched_{uuid.uuid4().hex[:8]}@example.com"
    reg = requests.post(
        f"{API}/auth/register",
        json={"email": reg_email, "password": "Passw0rd!", "name": "TEST Sched"},
    )
    assert reg.status_code == 200, reg.text
    reg_tok = reg.json()["token"]

    dances = requests.get(f"{API}/dances").json()
    dance_id = dances[0]["id"]
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")

    # Class A: has attendee
    ra = requests.post(
        f"{API}/classes",
        json={
            "date": tomorrow,
            "session_label": f"TEST_Rem_A_{uuid.uuid4().hex[:6]}",
            "dance_ids": [dance_id],
        },
        headers=_headers(erin_tok),
    )
    assert ra.status_code == 200
    class_a = ra.json()["id"]

    # Class B: no attendees
    rb = requests.post(
        f"{API}/classes",
        json={
            "date": tomorrow,
            "session_label": f"TEST_Rem_B_{uuid.uuid4().hex[:6]}",
            "dance_ids": [dance_id],
        },
        headers=_headers(erin_tok),
    )
    assert rb.status_code == 200
    class_b = rb.json()["id"]

    # Mark attendance for class A only
    att = requests.post(f"{API}/classes/{class_a}/attend", headers=_headers(reg_tok))
    assert att.status_code == 200

    async def scenario():
        # Fresh motor client tied to this loop
        from motor.motor_asyncio import AsyncIOMotorClient
        from server import send_24h_class_reminders
        import server as srv

        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        # Prefer server's configured DB name / URL from env
        db_name = os.environ.get("DB_NAME", srv.db.name)
        local_client = AsyncIOMotorClient(mongo_url)
        local_db = local_client[db_name]

        # Point server.db at loop-local client so send_24h_class_reminders uses this loop
        original_db = srv.db
        srv.db = local_db
        try:
            key_a = f"reminder-24h-{class_a}"
            key_b = f"reminder-24h-{class_b}"
            await local_db.sent_reminders.delete_many({"key": {"$in": [key_a, key_b]}})

            # Run 1
            await send_24h_class_reminders()
            a1 = await local_db.sent_reminders.count_documents({"key": key_a})
            b1 = await local_db.sent_reminders.count_documents({"key": key_b})

            # Run 2 (idempotency)
            await send_24h_class_reminders()
            a2 = await local_db.sent_reminders.count_documents({"key": key_a})
            b2 = await local_db.sent_reminders.count_documents({"key": key_b})

            entry_a = await local_db.sent_reminders.find_one({"key": key_a})

            # Cleanup
            await local_db.sent_reminders.delete_many({"key": {"$in": [key_a, key_b]}})
            return {"a1": a1, "a2": a2, "b1": b1, "b2": b2, "entry_a": entry_a}
        finally:
            srv.db = original_db
            local_client.close()

    try:
        result = asyncio.run(scenario())
        assert result["a1"] == 1, f"Class A should have 1 reminder after first run, got {result['a1']}"
        assert result["a2"] == 1, f"Class A idempotency broken: got {result['a2']} after second run"
        assert result["b1"] == 0, f"Class B (no attendees) should be skipped, got {result['b1']}"
        assert result["b2"] == 0, f"Class B still skipped on second run, got {result['b2']}"
        entry = result["entry_a"]
        assert entry is not None
        assert entry["class_id"] == class_a
        assert entry["recipient_count"] == 1
        assert "sent_at" in entry
    finally:
        requests.delete(f"{API}/classes/{class_a}/attend", headers=_headers(reg_tok))
        requests.delete(f"{API}/classes/{class_a}", headers=_headers(erin_tok))
        requests.delete(f"{API}/classes/{class_b}", headers=_headers(erin_tok))
