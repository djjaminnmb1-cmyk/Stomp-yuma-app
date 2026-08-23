"""One-shot importer for the Stompin' Ground Yuma Combined Catalog xlsx.

Reads the Master Catalog sheet, normalizes each row into a dance
document, and bulk-inserts any dance whose name is not already
present. De-duplication uses case-insensitive name-matching only —
so re-running the script is safe.

Usage
-----
    cd /app/backend && python3 import_catalog.py [path/to/catalog.xlsx]

If no path is supplied the script defaults to ``/tmp/dances/catalog.xlsx``.
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from urllib.parse import quote_plus

import openpyxl

from core.database import db
from core.time_helpers import now_iso

DEFAULT_PATH = "/tmp/dances/catalog.xlsx"

ALLOWED_LEVELS = {
    "Absolute Beginner",
    "Beginner",
    "Improver",
    "High Improver",
    "Intermediate",
    "Advanced",
}


def norm_level(raw) -> str:
    """Map every quirk in the source data to one of ``ALLOWED_LEVELS``.

    Unknown / Unverified / <blank> rows fall back to ``Beginner`` — the
    safest default that keeps the dance browsable without misleading a
    user into a level that's too easy or too hard.
    """
    if raw is None:
        return "Beginner"
    s = str(raw).strip()
    if not s:
        return "Beginner"
    # Direct hit
    if s in ALLOWED_LEVELS:
        return s
    tc = s.title()
    if tc in ALLOWED_LEVELS:
        return tc
    return "Beginner"


def make_count(counts, walls) -> str:
    """Turn (32, 4) → ``"32 count, 4 wall"``. Empty when both missing."""
    parts: list[str] = []
    try:
        c = int(counts) if counts is not None else None
        if c and c > 0:
            parts.append(f"{c} count")
    except (TypeError, ValueError):
        pass
    try:
        w = int(walls) if walls is not None else None
        if w and w > 0:
            parts.append(f"{w} wall")
    except (TypeError, ValueError):
        pass
    return ", ".join(parts)


def youtube_search_url(name: str, chor: str) -> str:
    q = f"{name} {chor} line dance".strip()
    return f"https://www.youtube.com/results?search_query={quote_plus(q)}"


async def run(path: str) -> None:
    wb = openpyxl.load_workbook(path, data_only=True)
    if "Master Catalog" not in wb.sheetnames:
        raise SystemExit(
            f"Sheet 'Master Catalog' not found. Sheets present: {wb.sheetnames}"
        )
    ws = wb["Master Catalog"]

    # Prefetch existing dance names for O(1) dupe check.
    existing: set[str] = set()
    async for d in db.dances.find({}, {"_id": 0, "name": 1}):
        existing.add((d.get("name") or "").strip().lower())
    print(f"→ Existing dances in DB: {len(existing)}")

    to_insert: list[dict] = []
    dupes = 0
    unknown_level = 0
    skipped_no_name = 0

    # Column order in Master Catalog (0-indexed):
    #   0 Master #     1 Batch          2 Batch Rank     3 Dance Title
    #   4 Matched      5 Skill Level    6 Choreographer  7 Song Title
    #   8 Artist       9 Counts        10 Walls         11 Views
    #  12 Step Sheet   13 Source       14 Match Conf    15 Status
    for row in ws.iter_rows(min_row=2, values_only=True):
        name_cell = row[3]
        if name_cell is None:
            skipped_no_name += 1
            continue
        name = str(name_cell).strip()
        if not name:
            skipped_no_name += 1
            continue
        key = name.lower()
        if key in existing:
            dupes += 1
            continue

        raw_level = row[5]
        difficulty = norm_level(raw_level)
        if (
            raw_level is not None
            and str(raw_level).strip()
            and str(raw_level).strip() not in ALLOWED_LEVELS
            and str(raw_level).strip().title() not in ALLOWED_LEVELS
        ):
            unknown_level += 1

        chor = str(row[6] or "").strip()
        song = str(row[7] or "").strip()
        artist = str(row[8] or "").strip()
        step = str(row[12] or "").strip()
        count_str = make_count(row[9], row[10])
        yt = youtube_search_url(name, chor)

        to_insert.append({
            "id": f"dance_{uuid.uuid4().hex[:10]}",
            "name": name,
            "choreographer": chor,
            "choreographer_country": "",
            "song": song,
            "artist": artist,
            "difficulty": difficulty,
            "bpm": None,   # xlsx has no BPM column
            "count": count_str,
            "youtube_url": yt,
            "step_sheet": step,
            "step_sheet_image": "",
            "description": "",
            "tags": [],
            "is_published": True,
            "created_by": "",
            "created_by_name": "Stompin' Ground Yuma Catalog",
            "created_at": now_iso(),
        })
        existing.add(key)

    if to_insert:
        # Bulk insert in reasonable chunks.
        chunk_size = 500
        for i in range(0, len(to_insert), chunk_size):
            chunk = to_insert[i : i + chunk_size]
            await db.dances.insert_many(chunk, ordered=False)
            print(f"  inserted rows {i}..{i + len(chunk) - 1}")

    print(
        f"✔ Import complete — inserted: {len(to_insert)}, "
        f"duplicates skipped: {dupes}, "
        f"unknown-level → Beginner: {unknown_level}, "
        f"blank rows: {skipped_no_name}"
    )


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
    asyncio.run(run(path))
