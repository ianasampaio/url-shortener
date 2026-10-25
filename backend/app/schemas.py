from datetime import UTC, date, datetime, timedelta
from enum import StrEnum
from typing import Annotated, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    HttpUrl,
    UrlConstraints,
    field_validator,
    model_validator,
)
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
    click_count: int = 0


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


DEFAULT_STATS_DAYS = 30
MAX_STATS_DAYS = 400


class StatsQuery(CamelModel):
    """Query string of GET /api/links/{code}/stats. Dates are whole days in tz."""

    from_: date | None = Field(default=None, alias="from")
    to: date | None = None
    tz: str = "UTC"
    include_bots: bool = False

    @field_validator("tz")
    @classmethod
    def known_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Unknown IANA time zone") from None
        return value

    @model_validator(mode="after")
    def default_and_check_range(self) -> Self:
        if self.to is None:
            self.to = datetime.now(ZoneInfo(self.tz)).date()
        if self.from_ is None:
            self.from_ = self.to - timedelta(days=DEFAULT_STATS_DAYS - 1)
        if self.from_ > self.to:
            raise ValueError("'from' must not be after 'to'")
        if (self.to - self.from_).days + 1 > MAX_STATS_DAYS:
            raise ValueError(f"The period cannot exceed {MAX_STATS_DAYS} days")
        return self

    def utc_bounds(self) -> tuple[datetime, datetime]:
        """[start, end) in UTC covering from..to inclusive, DST-aware."""
        zone = ZoneInfo(self.tz)
        start = datetime.combine(self.from_, datetime.min.time(), tzinfo=zone)
        end = datetime.combine(self.to + timedelta(days=1), datetime.min.time(), tzinfo=zone)
        return start.astimezone(UTC), end.astimezone(UTC)


class StatsTotals(CamelModel):
    clicks: int
    # Sum of daily unique visitors: the visitor hash rotates daily, so the same person
    # on two days counts twice.
    unique_visitors: int
    bot_hits: int


class DailyStats(CamelModel):
    date: date
    clicks: int
    unique_visitors: int


class RankEntry(CamelModel):
    # None = unknown (for referers: direct access); "other" = everything past the top 10.
    key: str | None
    clicks: int


class BotEntry(CamelModel):
    key: str
    hits: int


class StatsOut(CamelModel):
    code: str
    from_: date = Field(alias="from")
    to: date
    tz: str
    totals: StatsTotals
    daily: list[DailyStats]
    countries: list[RankEntry]
    regions: list[RankEntry]
    referers: list[RankEntry]
    browsers: list[RankEntry]
    os: list[RankEntry]
    devices: list[RankEntry]
    bots: list[BotEntry]
