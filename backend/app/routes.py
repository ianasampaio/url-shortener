import re
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pymongo.asynchronous.database import AsyncDatabase

from app.codes import CODE_PATTERN
from app.config import Settings, get_settings
from app.db import LINK_TTL
from app.repository import CodeSpaceExhaustedError, find_link, insert_link
from app.schemas import LinkCreate, LinkOut

router = APIRouter()


def get_db(request: Request) -> AsyncDatabase:
    return request.app.state.db


DbDep = Annotated[AsyncDatabase, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.post("/links", status_code=status.HTTP_201_CREATED, response_model=LinkOut)
async def create_link(payload: LinkCreate, db: DbDep, settings: SettingsDep) -> LinkOut:
    try:
        doc = await insert_link(db, str(payload.url), settings.code_length)
    except CodeSpaceExhaustedError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not generate a unique code",
        ) from None

    return LinkOut(
        code=doc["_id"],
        short_url=f"{settings.base_url.rstrip('/')}/{doc['_id']}",
        original_url=doc["originalUrl"],
        expires_at=doc["createdAt"] + LINK_TTL,
    )


@router.get("/{code}", response_class=RedirectResponse, status_code=status.HTTP_302_FOUND)
async def redirect(code: str, db: DbDep) -> RedirectResponse:
    # Validated by hand so a malformed code is a 404, not a 422.
    doc = await find_link(db, code) if re.fullmatch(CODE_PATTERN, code) else None
    # The TTL monitor runs about once a minute, so an expired link can still be in the collection.
    if doc is None or doc["createdAt"] <= datetime.now(UTC) - LINK_TTL:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")

    return RedirectResponse(doc["originalUrl"], status_code=status.HTTP_302_FOUND)
