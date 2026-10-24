from datetime import UTC, datetime, timedelta
from typing import Any

from bson import ObjectId
from pymongo import DESCENDING
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.codes import generate_code
from app.db import URLS_COLLECTION, USERS_COLLECTION

MAX_INSERT_ATTEMPTS = 5


class CodeSpaceExhaustedError(Exception):
    """Every generated code collided with an existing one."""


class EmailAlreadyRegisteredError(Exception):
    """A user with this email already exists."""


def now() -> datetime:
    # BSON dates have millisecond precision; truncate so the value we return
    # matches the one stored.
    current = datetime.now(UTC)
    return current.replace(microsecond=current.microsecond // 1000 * 1000)


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def insert_link(
    db: AsyncDatabase,
    original_url: str,
    code_length: int,
    owner_id: ObjectId,
    expires_in: timedelta | None,
) -> dict[str, Any]:
    for _ in range(MAX_INSERT_ATTEMPTS):
        created_at = now()
        doc = {
            "_id": generate_code(code_length),
            "originalUrl": original_url,
            "ownerId": owner_id,
            "createdAt": created_at,
        }
        if expires_in is not None:
            doc["expiresAt"] = created_at + expires_in
        try:
            await db[URLS_COLLECTION].insert_one(doc)
        except DuplicateKeyError:
            continue
        return doc

    raise CodeSpaceExhaustedError


async def find_link(db: AsyncDatabase, code: str) -> dict[str, Any] | None:
    return await db[URLS_COLLECTION].find_one({"_id": code})


async def list_links(
    db: AsyncDatabase, owner_id: ObjectId, page: int, page_size: int
) -> tuple[list[dict[str, Any]], int]:
    # Expired links can linger until the TTL monitor runs, so filter them out here too.
    query = {
        "ownerId": owner_id,
        "$or": [{"expiresAt": {"$exists": False}}, {"expiresAt": {"$gt": datetime.now(UTC)}}],
    }
    urls = db[URLS_COLLECTION]
    cursor = (
        urls.find(query)
        .sort([("createdAt", DESCENDING), ("_id", DESCENDING)])
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    return await cursor.to_list(), await urls.count_documents(query)


async def delete_link(db: AsyncDatabase, code: str, owner_id: ObjectId) -> bool:
    result = await db[URLS_COLLECTION].delete_one({"_id": code, "ownerId": owner_id})
    return result.deleted_count == 1


async def create_user(db: AsyncDatabase, email: str, password_hash: str) -> dict[str, Any]:
    doc = {"email": email, "passwordHash": password_hash, "createdAt": now()}
    try:
        result = await db[USERS_COLLECTION].insert_one(doc)
    except DuplicateKeyError:
        raise EmailAlreadyRegisteredError from None
    return {"_id": result.inserted_id, **doc}


async def find_user_by_email(db: AsyncDatabase, email: str) -> dict[str, Any] | None:
    return await db[USERS_COLLECTION].find_one({"email": email})


async def find_user_by_id(db: AsyncDatabase, user_id: ObjectId) -> dict[str, Any] | None:
    return await db[USERS_COLLECTION].find_one({"_id": user_id})


async def delete_user(db: AsyncDatabase, user_id: ObjectId) -> None:
    # Links first: if this stops halfway, the user still exists and can retry.
    await db[URLS_COLLECTION].delete_many({"ownerId": user_id})
    await db[USERS_COLLECTION].delete_one({"_id": user_id})
