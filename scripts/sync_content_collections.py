#!/usr/bin/env python3
"""Generic content-collection sync: preview → production.

For each collection in ``--collections`` (default: dances, class_recaps,
venue_info, badges, dance_categories), read every document from preview
and insert into production if the document's ``id`` is not already
present.

Dry-run by default. Add ``--apply`` to actually write. Safe to re-run:
duplicates are detected by ``id`` field.

Explicitly refuses to touch collections that hold user-generated data
unless you pass ``--force-unsafe`` — those need a case-by-case plan.

Usage
-----
    # Dry-run everything safe
    python3 sync_content_collections.py

    # Just the dances collection, actually apply
    python3 sync_content_collections.py --collections dances --apply

    # Force a specific "unsafe" collection (e.g. after seeding official
    # events in preview that you want on prod)
    python3 sync_content_collections.py --collections events --apply --force-unsafe
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from typing import Any, Iterable

from motor.motor_asyncio import AsyncIOMotorClient

PREVIEW_URL_DEFAULT = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
PREVIEW_DB_DEFAULT = os.environ.get("DB_NAME", "test_database")
PROD_URL_DEFAULT = os.environ.get("PROD_MONGO_URL", "")

DEFAULT_SAFE_COLLECTIONS = [
    "dances",
    "class_recaps",
    "venue_info",
    "badges",
    "dance_categories",
]
KNOWN_UNSAFE_COLLECTIONS = {
    "users",
    "suggestions",
    "tracking",
    "follows",
    "feed_reactions",
    "activity_events",
    "badges_awarded",
    "practice_daily",
    "weekly_recaps",
    "push_tokens",
    "reports",
}


async def find_app_db(client: AsyncIOMotorClient) -> str:
    dbs = await client.list_database_names()
    ranked: list[tuple[str, int]] = []
    for name in dbs:
        if name in ("admin", "local", "config"):
            continue
        cols = await client[name].list_collection_names()
        if "dances" in cols or "users" in cols:
            ranked.append((name, len(cols)))
    if not ranked:
        raise RuntimeError(f"No app DB found. Available: {dbs}")
    ranked.sort(key=lambda x: -x[1])
    return ranked[0][0]


async def sync_collection(
    preview_db, prod_db, name: str, apply: bool
) -> dict[str, int]:
    src_total = await preview_db[name].count_documents({})
    existing_ids: set[str] = set()
    async for row in prod_db[name].find({}, {"_id": 0, "id": 1}):
        rid = row.get("id")
        if rid:
            existing_ids.add(rid)

    to_insert: list[dict[str, Any]] = []
    skipped_existing = 0
    skipped_no_id = 0
    async for d in preview_db[name].find({}, {"_id": 0}):
        did = d.get("id")
        if not did:
            skipped_no_id += 1
            continue
        if did in existing_ids:
            skipped_existing += 1
            continue
        to_insert.append(d)

    inserted = 0
    if apply and to_insert:
        chunk = 200
        for i in range(0, len(to_insert), chunk):
            try:
                res = await prod_db[name].insert_many(
                    to_insert[i : i + chunk], ordered=False
                )
                inserted += len(res.inserted_ids)
            except Exception as e:
                print(f"    ⚠  {name} chunk {i//chunk + 1} failed: {e}")

    return {
        "preview_total": src_total,
        "prod_existing": len(existing_ids),
        "would_insert": len(to_insert),
        "skipped_existing": skipped_existing,
        "skipped_no_id": skipped_no_id,
        "inserted": inserted,
    }


async def main(args: argparse.Namespace) -> int:
    if not args.prod_url:
        print("ERROR: no PROD_MONGO_URL/--prod-url", file=sys.stderr)
        return 2

    print("=" * 74)
    print(" Content Sync — preview → production")
    print("=" * 74)
    print(f"  Mode: {'APPLY (WILL WRITE)' if args.apply else 'DRY-RUN (no writes)'}")
    print()

    preview = AsyncIOMotorClient(args.preview_url, serverSelectionTimeoutMS=10000)
    prod = AsyncIOMotorClient(args.prod_url, serverSelectionTimeoutMS=15000)

    try:
        await prod.admin.command("ping")
    except Exception as e:
        print(f"✖ Could not connect to production: {e}")
        print("  Check Atlas Network Access allowlist for this IP.")
        return 3

    prod_db_name = args.prod_db or await find_app_db(prod)
    preview_db = preview[args.preview_db]
    prod_db = prod[prod_db_name]
    print(f"  Preview DB: {args.preview_db}")
    print(f"  Prod DB:    {prod_db_name}\n")

    collections = args.collections or DEFAULT_SAFE_COLLECTIONS
    unsafe = [c for c in collections if c in KNOWN_UNSAFE_COLLECTIONS]
    if unsafe and not args.force_unsafe:
        print(
            f"✖ Refusing to sync user-data collections without "
            f"--force-unsafe: {unsafe}"
        )
        return 4

    grand_would_insert = 0
    grand_inserted = 0
    for name in collections:
        # Skip collections that don't exist on preview.
        pre_cols = await preview_db.list_collection_names()
        if name not in pre_cols:
            print(f"  – {name:<20} not present on preview, skipping.")
            continue
        stats = await sync_collection(preview_db, prod_db, name, args.apply)
        grand_would_insert += stats["would_insert"]
        grand_inserted += stats["inserted"]
        verb = "INSERTED" if args.apply else "would insert"
        print(
            f"  ✓ {name:<20} preview={stats['preview_total']:>6}  "
            f"prod_existing={stats['prod_existing']:>6}  "
            f"{verb}={stats['inserted' if args.apply else 'would_insert']:>5}  "
            f"skipped_existing={stats['skipped_existing']:>5}  "
            f"skipped_no_id={stats['skipped_no_id']:>3}"
        )

    print()
    if args.apply:
        print(f"  ✔ Total inserted across all collections: {grand_inserted}")
    else:
        print(f"  DRY-RUN total that would insert:         {grand_would_insert}")
        print("  Re-run with --apply to actually write.")

    preview.close()
    prod.close()
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Sync content collections preview → prod")
    p.add_argument("--preview-url", default=PREVIEW_URL_DEFAULT)
    p.add_argument("--preview-db", default=PREVIEW_DB_DEFAULT)
    p.add_argument("--prod-url", default=PROD_URL_DEFAULT)
    p.add_argument("--prod-db", default=None)
    p.add_argument(
        "--collections",
        nargs="+",
        default=None,
        help=f"Collections to sync (default: {DEFAULT_SAFE_COLLECTIONS})",
    )
    p.add_argument("--apply", action="store_true")
    p.add_argument(
        "--force-unsafe",
        action="store_true",
        help="Required to sync user-data collections like users/suggestions/etc.",
    )
    args = p.parse_args()
    rc = asyncio.run(main(args))
    sys.exit(rc)
