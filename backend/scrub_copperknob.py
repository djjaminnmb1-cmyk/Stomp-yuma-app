"""Scrub CopperKnob references from step_sheet fields.
- Removes any URL to copperknob.co.uk
- Removes any sentence that mentions 'copperknob'
- If the field ends up empty AND no step_sheet_image is attached, replaces
  it with a clean placeholder prompting instructors to upload the image.
Idempotent.
"""
import asyncio
import os
import re

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

CLEAN_TEMPLATE = (
    "Step sheet not yet uploaded to this dance. Instructors can attach the "
    "official printable image via the dance detail page — tap Edit next to "
    "Step Sheet."
)

url_re = re.compile(r"https?://(?:www\.)?copperknob\.co\.uk\S*", re.I)
sentence_re = re.compile(r"[^.\n]*copperknob[^.\n]*[.\n]?", re.I)


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]

    scrubbed = 0
    updated = 0
    async for d in db.dances.find(
        {}, {"id": 1, "name": 1, "step_sheet": 1, "step_sheet_image": 1}
    ):
        original = d.get("step_sheet") or ""
        text = original
        if "copperknob" in text.lower():
            text = url_re.sub("", text)
            text = sentence_re.sub("", text)
            text = re.sub(r"\n{3,}", "\n\n", text).strip()
            scrubbed += 1
        if not text.strip() and not (d.get("step_sheet_image") or "").strip():
            text = CLEAN_TEMPLATE
        if text != original:
            await db.dances.update_one({"id": d["id"]}, {"$set": {"step_sheet": text}})
            updated += 1

    total = await db.dances.count_documents({})
    remaining = await db.dances.count_documents(
        {"step_sheet": {"$regex": "copperknob", "$options": "i"}}
    )
    print(f"Total dances: {total}")
    print(f"Records scrubbed: {scrubbed}")
    print(f"Records updated: {updated}")
    print(f"Records still mentioning copperknob: {remaining}")

    async for x in db.dances.aggregate([{"$sample": {"size": 4}}]):
        snip = (x.get("step_sheet") or "")[:140]
        print(f"  * {x['name']}: {snip!r}")


if __name__ == "__main__":
    asyncio.run(main())
