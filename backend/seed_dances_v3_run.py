"""Runner for batch-v3 line dance seed. Idempotent (skips duplicates by name).
Applies the app's YouTube-search autofill pattern for youtube_url and a common
step-sheet pointer note (no verbatim step notation, per copyright).
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

from seed_dances_v3 import SEED_V3

load_dotenv()

STEP_TEMPLATE = (
    "Step sheet not yet uploaded to this dance. Instructors can attach the "
    "official printable image via the dance detail page — tap Edit next to "
    "Step Sheet."
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def youtube_search_url(name: str, chor: str) -> str:
    q = "+".join(f"{name} line dance {chor}".split())
    return f"https://www.youtube.com/results?search_query={q}"


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    existing = {
        d["name"].lower()
        async for d in db.dances.find({}, {"name": 1, "_id": 0})
    }
    print(f"Existing dances: {len(existing)}")

    erin = await db.users.find_one(
        {"email": "erinboroughs@gmail.com"}, {"user_id": 1, "name": 1}
    )
    creator_id = (erin or {}).get("user_id", "")
    creator_name = (erin or {}).get("name", "Stompin' Ground Yuma")

    to_insert = []
    skipped = 0
    for row in SEED_V3:
        name, chor, country, song, artist, diff, bpm, count = row
        if name.lower() in existing:
            skipped += 1
            continue
        to_insert.append({
            "id": f"dance_{uuid.uuid4().hex[:10]}",
            "name": name,
            "choreographer": chor,
            "choreographer_country": country,
            "song": song,
            "artist": artist,
            "difficulty": diff,
            "bpm": bpm,
            "count": count,
            "youtube_url": youtube_search_url(name, chor),
            "step_sheet": STEP_TEMPLATE,
            "step_sheet_image": "",
            "description": "",
            "tags": [],
            "is_published": True,
            "created_by": creator_id,
            "created_by_name": creator_name,
            "created_at": now_iso(),
        })
        existing.add(name.lower())

    if to_insert:
        await db.dances.insert_many(to_insert)
    total = await db.dances.count_documents({})
    print(f"Inserted: {len(to_insert)}, Skipped duplicates: {skipped}")
    print(f"Total dances now: {total}")


if __name__ == "__main__":
    asyncio.run(main())
