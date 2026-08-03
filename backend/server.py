"""Stompin' Ground Yuma — FastAPI entrypoint.

This file is intentionally tiny: it wires the API together and delegates all
resource handlers to ``routes/*.py``, all shared infra to ``core/*.py``, and
all background/startup work to ``services/*.py``.

If you're looking for a specific route or model, start with:

- ``routes/`` — REST endpoints grouped by resource (auth, dances, tracking, …)
- ``models/schemas.py`` — Pydantic request/response schemas
- ``core/`` — cross-cutting infra (DB client, JWT/security, rate limiting,
  email, push, serializers, config)
- ``services/`` — startup seeding, scheduled reminders
"""
import logging

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

# Importing `core.config` before anything else loads .env and validates
# JWT_SECRET / MONGO_URL up front — fail fast if the environment is broken.
import core.config  # noqa: F401
from core.database import client as _mongo_client
from routes import api_router
from services.scheduler import start_scheduler, stop_scheduler
from services.startup import run_startup

# Basic logging config — must happen before any of the module-level loggers
# used across routes/services fires anything meaningful.
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


app = FastAPI(title="Stompin' Ground Yuma API")

# Attach all /api routes.
app.include_router(api_router)

# CORS — auth is bearer-token only (no cookies) so credentials mode is not
# needed. Explicitly turning it off lets us keep a permissive origin
# allow-list without the wildcard + credentials misconfiguration that some
# browsers reject and that opens a cross-site foothold surface.
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    # Indexes + dance + account seeding (all idempotent).
    await run_startup()
    # Kick off the hourly 24h class-reminder job.
    start_scheduler()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    stop_scheduler()
    try:
        _mongo_client.close()
    except Exception:  # pragma: no cover
        pass
