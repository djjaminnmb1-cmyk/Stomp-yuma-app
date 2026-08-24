"""Admin bulk-import for content collections.

Purpose
-------
Runs entirely inside the backend process (so production POSTs go
against the production DB). Lets a signed-in admin push a JSON payload
of *content* rows into the database, deduplicating by the app-level
``id`` field.

Only these collections are whitelisted — everything else would risk
clobbering per-user data:

    dances, leaderboard_prizes, class_recaps, venue_info, badges,
    dance_categories

The endpoint is idempotent: a doc with an existing ``id`` is skipped,
so retries after network hiccups are safe.

Response
--------
::

    {
      "collection": "dances",
      "received": 1163,
      "inserted": 1062,
      "skipped_existing": 101,
      "skipped_no_id": 0,
      "prod_total_after": 1163,
      "chunk_errors": []
    }
"""
from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.database import db
from core.security import require_admin

router = APIRouter()

# Only these collections may be bulk-populated via the admin API.
# Adding a collection here means "the docs are curated content, not
# per-user data, and re-inserts by ``id`` are safe."
ALLOWED_COLLECTIONS: set[str] = {
    "dances",
    "leaderboard_prizes",
    "class_recaps",
    "venue_info",
    "badges",
    "dance_categories",
}

# Cap the batch size to avoid ingress body limits (K8s/nginx default is
# typically 1MB but Emergent doesn't publish the exact number). Clients
# should chunk client-side beyond this.
MAX_DOCS_PER_REQUEST = 500


class BulkImportBody(BaseModel):
    collection: str = Field(..., description="Target collection name")
    docs: List[dict] = Field(default_factory=list)
    # ``dedup_field`` is optional — defaults to ``id`` which is what all
    # our content collections use. Passing a different field is only
    # accepted for whitelisted collections that we've documented as
    # having a different natural key.
    dedup_field: Optional[str] = "id"


@router.post("/admin/bulk-import")
async def admin_bulk_import(
    body: BulkImportBody,
    admin: dict = Depends(require_admin),
):
    if body.collection not in ALLOWED_COLLECTIONS:
        raise HTTPException(
            400,
            f"Collection '{body.collection}' is not whitelisted for bulk import. "
            f"Allowed: {sorted(ALLOWED_COLLECTIONS)}",
        )
    if not body.docs:
        raise HTTPException(400, "docs is empty — nothing to import.")
    if len(body.docs) > MAX_DOCS_PER_REQUEST:
        raise HTTPException(
            400,
            f"Received {len(body.docs)} docs — cap is {MAX_DOCS_PER_REQUEST}. "
            "Please chunk client-side and re-post.",
        )
    dedup_field = (body.dedup_field or "id").strip() or "id"

    # Pull existing dedup-field values so we can filter in-memory. Only
    # the field we care about — cheap even for large collections.
    existing_keys: set[str] = set()
    async for row in db[body.collection].find({}, {"_id": 0, dedup_field: 1}):
        k = row.get(dedup_field)
        if k:
            existing_keys.add(str(k))

    to_insert: list[dict[str, Any]] = []
    skipped_existing = 0
    skipped_no_id = 0
    for d in body.docs:
        if not isinstance(d, dict):
            skipped_no_id += 1
            continue
        key = d.get(dedup_field)
        if key is None or key == "":
            skipped_no_id += 1
            continue
        if str(key) in existing_keys:
            skipped_existing += 1
            continue
        # Strip Mongo internal id if the caller left it in — always
        # generate a fresh ObjectId on the destination.
        d.pop("_id", None)
        to_insert.append(d)
        # Update the in-memory set so a payload containing duplicates
        # doesn't insert twice.
        existing_keys.add(str(key))

    chunk_errors: list[str] = []
    inserted = 0
    if to_insert:
        # Chunk inside the process too so a single bad doc doesn't kill
        # the run. 200 docs/chunk keeps insert_many fast.
        chunk = 200
        for i in range(0, len(to_insert), chunk):
            try:
                res = await db[body.collection].insert_many(
                    to_insert[i : i + chunk], ordered=False
                )
                inserted += len(res.inserted_ids or [])
            except Exception as e:
                chunk_errors.append(
                    f"chunk {i // chunk + 1}: {type(e).__name__}: {e}"
                )

    total_after = await db[body.collection].count_documents({})
    return {
        "collection": body.collection,
        "received": len(body.docs),
        "inserted": inserted,
        "skipped_existing": skipped_existing,
        "skipped_no_id": skipped_no_id,
        "prod_total_after": total_after,
        "chunk_errors": chunk_errors,
        "actor": admin.get("email", ""),
    }


@router.get("/admin/collection-counts")
async def admin_collection_counts(admin: dict = Depends(require_admin)):
    """Sidekick endpoint for the migration flow — returns per-collection
    doc counts on the current DB so the operator can eyeball what's
    already there before importing."""
    names = sorted(await db.list_collection_names())
    out: dict[str, int] = {}
    for name in names:
        if name.startswith("system."):
            continue
        out[name] = await db[name].count_documents({})
    return {"collections": out, "total_collections": len(out)}
