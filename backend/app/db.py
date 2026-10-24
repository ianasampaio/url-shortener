from datetime import timedelta

from pymongo import ASCENDING, AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import CollectionInvalid

from app.config import Settings

URLS_COLLECTION = "urls"
LINK_TTL = timedelta(days=30)

URLS_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["_id", "originalUrl", "createdAt"],
        "properties": {
            "_id": {
                "bsonType": "string",
                "pattern": "^[a-zA-Z0-9]{6,8}$",
                "description": "short code, e.g. aB3xK9",
            },
            "originalUrl": {"bsonType": "string", "pattern": "^https?://"},
            "createdAt": {"bsonType": "date"},
        },
    }
}


def create_client(settings: Settings) -> AsyncMongoClient:
    return AsyncMongoClient(settings.mongo_uri, tz_aware=True)


def get_database(client: AsyncMongoClient, settings: Settings) -> AsyncDatabase:
    return client[settings.mongo_db]


async def ensure_schema(db: AsyncDatabase) -> None:
    if URLS_COLLECTION not in await db.list_collection_names():
        try:
            await db.create_collection(URLS_COLLECTION, validator=URLS_VALIDATOR)
        except CollectionInvalid:
            # Another instance created it between the check and the create.
            pass

    await db[URLS_COLLECTION].create_index(
        [("createdAt", ASCENDING)],
        expireAfterSeconds=int(LINK_TTL.total_seconds()),
    )
