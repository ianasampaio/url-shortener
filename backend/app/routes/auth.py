from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.concurrency import run_in_threadpool

from app.deps import CurrentUser, DbDep, RedisDep, SettingsDep
from app.ratelimit import Limit, client_ip, enforce_limit
from app.repository import (
    EmailAlreadyRegisteredError,
    create_user,
    delete_user,
    find_user_by_email,
    normalize_email,
)
from app.schemas import LoginIn, RegisterIn, UserOut
from app.security import (
    DUMMY_PASSWORD_HASH,
    clear_auth_cookie,
    create_access_token,
    hash_password,
    set_auth_cookie,
    verify_password,
)

router = APIRouter(tags=["auth"])

REGISTER_LIMIT = Limit("register", max_requests=5, window_seconds=60 * 60)
LOGIN_IP_LIMIT = Limit("login-ip", max_requests=10, window_seconds=15 * 60)
# Per email too, so attempts spread over many IPs still cannot hammer one account.
LOGIN_EMAIL_LIMIT = Limit("login-email", max_requests=10, window_seconds=15 * 60)


def to_user_out(user: dict[str, Any]) -> UserOut:
    return UserOut(id=str(user["_id"]), email=user["email"], created_at=user["createdAt"])


@router.post("/auth/register", status_code=status.HTTP_201_CREATED, response_model=UserOut)
async def register(
    payload: RegisterIn,
    request: Request,
    response: Response,
    db: DbDep,
    redis: RedisDep,
    settings: SettingsDep,
) -> UserOut:
    await enforce_limit(redis, REGISTER_LIMIT, client_ip(request))

    # argon2 is CPU-bound by design; keep it off the event loop.
    password_hash = await run_in_threadpool(hash_password, payload.password)
    try:
        user = await create_user(db, normalize_email(payload.email), password_hash)
    except EmailAlreadyRegisteredError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        ) from None

    set_auth_cookie(response, create_access_token(str(user["_id"]), settings), settings)
    return to_user_out(user)


@router.post("/auth/login", response_model=UserOut)
async def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    db: DbDep,
    redis: RedisDep,
    settings: SettingsDep,
) -> UserOut:
    email = normalize_email(payload.email)
    await enforce_limit(redis, LOGIN_IP_LIMIT, client_ip(request))
    await enforce_limit(redis, LOGIN_EMAIL_LIMIT, email)

    user = await find_user_by_email(db, email)
    password_hash = user["passwordHash"] if user else DUMMY_PASSWORD_HASH
    valid = await run_in_threadpool(verify_password, payload.password, password_hash)
    if user is None or not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )

    set_auth_cookie(response, create_access_token(str(user["_id"]), settings), settings)
    return to_user_out(user)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(settings: SettingsDep) -> Response:
    # The token itself stays valid until it expires (accepted risk, see the README).
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookie(response, settings)
    return response


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return to_user_out(user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(user: CurrentUser, db: DbDep, settings: SettingsDep) -> Response:
    await delete_user(db, user["_id"])
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookie(response, settings)
    return response
