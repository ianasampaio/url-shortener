import re
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import RedirectResponse

from app.codes import CODE_PATTERN
from app.deps import DbDep
from app.repository import find_link

router = APIRouter(tags=["redirect"])


@router.get("/{code}", response_class=RedirectResponse, status_code=status.HTTP_302_FOUND)
async def redirect(code: str, db: DbDep) -> RedirectResponse:
    # Validated by hand so a malformed code is a 404, not a 422.
    doc = await find_link(db, code) if re.fullmatch(CODE_PATTERN, code) else None
    # The TTL monitor runs about once a minute, so an expired link can still be in the collection.
    expires_at = doc.get("expiresAt") if doc else None
    if doc is None or (expires_at is not None and expires_at <= datetime.now(UTC)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")

    return RedirectResponse(doc["originalUrl"], status_code=status.HTTP_302_FOUND)
