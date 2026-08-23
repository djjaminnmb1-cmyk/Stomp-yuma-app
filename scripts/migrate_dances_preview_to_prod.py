#!/usr/bin/env python3
"""Migrate dances from preview → production MongoDB.

Idempotent: dances that already exist on production (matched by ``id``)
are skipped. Default behaviour is DRY-RUN — pass ``--apply`` to actually
write.

Usage
-----
    # Dry-run: report only, no writes
    python3 migrate_dances_preview_to_prod.py

    # Real write
    python3 migrate_dances_preview_to_prod.py --apply

    # Override the source JSON or destination URL
    python3 migrate_dances_preview_to_prod.py \\
        --source /app/scripts/data/preview_dances.json \\
        --prod-url 'mongodb+srv://...'
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from typing import Any

try:
    from motor.motor_asyncio import AsyncIOMotorClient
except ImportError:
    print("ERROR: motor is not installed. Run: pip install motor", file=sys.stderr)
    sys.exit(1)


PROD_URL_DEFAULT = os.environ.get(
    "PROD_MONGO_URL",
    # Placeholder — replace via env var or --prod-url flag.
    "mongodb+srv://stompin-yuma-app:<PASSWORD>@customer-apps.vs6i7i.mongodb.net/?retryWrites=true&w=majority&appName=stompin-yuma-app&maxPoolSize=5",
)
SOURCE_DEFAULT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", "preview_dances.json"
)


async def find_prod_db(client: AsyncIOMotorClient) -> str:
    """Locate the app database on the production cluster.

    The connection string has no explicit DB path so we look for a
    database that already contains a ``dances`` collection. Falls back
    to the first non-system DB.
    """
    dbs = await client.list_database_names()
    candidates: list[tuple[str, int]] = []
    for name in dbs:
        if name in ("admin", "local", "config"):
            continue
        cols = await client[name].list_collection_names()
        if "dances" in cols:
            n = await client[name]["dances"].count_documents({})
            candidates.append((name, n))
    if not candidates:
        raise RuntimeError(
            "No production DB with a 'dances' collection was found. "
            "Non-system databases: "
            f"{[d for d in dbs if d not in ('admin','local','config')]}"
        )
    # Prefer the DB with the most dances (usually the primary app DB).
    candidates.sort(key=lambda x: -x[1])
    return candidates[0][0]


def load_source(path: str) -> list[dict[str, Any]]:
    with open(path, "r") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{path} did not contain a JSON array")
    return data


async def main(args: argparse.Namespace) -> int:
    print("=" * 70)
    print(" Stompin' Ground Yuma — Dances Migration (preview → production)")
    print("=" * 70)
    print(f"  Source JSON:  {args.source}")
    print(f"  Prod cluster: {args.prod_url.split('@', 1)[-1].split('?', 1)[0]}")
    print(f"  Mode:         {'APPLY (WILL WRITE)' if args.apply else 'DRY-RUN (no writes)'}")
    print()

    src_docs = load_source(args.source)
    print(f"  Source dances loaded:            {len(src_docs)}")

    client = AsyncIOMotorClient(args.prod_url, serverSelectionTimeoutMS=15000)
    try:
        # Force topology discovery so IP-allowlist failures surface here
        # instead of silently later.
        await client.admin.command("ping")
    except Exception as e:
        print(f"\n  ✖ Could NOT connect to production cluster.")
        print(f"    Details: {e}")
        print(
            "\n  Common cause: the IP of this machine is not on Atlas's"
            "\n  Network Access allowlist. Add your IP under Atlas UI →"
            "\n  Project → Network Access, then re-run."
        )
        client.close()
        return 2

    db_name = args.db_name or await find_prod_db(client)
    prod_db = client[db_name]
    print(f"  Prod database:                   {db_name}")

    prod_count_before = await prod_db.dances.count_documents({})
    print(f"  Prod 'dances' count (before):    {prod_count_before}")

    existing_ids = set()
    async for row in prod_db.dances.find({}, {"_id": 0, "id": 1}):
        rid = row.get("id")
        if rid:
            existing_ids.add(rid)
    print(f"  Prod existing ids resolved:      {len(existing_ids)}")

    to_insert: list[dict[str, Any]] = []
    skipped_existing = 0
    skipped_no_id = 0
    for d in src_docs:
        did = d.get("id")
        if not did:
            skipped_no_id += 1
            continue
        if did in existing_ids:
            skipped_existing += 1
            continue
        # Never carry the preview _id into production — Motor will
        # generate a fresh ObjectId on insert.
        d.pop("_id", None)
        to_insert.append(d)

    print()
    print(f"  Will insert:                     {len(to_insert)}")
    print(f"  Skipped (already exists by id):  {skipped_existing}")
    print(f"  Skipped (missing 'id'):          {skipped_no_id}")

    if to_insert[:3]:
        print("\n  Sample of the first 3 dances that will be inserted:")
        for i, d in enumerate(to_insert[:3], 1):
            print(f"    {i}. id={d.get('id')!r} name={d.get('name')!r}")

    if not args.apply:
        print("\n  DRY-RUN complete. No writes performed.")
        print("  Re-run with --apply to actually insert.")
        client.close()
        return 0

    if not to_insert:
        print("\n  Nothing to insert.")
        client.close()
        return 0

    # Chunked insert so a single doc failure doesn't kill the run.
    chunk_size = 200
    inserted = 0
    for i in range(0, len(to_insert), chunk_size):
        chunk = to_insert[i : i + chunk_size]
        try:
            res = await prod_db.dances.insert_many(chunk, ordered=False)
            inserted += len(res.inserted_ids)
            print(f"    ...inserted chunk {i // chunk_size + 1}: {len(res.inserted_ids)} docs")
        except Exception as e:
            print(f"    ⚠  Chunk starting at index {i} failed: {e}")
    prod_count_after = await prod_db.dances.count_documents({})
    print()
    print(f"  Inserted:                        {inserted}")
    print(f"  Prod 'dances' count (after):     {prod_count_after}")
    print("  ✔ Migration complete.")

    client.close()
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Migrate dances preview → production")
    p.add_argument("--source", default=SOURCE_DEFAULT, help="Preview dances JSON path")
    p.add_argument("--prod-url", default=PROD_URL_DEFAULT, help="Production Mongo URL")
    p.add_argument("--db-name", default=None, help="Prod DB name (auto-detect if omitted)")
    p.add_argument("--apply", action="store_true", help="Actually write (default: dry-run)")
    args = p.parse_args()
    rc = asyncio.run(main(args))
    sys.exit(rc)
