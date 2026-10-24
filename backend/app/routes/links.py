from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.blocklist import is_blocked_host
from app.config import Settings
from app.deps import CurrentUser, DbDep, RedisDep, SettingsDep
from app.ratelimit import Limit, enforce_limit
from app.repository import CodeSpaceExhaustedError, delete_link, insert_link, list_links
from app.schemas import EXPIRATION, LinkCreate, LinkOut, LinkPage

router = APIRouter(tags=["links"])

LINK_CREATION_LIMIT = Limit("create-link", max_requests=50, window_seconds=60 * 60)


def to_link_out(doc: dict[str, Any], settings: Settings) -> LinkOut:
    return LinkOut(
        code=doc["_id"],
        short_url=f"{settings.base_url.rstrip('/')}/{doc['_id']}",
        original_url=doc["originalUrl"],
        created_at=doc["createdAt"],
        expires_at=doc.get("expiresAt"),
    )


@router.post("/links", status_code=status.HTTP_201_CREATED, response_model=LinkOut)
async def create_link(
    payload: LinkCreate, user: CurrentUser, db: DbDep, redis: RedisDep, settings: SettingsDep
) -> LinkOut:
    await enforce_limit(redis, LINK_CREATION_LIMIT, str(user["_id"]))

    if is_blocked_host(payload.url.host or "", settings.base_url):
        # Same shape as FastAPI's own validation errors, so clients handle one format.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[
                {
                    "type": "blocked_url",
                    "loc": ["body", "url"],
                    "msg": "URLs pointing to this service or to other URL shorteners "
                    "are not allowed",
                    "input": str(payload.url),
                }
            ],
        )

    try:
        doc = await insert_link(
            db,
            str(payload.url),
            settings.code_length,
            owner_id=user["_id"],
            expires_in=EXPIRATION[payload.expires_in],
        )
    except CodeSpaceExhaustedError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not generate a unique code",
        ) from None

    return to_link_out(doc, settings)


@router.get("/links", response_model=LinkPage)
async def list_my_links(
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> LinkPage:
    docs, total = await list_links(db, user["_id"], page, page_size)
    return LinkPage(
        items=[to_link_out(doc, settings) for doc in docs],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.delete("/links/{code}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_link(code: str, user: CurrentUser, db: DbDep) -> Response:
    # Someone else's link is a 404 too, so the response never confirms that a code exists.
    if not await delete_link(db, code, user["_id"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
