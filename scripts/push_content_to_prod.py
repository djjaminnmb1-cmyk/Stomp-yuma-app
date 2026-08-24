#!/usr/bin/env python3
"""Client that pushes preview-exported content into production via the
authenticated ``/api/admin/bulk-import`` endpoint.

Because it talks to production over HTTPS (not directly to the DB), it
does NOT need Atlas Network Access to be allowlisted. All you need is
an admin login on the production app.

The script:
  1. Logs into production as an admin (email + password).
  2. Reads the exported JSON file (default:
     ``/app/scripts/data/preview_dances.json``).
  3. Splits the array into safe chunks of ``--chunk-size`` docs.
  4. POSTs each chunk to ``/api/admin/bulk-import``, printing progress.
  5. Prints a final summary of inserted / skipped rows.

Usage
-----
    # Dances (default source file)
    python3 push_content_to_prod.py \\
        --api https://stompin-yuma-app.emergent.host \\
        --email erinboroughs@gmail.com \\
        --password '...' \\
        --collection dances

    # Any other whitelisted content collection (leaderboard_prizes etc.)
    python3 push_content_to_prod.py \\
        --api https://stompin-yuma-app.emergent.host \\
        --email erinboroughs@gmail.com \\
        --password '...' \\
        --collection leaderboard_prizes \\
        --source /app/scripts/data/preview_leaderboard_prizes.json
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import time
from typing import Any

try:
    import requests
except ImportError:
    print("ERROR: 'requests' is required. Install with: pip install requests", file=sys.stderr)
    sys.exit(1)


DEFAULT_SOURCE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", "preview_dances.json"
)


def login(api: str, email: str, password: str) -> str:
    r = requests.post(
        f"{api.rstrip('/')}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    r.raise_for_status()
    d = r.json()
    if not d.get("token"):
        raise RuntimeError(f"No token in login response: {d}")
    return d["token"]


def preflight_counts(api: str, token: str) -> dict[str, int]:
    r = requests.get(
        f"{api.rstrip('/')}/api/admin/collection-counts",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("collections", {})


def push_chunk(
    api: str, token: str, collection: str, docs: list, dedup_field: str
) -> dict[str, Any]:
    r = requests.post(
        f"{api.rstrip('/')}/api/admin/bulk-import",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={"collection": collection, "docs": docs, "dedup_field": dedup_field},
        timeout=120,
    )
    if r.status_code >= 400:
        # Surface server-side detail so the operator can see what went
        # wrong without re-running just to read the response body.
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:500]}")
    return r.json()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--api", default="https://stompin-yuma-app.emergent.host")
    p.add_argument("--email", required=True)
    p.add_argument("--password", default=None)
    p.add_argument("--collection", default="dances")
    p.add_argument("--source", default=DEFAULT_SOURCE)
    p.add_argument("--dedup-field", default="id")
    p.add_argument(
        "--chunk-size",
        type=int,
        default=200,
        help="Docs per POST — keeps each request well under the ingress body cap.",
    )
    args = p.parse_args(argv)

    password = args.password or getpass.getpass("Admin password: ")

    print(f"→ Logging in as {args.email} on {args.api}")
    token = login(args.api, args.email, password)
    print(f"→ Got admin token (len={len(token)})")

    print("→ Preflight — current prod collection counts:")
    counts = preflight_counts(args.api, token)
    for name in sorted(counts.keys()):
        marker = " ← target" if name == args.collection else ""
        print(f"    {name:<28} {counts[name]:>7}{marker}")

    with open(args.source, "r") as f:
        docs = json.load(f)
    if not isinstance(docs, list):
        print(f"✖ Source file is not a JSON array: {args.source}", file=sys.stderr)
        return 2
    print(f"→ Loaded {len(docs)} docs from {args.source}")

    total_inserted = 0
    total_skipped_existing = 0
    total_skipped_no_id = 0
    chunk_errors: list[str] = []
    started = time.time()

    for i in range(0, len(docs), args.chunk_size):
        chunk = docs[i : i + args.chunk_size]
        try:
            res = push_chunk(
                args.api, token, args.collection, chunk, args.dedup_field
            )
            total_inserted += res.get("inserted", 0)
            total_skipped_existing += res.get("skipped_existing", 0)
            total_skipped_no_id += res.get("skipped_no_id", 0)
            chunk_errors.extend(res.get("chunk_errors", []))
            print(
                f"    chunk {i // args.chunk_size + 1:>3}: "
                f"inserted={res.get('inserted', 0):>4}  "
                f"skipped_existing={res.get('skipped_existing', 0):>4}  "
                f"total_after={res.get('prod_total_after', '?')}"
            )
        except Exception as e:
            msg = f"chunk starting at {i}: {e}"
            print(f"    ⚠  {msg}")
            chunk_errors.append(msg)

    print()
    print("=" * 74)
    print(f"  DONE in {time.time() - started:.1f}s")
    print(f"  Inserted:                {total_inserted}")
    print(f"  Skipped (already exists): {total_skipped_existing}")
    print(f"  Skipped (missing id):     {total_skipped_no_id}")
    if chunk_errors:
        print(f"  Chunk errors: {len(chunk_errors)}")
        for e in chunk_errors[:5]:
            print(f"    - {e}")
    else:
        print("  Chunk errors:            0")
    return 0 if not chunk_errors else 1


if __name__ == "__main__":
    sys.exit(main())
