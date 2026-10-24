from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "url_shortener"
    base_url: str = "http://localhost:8000"
    code_length: int = Field(default=7, ge=6, le=8)


@lru_cache
def get_settings() -> Settings:
    return Settings()
