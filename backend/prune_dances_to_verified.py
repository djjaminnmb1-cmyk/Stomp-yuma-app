"""One-shot cleanup: keep only the 211 dances flagged 'looks_correct' by the
Claude Sonnet 4.6 verification pass.

Steps:
  1. Load /app/memory/dance_verification_raw.json
  2. Compute the approved set of dance IDs (verdict == "looks_correct")
  3. Delete from `dances` collection every doc NOT in the approved set
  4. Also delete orphaned tracking / attendance / suggestions rows
  5. Filter /app/backend/seed_dances.py in-place so its SEED_DANCES list
     only contains dances that survived — a backend restart won't restore
     deleted entries.
  6. Print a before/after summary.

Idempotent: rerunning it is a no-op once the DB matches the raw JSON.
"""
import asyncio, ast, json, re, sys
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv("/app/backend/.env")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")
RAW_PATH = Path("/app/memory/dance_verification_raw.json")
SEED_PATH = Path("/app/backend/seed_dances.py")


async def main():
    if not RAW_PATH.exists():
        print(f"ERR: missing {RAW_PATH}")
        sys.exit(1)
    verdicts = json.loads(RAW_PATH.read_text())
    approved_ids = {v["id"] for v in verdicts if v.get("verdict") == "looks_correct"}
    print(f"Approved dance IDs (looks_correct): {len(approved_ids)}")

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    total_before = await db.dances.count_documents({})
    print(f"Dances in DB before: {total_before}")

    # Map approved id → name (needed to filter seed source)
    approved_names = set()
    async for d in db.dances.find({"id": {"$in": list(approved_ids)}}, {"_id": 0, "name": 1}):
        approved_names.add(d["name"])
    print(f"Approved names collected: {len(approved_names)}")

    # 1) Delete all dances not in approved set
    to_delete_ids = []
    async for d in db.dances.find({"id": {"$nin": list(approved_ids)}}, {"_id": 0, "id": 1, "name": 1}):
        to_delete_ids.append(d["id"])
    delete_res = await db.dances.delete_many({"id": {"$in": to_delete_ids}})
    print(f"Deleted dances: {delete_res.deleted_count}")

    # 2) Orphan cleanup
    t = await db.tracking.delete_many({"dance_id": {"$in": to_delete_ids}})
    s = await db.suggestions.delete_many({"dance_id": {"$in": to_delete_ids}})
    # attendance stores dance_ids as an array of ids inside class docs; remove
    # any deleted dance ids from every class entry (do not delete the class)
    async for cls in db.classes.find({"dance_ids": {"$in": to_delete_ids}}, {"_id": 0, "id": 1, "dance_ids": 1}):
        keep = [x for x in (cls.get("dance_ids") or []) if x not in to_delete_ids]
        await db.classes.update_one({"id": cls["id"]}, {"$set": {"dance_ids": keep}})
    print(f"Orphaned tracking rows deleted:   {t.deleted_count}")
    print(f"Orphaned suggestion rows deleted: {s.deleted_count}")

    # 3) Filter seed_dances.py in place
    if SEED_PATH.exists() and approved_names:
        src = SEED_PATH.read_text()
        # Parse the module to find the SEED_DANCES list and rewrite it.
        tree = ast.parse(src)
        replaced = False
        for node in tree.body:
            if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == "SEED_DANCES" for t in node.targets
            ):
                if not isinstance(node.value, (ast.List, ast.Tuple)):
                    continue
                kept_tuples = []
                dropped = 0
                for elt in node.value.elts:
                    if not isinstance(elt, ast.Tuple) or not elt.elts:
                        continue
                    first = elt.elts[0]
                    if isinstance(first, ast.Constant) and isinstance(first.value, str):
                        if first.value in approved_names:
                            kept_tuples.append(elt)
                        else:
                            dropped += 1
                # Re-serialise
                new_list = ast.List(elts=kept_tuples, ctx=ast.Load())
                new_assign = ast.Assign(
                    targets=node.targets, value=new_list,
                    lineno=node.lineno, col_offset=node.col_offset,
                )
                new_src = ast.unparse(new_assign)
                # Replace inside the original file — find the SEED_DANCES = [...] block using regex
                pattern = re.compile(
                    r"^SEED_DANCES\s*=\s*\[.*?\n\]\s*$",
                    re.M | re.S,
                )
                src2, n = pattern.subn(new_src, src, count=1)
                if n:
                    SEED_PATH.write_text(src2)
                    print(f"Filtered seed_dances.py: kept {len(kept_tuples)}, dropped {dropped}")
                    replaced = True
                break
        if not replaced:
            print("WARN: could not filter seed_dances.py — investigate manually")

    total_after = await db.dances.count_documents({})
    print(f"Dances in DB after:  {total_after}")


asyncio.run(main())
