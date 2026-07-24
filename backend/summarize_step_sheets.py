"""Populate a factual, metadata-only structure summary on every dance whose
step_sheet is still the generic 'not yet uploaded' placeholder.

Design:
- Uses ONLY the dance's own metadata already stored in Mongo (difficulty,
  count/wall, song, artist, choreographer). No step notation is invented or
  copied.
- Skips any dance whose step_sheet contains real notation (detected by
  count patterns like '1-8', '9-16', '17-24' — a strong signal of authored
  step-sheet content that we must not overwrite).
- Idempotent: rerunning yields the same summaries.
"""
import asyncio
import os
import re
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

PLACEHOLDER = (
    "Step sheet not yet uploaded to this dance. Instructors can attach the "
    "official printable image via the dance detail page — tap Edit next to "
    "Step Sheet."
)
NOTATION_HINTS = re.compile(r"\b(?:1-4|1-8|5-8|9-16|17-24|25-32)\b|\bcount\s+\d", re.I)


def summary_for(d: dict) -> Optional[str]:
    name = (d.get("name") or "").strip()
    chor = (d.get("choreographer") or "").strip()
    song = (d.get("song") or "").strip()
    artist = (d.get("artist") or "").strip()
    difficulty = (d.get("difficulty") or "").strip() or "Beginner"
    count_str = (d.get("count") or "").strip()
    bpm = d.get("bpm")
    country = (d.get("choreographer_country") or "").strip()

    # Difficulty + structure line
    if count_str:
        structure_line = f"{difficulty} level, {count_str}."
    else:
        structure_line = f"{difficulty} level."

    # Music line
    music_bits = []
    if song and artist:
        music_bits.append(f"'{song}' by {artist}")
    elif song:
        music_bits.append(f"'{song}'")
    if bpm and isinstance(bpm, (int, float)) and bpm > 0:
        music_bits.append(f"~{int(bpm)} bpm")
    music_line = "Music: " + ", ".join(music_bits) + "." if music_bits else ""

    # Choreographer line
    if chor and chor.lower() not in ("various", "traditional"):
        chor_bits = [f"Choreographed by {chor}"]
        if country:
            chor_bits.append(f"({country})")
        chor_line = " ".join(chor_bits) + "."
    elif chor:
        chor_line = f"Choreographed by {chor}."
    else:
        chor_line = ""

    # Instructor CTA
    cta = (
        "Instructors: use Edit → Step Sheet to upload the official printable "
        "image for exact notation, restarts, and tags."
    )

    parts = [structure_line]
    if music_line:
        parts.append(music_line)
    if chor_line:
        parts.append(chor_line)
    parts.append(cta)
    return " ".join(parts).strip()


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]

    total = 0
    updated = 0
    skipped_real_notation = 0
    skipped_no_change = 0

    async for d in db.dances.find({}):
        total += 1
        existing_ss = (d.get("step_sheet") or "").strip()

        # Rule 1: if the current text has real step notation, don't overwrite.
        if existing_ss and NOTATION_HINTS.search(existing_ss):
            skipped_real_notation += 1
            continue

        # Rule 2: only replace the known placeholder OR empty text. Never
        # overwrite a hand-authored non-placeholder summary.
        is_placeholder_only = (existing_ss == PLACEHOLDER) or (not existing_ss)
        if not is_placeholder_only:
            skipped_no_change += 1
            continue

        new_summary = summary_for(d) or PLACEHOLDER
        if new_summary == existing_ss:
            skipped_no_change += 1
            continue
        await db.dances.update_one({"id": d["id"]}, {"$set": {"step_sheet": new_summary}})
        updated += 1

    print(f"Total dances scanned : {total}")
    print(f"  Updated with summary: {updated}")
    print(f"  Skipped (real steps): {skipped_real_notation}")
    print(f"  Skipped (no change) : {skipped_no_change}")

    # Preview a few
    async for x in db.dances.aggregate([{"$sample": {"size": 3}}]):
        print(f"\n  · {x['name']} ({x.get('choreographer','')})")
        print(f"    {x.get('step_sheet','')[:220]}")


if __name__ == "__main__":
    asyncio.run(main())
