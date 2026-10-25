from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "url_shortener"
    redis_url: str = "redis://localhost:6379/0"
    base_url: str = "http://localhost:8000"
    code_length: int = Field(default=7, ge=6, le=8)

    # 32+ bytes so HS256 keys are not brute-forceable.
    jwt_secret: str = Field(min_length=32)
    jwt_expires_days: int = Field(default=7, ge=1)
    cookie_secure: bool = True
    allowed_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://localhost:8000",
    ]

    # Click analytics (phase 2.2).
    geoip_db_path: str = ""
    clicks_retention_days: int = Field(default=395, ge=1)
    clicks_queue: str = "clicks"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
