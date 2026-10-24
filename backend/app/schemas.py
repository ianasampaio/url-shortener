from datetime import datetime, timedelta
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, UrlConstraints
from pydantic.alias_generators import to_camel

MAX_URL_LENGTH = 2048


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True)


class ExpiresIn(StrEnum):
    ONE_DAY = "1d"
    SEVEN_DAYS = "7d"
    THIRTY_DAYS = "30d"
    NEVER = "never"


EXPIRATION: dict[ExpiresIn, timedelta | None] = {
    ExpiresIn.ONE_DAY: timedelta(days=1),
    ExpiresIn.SEVEN_DAYS: timedelta(days=7),
    ExpiresIn.THIRTY_DAYS: timedelta(days=30),
    ExpiresIn.NEVER: None,
}


class LinkCreate(CamelModel):
    url: Annotated[HttpUrl, UrlConstraints(max_length=MAX_URL_LENGTH)]
    expires_in: ExpiresIn = ExpiresIn.THIRTY_DAYS


class LinkOut(CamelModel):
    code: str
    short_url: str
    original_url: str
    created_at: datetime
    expires_at: datetime | None


class LinkPage(CamelModel):
    items: list[LinkOut]
    page: int
    page_size: int
    total: int


class RegisterIn(BaseModel):
    email: EmailStr
    # The upper bound keeps a huge password from being used to burn CPU in argon2.
    password: Annotated[str, Field(min_length=8, max_length=128)]


class LoginIn(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=1, max_length=128)]


class UserOut(CamelModel):
    id: str
    email: str
    created_at: datetime
