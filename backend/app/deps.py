from typing import Annotated, Any

from bson import ObjectId
from fastapi import Depends, HTTPException, Request, status
from pymongo.asynchronous.database import AsyncDatabase
from redis.asyncio import Redis
from rq import Queue

from app.config import Settings, get_settings
from app.repository import find_user_by_id
from app.security import COOKIE_NAME, decode_access_token

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def get_db(request: Request) -> AsyncDatabase:
    return request.app.state.db


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


def get_click_queue(request: Request) -> Queue:
    return request.app.state.click_queue


DbDep = Annotated[AsyncDatabase, Depends(get_db)]
RedisDep = Annotated[Redis, Depends(get_redis)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
ClickQueueDep = Annotated[Queue, Depends(get_click_queue)]


async def current_user(request: Request, db: DbDep, settings: SettingsDep) -> dict[str, Any]:
    token = request.cookies.get(COOKIE_NAME)
    user_id = decode_access_token(token, settings) if token else None
    # The account may have been deleted after the token was issued.
    user = await find_user_by_id(db, ObjectId(user_id)) if ObjectId.is_valid(user_id) else None
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


CurrentUser = Annotated[dict[str, Any], Depends(current_user)]


async def check_origin(request: Request, settings: SettingsDep) -> None:
    """CSRF guard: the auth cookie goes with every request, so reject foreign origins.

    Browsers always send Origin on unsafe methods; requests without it come from
    non-browser clients, which CSRF does not affect.
    """
    origin = request.headers.get("origin")
    if (
        request.method in UNSAFE_METHODS
        and origin is not None
        and origin not in settings.allowed_origins
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin not allowed")
