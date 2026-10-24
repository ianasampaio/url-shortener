from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.codes import generate_code
from app.db import URLS_COLLECTION

MAX_INSERT_ATTEMPTS = 5


class CodeSpaceExhaustedError(Exception):
    """Every generated code collided with an existing one."""


def _now() -> datetime:
    # BSON dates have millisecond precision; truncate so the value we return
    # matches the one stored.
    now = datetime.now(UTC)
    return now.replace(microsecond=now.microsecond // 1000 * 1000)


async def insert_link(db: AsyncDatabase, original_url: str, code_length: int) -> dict[str, Any]:
    for _ in range(MAX_INSERT_ATTEMPTS):
        doc = {"_id": generate_code(code_length), "originalUrl": original_url, "createdAt": _now()}
        try:
            await db[URLS_COLLECTION].insert_one(doc)
        except DuplicateKeyError:
            continue
        return doc

    raise CodeSpaceExhaustedError


async def find_link(db: AsyncDatabase, code: str) -> dict[str, Any] | None:
    return await db[URLS_COLLECTION].find_one({"_id": code})
