from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, HttpUrl, UrlConstraints
from pydantic.alias_generators import to_camel

MAX_URL_LENGTH = 2048


class LinkCreate(BaseModel):
    url: Annotated[HttpUrl, UrlConstraints(max_length=MAX_URL_LENGTH)]


class LinkOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True)

    code: str
    short_url: str
    original_url: str
    expires_at: datetime
