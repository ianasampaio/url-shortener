from typing import Any

from pymongo import ASCENDING, DESCENDING, AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import CollectionInvalid

from app.config import Settings

URLS_COLLECTION = "urls"
USERS_COLLECTION = "users"
CLICKS_COLLECTION = "clicks"

# hours: clicks on one link usually arrive hours apart, so a bucket spans up to 30 days.
CLICKS_TIMESERIES = {"timeField": "timestamp", "metaField": "meta", "granularity": "hours"}

# Phase 1 expired every link 30 days after createdAt; replaced by the expiresAt TTL.
LEGACY_TTL_INDEX = "createdAt_1"

URLS_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["_id", "originalUrl", "ownerId", "createdAt"],
        "properties": {
            "_id": {
                "bsonType": "string",
                "pattern": "^[a-zA-Z0-9]{6,8}$",
                "description": "short code, e.g. aB3xK9",
            },
            "originalUrl": {"bsonType": "string", "pattern": "^https?://"},
            "ownerId": {"bsonType": "objectId"},
            "createdAt": {"bsonType": "date"},
            "expiresAt": {"bsonType": "date", "description": "absent = never expires"},
            "clickCount": {"bsonType": ["int", "long"], "description": "human clicks only"},
        },
    }
}

USERS_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["_id", "email", "passwordHash", "createdAt"],
        "properties": {
            "_id": {"bsonType": "objectId"},
            "email": {"bsonType": "string"},
            "passwordHash": {"bsonType": "string"},
            "createdAt": {"bsonType": "date"},
        },
    }
}


def create_client(settings: Settings) -> AsyncMongoClient:
    return AsyncMongoClient(settings.mongo_uri, tz_aware=True)


def get_database(client: AsyncMongoClient, settings: Settings) -> AsyncDatabase:
    return client[settings.mongo_db]


async def _ensure_collection(
    db: AsyncDatabase, existing: list[str], name: str, validator: dict[str, Any]
) -> None:
    if name in existing:
        # create_collection never touches an existing collection, so apply schema changes here.
        await db.command("collMod", name, validator=validator)
        return

    try:
        await db.create_collection(name, validator=validator)
    except CollectionInvalid:
        # Another instance created it between the check and the create; make sure the
        # validator is the current one anyway.
        await db.command("collMod", name, validator=validator)


async def _ensure_clicks_collection(
    db: AsyncDatabase, existing: list[str], retention_seconds: int
) -> None:
    if CLICKS_COLLECTION in existing:
        # Keep retention in sync with CLICKS_RETENTION_DAYS.
        await db.command("collMod", CLICKS_COLLECTION, expireAfterSeconds=retention_seconds)
    else:
        try:
            await db.create_collection(
                CLICKS_COLLECTION,
                timeseries=CLICKS_TIMESERIES,
                expireAfterSeconds=retention_seconds,
            )
        except CollectionInvalid:
            pass

    clicks = db[CLICKS_COLLECTION]
    await clicks.create_index([("meta.linkId", ASCENDING), ("timestamp", DESCENDING)])
    await clicks.create_index([("meta.ownerId", ASCENDING), ("timestamp", DESCENDING)])


async def ensure_schema(db: AsyncDatabase, settings: Settings) -> None:
    existing = await db.list_collection_names()
    await _ensure_collection(db, existing, URLS_COLLECTION, URLS_VALIDATOR)
    await _ensure_collection(db, existing, USERS_COLLECTION, USERS_VALIDATOR)

    urls = db[URLS_COLLECTION]
    if LEGACY_TTL_INDEX in await urls.index_information():
        await urls.drop_index(LEGACY_TTL_INDEX)
    # expireAfterSeconds=0: each link is removed at its own expiresAt; links without it never are.
    await urls.create_index([("expiresAt", ASCENDING)], expireAfterSeconds=0)
    await urls.create_index([("ownerId", ASCENDING), ("createdAt", DESCENDING)])

    await db[USERS_COLLECTION].create_index([("email", ASCENDING)], unique=True)

    await _ensure_clicks_collection(db, existing, settings.clicks_retention_days * 24 * 60 * 60)
