"""One-shot full library verification + auto-sync.

Wraps ``services/dance_library_sync.sync_library``. Also snapshots the
current ``dances`` collection to a timestamped backup so an admin can
roll back if the sync produces unexpected results.

Usage
-----

    cd /app/backend && nohup python3 scripts/full_verify_and_sync.py \\
        > /tmp/full_verify_and_sync.log 2>&1 &

Watch progress via ``db.dance_sync_status._id="full_sync"`` and the
final audit trail in ``db.dance_sync_log``.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("full_verify_and_sync")


async def _run() -> None:
    from core.database import db
    from services.dance_library_sync import ensure_indexes, sync_library

    await ensure_indexes()

    # Snapshot the current dances collection so an admin can roll
    # back if the auto-applied changes ever look wrong. Timestamp is
    # UTC-based to sort chronologically in Compass.
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    snapshot_coll = f"dances_backup_{ts}"
    logger.info("Snapshotting dances → %s", snapshot_coll)
    started = time.time()
    docs = await db.dances.find({}).to_list(length=100000)
    if docs:
        await db[snapshot_coll].insert_many(docs)
    logger.info(
        "Snapshot done (%d docs in %.1fs). Starting sync…",
        len(docs),
        time.time() - started,
    )

    summary = await sync_library(dry_run=False)
    logger.info("Final summary: %s", summary)


if __name__ == "__main__":
    asyncio.run(_run())
