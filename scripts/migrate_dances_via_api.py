#!/usr/bin/env python3
"""Migrate preview dances → production via HTTPS.

Works entirely from inside the preview pod. No Atlas access needed —
the script drives the existing ``POST /api/dances/import`` endpoint
that already ships on production. Dedup by ``name`` (case-insensitive)
is enforced by the server.

Usage
-----
    export PROD_ADMIN_PASSWORD='...'
    python3 /app/scripts/migrate_dances_via_api.py \\
        --email erinboroughs@gmail.com \\
        --dry-run           # counts only, no writes

    python3 /app/scripts/migrate_dances_via_api.py \\
        --email erinboroughs@gmail.com \\
        --apply             # actually POST
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
    print("ERROR: install requests (pip install requests)", file=sys.stderr)
    sys.exit(1)


PROD_URL = os.environ.get(
    "PROD_URL", "https://stompin-yuma-app.emergent.host"
)
DEFAULT_SOURCE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", "preview_dances.json"
)


def login(base: str, email: str, password: str) -> str:
    r = requests.post(
        f"{base}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    if r.status_code >= 400:
        raise SystemExit(
            f"✖ Login failed ({r.status_code}). Body: {r.text[:200]}"
        )
    d = r.json()
    if not d.get("token"):
        raise SystemExit(f"✖ No token in login response: {d}")
    return d["token"]


def fetch_prod_dance_names(base: str) -> set[str]:
    r = requests.get(f"{base}/api/dances", timeout=60)
    r.raise_for_status()
    rows = r.json()
    return {(d.get("name") or "").strip().lower() for d in rows}


def normalise_row(d: dict) -> dict:
    """Trim a preview dance record down to fields the production
    ``POST /api/dances/import`` schema accepts. Anything else is
    dropped — the server would ignore it anyway."""
    return {
        "name": (d.get("name") or "").strip(),
        "choreographer": (d.get("choreographer") or "").strip(),
        "song": (d.get("song") or "").strip(),
        "artist": (d.get("artist") or "").strip(),
        "difficulty": (d.get("difficulty") or "Beginner").strip(),
        "bpm": d.get("bpm") if isinstance(d.get("bpm"), int) else None,
        "count": (d.get("count") or "").strip(),
        "youtube_url": (d.get("youtube_url") or "").strip(),
        "step_sheet": (d.get("step_sheet") or "").strip(),
    }


def post_batch(base: str, token: str, dances: list[dict]) -> dict[str, Any]:
    r = requests.post(
        f"{base}/api/dances/import",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={"dances": dances, "publish_all": True},
        timeout=180,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
    return r.json()


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--base", default=PROD_URL)
    p.add_argument("--email", required=True)
    p.add_argument("--source", default=DEFAULT_SOURCE)
    p.add_argument(
        "--chunk-size",
        type=int,
        default=100,
        help="Dances per POST batch (server body-limit friendly).",
    )
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--apply", action="store_true")
    args = p.parse_args()

    if not args.dry_run and not args.apply:
        print(
            "Refusing to run without --dry-run or --apply — pick one to "
            "be explicit about intent."
        )
        return 2

    password = os.environ.get("PROD_ADMIN_PASSWORD") or getpass.getpass(
        "Production admin password: "
    )
    if not password:
        print("Empty password.")
        return 2

    print(f"→ Logging in to {args.base} as {args.email}")
    token = login(args.base, args.email, password)
    print(f"→ Got admin token (len={len(token)})")

    print("→ Reading preview export from", args.source)
    with open(args.source, "r") as f:
        raw = json.load(f)
    print(f"    preview rows: {len(raw)}")

    print("→ Fetching current production dance names …")
    prod_names = fetch_prod_dance_names(args.base)
    print(f"    prod dance names: {len(prod_names)}")

    to_send: list[dict] = []
    skipped_existing_local = 0
    skipped_no_name = 0
    for d in raw:
        row = normalise_row(d)
        name = row["name"].lower()
        if not name:
            skipped_no_name += 1
            continue
        if name in prod_names:
            skipped_existing_local += 1
            continue
        to_send.append(row)

    print()
    print(f"  Would insert (after local dedup):  {len(to_send)}")
    print(f"  Skipped — already in production:   {skipped_existing_local}")
    print(f"  Skipped — missing name:            {skipped_no_name}")

    if to_send[:3]:
        print("\n  First 3 rows:")
        for i, r in enumerate(to_send[:3], 1):
            print(
                f"    {i}. {r['name']!r} by {r['choreographer']!r} "
                f"({r['difficulty']})"
            )

    if args.dry_run:
        print("\n  DRY-RUN complete. Re-run with --apply to actually POST.")
        return 0

    if not to_send:
        print("\n  Nothing to send.")
        return 0

    inserted = 0
    skipped_by_server = 0
    errors: list[str] = []
    started = time.time()
    for i in range(0, len(to_send), args.chunk_size):
        chunk = to_send[i : i + args.chunk_size]
        try:
            res = post_batch(args.base, token, chunk)
            inserted += int(res.get("imported", 0) or 0)
            skipped_by_server += int(res.get("skipped_duplicates", 0) or 0)
            print(
                f"    batch {i // args.chunk_size + 1:>3}: "
                f"imported={res.get('imported', 0):>4}  "
                f"skipped={res.get('skipped_duplicates', 0):>4}"
            )
        except Exception as e:
            msg = f"batch starting at {i}: {e}"
            print(f"    ⚠  {msg}")
            errors.append(msg)

    print()
    print("=" * 68)
    print(f"  DONE in {time.time() - started:.1f}s")
    print(f"  Inserted (production reported): {inserted}")
    print(f"  Server-side skipped duplicates: {skipped_by_server}")
    if errors:
        print(f"  Batch errors ({len(errors)}):")
        for e in errors[:5]:
            print(f"    - {e}")
    print()
    # Final sanity check — pull the fresh count.
    try:
        names_after = fetch_prod_dance_names(args.base)
        print(f"  Prod dances after: {len(names_after)}")
    except Exception as e:
        print(f"  (couldn't fetch post-count: {e})")
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
