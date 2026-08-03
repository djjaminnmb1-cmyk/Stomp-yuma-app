"""MongoDB client and DB handle.

Import ``db`` anywhere you need to talk to Mongo. `client` is exposed
separately so shutdown handlers can close it.
"""
from motor.motor_asyncio import AsyncIOMotorClient

from core.config import DB_NAME, MONGO_URL

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
