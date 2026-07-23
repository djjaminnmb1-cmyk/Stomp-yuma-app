"""Runner to seed batch-2 line dances into MongoDB.
Skips any dance whose name already exists (case-insensitive).
Generates a YouTube search URL for each entry (same pattern as the backend's
autofill for import).
Usage: python3 -m seed_dances_v2_run   (run from /app/backend)
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

from seed_dances_v2 import SEED_DANCES_V2

load_dotenv()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def youtube_search_url(query: str) -> str:
    q = "+".join(query.strip().split())
    return f"https://www.youtube.com/results?search_query={q}"


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    existing_names = {
        d["name"].lower()
        async for d in db.dances.find({}, {"name": 1, "_id": 0})
    }
    print(f"Existing dances: {len(existing_names)}")

    # Pick the Erin admin as creator (if present) so the dashboard shows a name
    creator = await db.users.find_one(
        {"email": "stompingroundyuma@gmail.com"}, {"user_id": 1, "name": 1}
    )
    creator_id = creator.get("user_id", "") if creator else ""
    creator_name = creator.get("name", "Stompin' Ground Yuma") if creator else "Stompin' Ground Yuma"

    to_insert = []
    skipped = 0
    for row in SEED_DANCES_V2:
        (
            name,
            chor,
            chor_country,
            song,
            artist,
            difficulty,
            bpm,
            count,
            yt_query,
            step_sheet,
        ) = row
        if name.lower() in existing_names:
            skipped += 1
            continue
        to_insert.append(
            {
                "id": f"dance_{uuid.uuid4().hex[:10]}",
                "name": name,
                "choreographer": chor,
                "choreographer_country": chor_country,
                "song": song,
                "artist": artist,
                "difficulty": difficulty,
                "bpm": bpm,
                "count": count,
                "youtube_url": youtube_search_url(yt_query),
                "step_sheet": step_sheet,
                "step_sheet_image": "",
                "description": "",
                "tags": [],
                "is_published": True,  # publish immediately so users see them
                "created_by": creator_id,
                "created_by_name": creator_name,
                "created_at": now_iso(),
            }
        )
        existing_names.add(name.lower())

    if to_insert:
        await db.dances.insert_many(to_insert)
    print(f"Inserted: {len(to_insert)}, Skipped duplicates: {skipped}")
    total = await db.dances.count_documents({})
    print(f"Total dances now: {total}")


if __name__ == "__main__":
    asyncio.run(main())
