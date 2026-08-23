#!/usr/bin/env python3
"""Discover which collections differ between preview and production.

Read-only. Never writes. Prints a comparison table + a JSON dump you
can hand to the sync script.

Usage
-----
    python3 discover_diff.py
    python3 discover_diff.py --prod-url 'mongodb+srv://...'
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient

PREVIEW_URL_DEFAULT = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
PREVIEW_DB_DEFAULT = os.environ.get("DB_NAME", "test_database")
PROD_URL_DEFAULT = os.environ.get("PROD_MONGO_URL", "")

# Collections that are safe to bulk-sync — pure app content, curated
# by admins, no per-user data. Everything else should be reviewed
# case-by-case.
CONTENT_COLLECTIONS: set[str] = {
    "dances",
    "class_recaps",
    "venue_info",
    "badges",
    "dance_categories",
}


async def find_app_db(client: AsyncIOMotorClient) -> str:
    dbs = await client.list_database_names()
    ranked: list[tuple[str, int]] = []
    for name in dbs:
        if name in ("admin", "local", "config"):
            continue
        cols = await client[name].list_collection_names()
        if "dances" in cols or "users" in cols:
            n = await client[name].list_collection_names()
            ranked.append((name, len(n)))
    if not ranked:
        raise RuntimeError(
            f"No app DB with 'dances' or 'users' found. Available: {dbs}"
        )
    ranked.sort(key=lambda x: -x[1])
    return ranked[0][0]


async def snapshot(client: AsyncIOMotorClient, db_name: str) -> dict[str, Any]:
    dbo = client[db_name]
    cols = await dbo.list_collection_names()
    snap: dict[str, Any] = {}
    for c in sorted(cols):
        n = await dbo[c].count_documents({})
        sample_ids: list[str] = []
        # Peek at a few ids to check if collection uses the app's ``id``
        # field for dedup. Skip system collections (start with 'system.').
        if not c.startswith("system."):
            async for row in dbo[c].find({}, {"_id": 0, "id": 1}).limit(3):
                if row.get("id"):
                    sample_ids.append(row["id"])
        snap[c] = {"count": n, "sample_ids": sample_ids, "has_id_field": bool(sample_ids)}
    return snap


async def main(args: argparse.Namespace) -> int:
    if not args.prod_url:
        print(
            "ERROR: no production URL provided. Set PROD_MONGO_URL or use "
            "--prod-url.",
            file=sys.stderr,
        )
        return 2

    print("=" * 74)
    print(" Preview ↔ Production collection diff (READ-ONLY, no writes)")
    print("=" * 74)

    preview = AsyncIOMotorClient(args.preview_url, serverSelectionTimeoutMS=10000)
    prod = AsyncIOMotorClient(args.prod_url, serverSelectionTimeoutMS=15000)

    try:
        await preview.admin.command("ping")
    except Exception as e:
        print(f"✖ preview ping failed: {e}")
        return 3
    try:
        await prod.admin.command("ping")
    except Exception as e:
        print(f"✖ production ping failed: {e}")
        print("  Check the Atlas Network Access allowlist for this IP.")
        return 3

    prod_db = args.prod_db or await find_app_db(prod)
    print(f"  Preview DB:    {args.preview_db}")
    print(f"  Production DB: {prod_db}\n")

    pre_snap = await snapshot(preview, args.preview_db)
    pro_snap = await snapshot(prod, prod_db)

    all_names = sorted(set(pre_snap) | set(pro_snap))
    header = f"  {'Collection':<28} {'Preview':>10} {'Prod':>10} {'Δ (P-P)':>10}   Class"
    print(header)
    print("  " + "-" * (len(header) - 2))
    diff_report: list[dict[str, Any]] = []
    for name in all_names:
        if name.startswith("system."):
            continue
        pre_n = pre_snap.get(name, {}).get("count", 0)
        pro_n = pro_snap.get(name, {}).get("count", 0)
        delta = pre_n - pro_n
        cls = (
            "CONTENT ✔"
            if name in CONTENT_COLLECTIONS
            else "user-data ⚠"
        )
        marker = "  "
        if delta > 0:
            marker = "→ "  # preview has more
        elif delta < 0:
            marker = "← "  # prod has more
        print(
            f"  {marker}{name:<26} {pre_n:>10} {pro_n:>10} {delta:>+10}   {cls}"
        )
        diff_report.append(
            {
                "collection": name,
                "preview_count": pre_n,
                "prod_count": pro_n,
                "delta": delta,
                "content_safe": name in CONTENT_COLLECTIONS,
                "preview_has_id_field": pre_snap.get(name, {}).get("has_id_field", False),
            }
        )

    print()
    # Recommended sync list
    to_sync = [d for d in diff_report if d["content_safe"] and d["delta"] > 0]
    if to_sync:
        print("  RECOMMENDED CONTENT SYNC (preview → production):")
        for d in to_sync:
            print(
                f"    - {d['collection']:<20} would insert up to "
                f"{d['delta']} new docs (dedup by 'id')"
            )
    else:
        print("  No content collections have preview > prod. Nothing to sync.")

    review = [
        d for d in diff_report
        if not d["content_safe"] and d["delta"] != 0
    ]
    if review:
        print()
        print("  NEEDS REVIEW (user-data — do NOT auto-sync):")
        for d in review:
            print(
                f"    - {d['collection']:<20} pre={d['preview_count']}  prod={d['prod_count']}  Δ={d['delta']:+d}"
            )

    # Save the diff report so the sync script can consume it.
    out_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "data", "diff_report.json"
    )
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump({"prod_db": prod_db, "preview_db": args.preview_db, "collections": diff_report}, f, indent=2)
    print(f"\n  Diff report written to: {out_path}")

    preview.close()
    prod.close()
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Preview ↔ Production collection diff")
    p.add_argument("--preview-url", default=PREVIEW_URL_DEFAULT)
    p.add_argument("--preview-db", default=PREVIEW_DB_DEFAULT)
    p.add_argument("--prod-url", default=PROD_URL_DEFAULT)
    p.add_argument("--prod-db", default=None)
    args = p.parse_args()
    rc = asyncio.run(main(args))
    sys.exit(rc)
