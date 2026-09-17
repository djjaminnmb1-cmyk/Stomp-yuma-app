"""Manual runner for the Apple App Review UGC 1.2 seed.

You DON'T normally need this — ``services/startup.run_startup`` already
seeds the reviewer accounts on every backend boot. Run this script when
you want to re-seed on demand (for example after locally deleting the
accounts).

    python /app/backend/scripts/seed_apple_review.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from services.apple_review_seed import (  # noqa: E402
    ADMIN_REVIEWER_EMAIL,
    ADMIN_REVIEWER_PASSWORD,
    DEMO_MESSAGE_ID,
    REVIEWER_EMAIL,
    REVIEWER_PASSWORD,
    seed_apple_review_accounts,
)


async def main() -> None:
    print("=== Seeding Apple App Review accounts ===")
    await seed_apple_review_accounts()
    print()
    print("=== Done. Reviewer credentials ===")
    print(f"  Dancer: {REVIEWER_EMAIL}  /  {REVIEWER_PASSWORD}")
    print(f"  Admin:  {ADMIN_REVIEWER_EMAIL}  /  {ADMIN_REVIEWER_PASSWORD}")
    print(f"  Demo message id: {DEMO_MESSAGE_ID}")


if __name__ == "__main__":
    asyncio.run(main())
