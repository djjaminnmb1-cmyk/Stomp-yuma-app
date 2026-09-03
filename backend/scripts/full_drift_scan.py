"""One-off FULL library drift-scan (not the nightly one-batch scanner).

Iterates EVERY dance in the library that carries a CopperKnob or
BootStepper reference and re-checks upstream metadata against local.
Both sources run concurrently; each source still respects the
per-source ~1 req/sec cap inside ``scan_source`` so upstream stays
happy.

Progress is written to ``db.drift_scan_status`` so ``check-progress``
can be polled from a separate shell while this runs. When the run
finishes, the caller can inspect the flagged dances via the existing
admin UI at ``/admin/refresh-recommendations`` (or hit
``/api/admin/refresh-recommendations``).

Usage
-----
Run detached from an admin shell:

    cd /app/backend && nohup python3 scripts/full_drift_scan.py \\
        > /tmp/full_drift_scan.log 2>&1 &

The script is idempotent — flagging the same drift twice just refreshes
the ``checked_at`` timestamp on the existing row. Safe to rerun.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
import time

# Make sure the parent app package is on the path when invoked as a script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("full_drift_scan")


async def _run() -> None:
    from core.database import db
    from services.refresh_recommendations import (
        ensure_indexes,
        scan_source,
    )

    await ensure_indexes()

    # Baseline counts for the progress doc.
    ck_total = await db.dances.count_documents(
        {"is_published": True, "copperknob_ref": {"$ne": ""}}
    )
    bs_total = await db.dances.count_documents(
        {"is_published": True, "bootstepper_ref": {"$ne": ""}}
    )
    started_at = time.time()

    await db.drift_scan_status.update_one(
        {"_id": "full_scan"},
        {
            "$set": {
                "state": "running",
                "started_at": started_at,
                "ck_total": ck_total,
                "bs_total": bs_total,
            }
        },
        upsert=True,
    )
    logger.info(
        "Full drift scan starting — ck=%s, bs=%s",
        ck_total,
        bs_total,
    )

    # Kick BOTH sources concurrently. Each source's internal loop is
    # already rate-limited to ~1 req/sec so the overall provider load
    # stays at ~1 req/sec/provider. Total wallclock ≈ max(ck, bs).
    #
    # ``limit`` is set well above the actual counts so the scanner
    # naturally exhausts every dance in a single pass. We pass ``500``
    # (the internal ceiling) — if a library grows beyond that we can
    # loop scan_source until it returns zero new checks.
    async def _sweep_source(source: str, target_count: int) -> dict:
        # Loop scan_source() until every dance has been touched
        # at least once during this run. scan_source() sorts by
        # oldest-checked-first, so successive calls naturally advance.
        remaining = target_count
        aggregate = {
            "source": source,
            "checked": 0,
            "flagged": 0,
            "cleared": 0,
        }
        while remaining > 0:
            batch_size = min(500, remaining)
            summary = await scan_source(source, limit=batch_size)
            checked = summary.get("checked", 0)
            aggregate["checked"] += checked
            aggregate["flagged"] += summary.get("flagged", 0)
            aggregate["cleared"] += summary.get("cleared", 0)
            # If the batch under-delivered (upstream errors OR nothing
            # left to check), don't infinite-loop.
            if checked == 0:
                break
            remaining -= checked
            # Periodically bump the progress doc so a live monitor
            # sees the counter advance between batches.
            await db.drift_scan_status.update_one(
                {"_id": "full_scan"},
                {"$set": {f"{source}_progress": aggregate}},
            )
        return aggregate

    ck_task = asyncio.create_task(_sweep_source("copperknob", ck_total))
    bs_task = asyncio.create_task(_sweep_source("bootstepper", bs_total))
    ck_summary, bs_summary = await asyncio.gather(ck_task, bs_task)

    total_flagged = await db.dance_drift_flags.count_documents({})
    unseen = await db.dance_drift_flags.count_documents({"seen": False})
    elapsed = time.time() - started_at

    final = {
        "state": "done",
        "finished_at": time.time(),
        "elapsed_sec": int(elapsed),
        "ck_summary": ck_summary,
        "bs_summary": bs_summary,
        "flags_total": int(total_flagged),
        "flags_unseen": int(unseen),
    }
    await db.drift_scan_status.update_one(
        {"_id": "full_scan"}, {"$set": final}, upsert=True
    )

    logger.info(
        "Full drift scan complete in %.1fm — ck=%s bs=%s "
        "flags_total=%s flags_unseen=%s",
        elapsed / 60,
        ck_summary,
        bs_summary,
        total_flagged,
        unseen,
    )


if __name__ == "__main__":
    asyncio.run(_run())
