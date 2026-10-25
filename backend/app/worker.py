"""RQ job that turns a raw redirect event into a stored click.

Run with: rq worker --worker-class rq.worker.SimpleWorker --url $REDIS_URL clicks
SimpleWorker runs jobs in-process, so the clients below are created once per worker.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from bson import ObjectId
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from pymongo import MongoClient
from pymongo.database import Database
from redis import Redis

from app.analytics.bots import detect_bot
from app.analytics.geo import GeoLookup
from app.analytics.referer import primary_language, referer_domain
from app.analytics.useragent import parse_user_agent
from app.analytics.visitor import daily_salt, visitor_hash
from app.config import get_settings
from app.db import CLICKS_COLLECTION, URLS_COLLECTION


class ClickEvent(BaseModel):
    """What the redirect publishes; see app.click_queue.build_event."""

    model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True)

    code: str
    owner_id: str
    timestamp: datetime
    ip: str | None
    user_agent: str
    referer: str | None
    accept_language: str | None


class Click(BaseModel):
    """What gets stored. No IP: it only feeds the visitor hash and the geo lookup."""

    model_config = ConfigDict(
        alias_generator=to_camel, validate_by_name=True, arbitrary_types_allowed=True
    )

    timestamp: datetime
    meta: dict[str, Any]
    visitor_hash: str
    geo: dict[str, str] | None = None
    browser: dict[str, str | None] | None = None
    os: dict[str, str] | None = None
    device: str
    is_bot: bool
    bot_name: str | None = None
    referer: str | None = None
    language: str | None = None

    def to_document(self) -> dict[str, Any]:
        # Unknown values are omitted from the document rather than stored as null.
        return self.model_dump(by_alias=True, exclude_none=True)


@dataclass
class WorkerContext:
    db: Database
    redis: Redis
    geo: GeoLookup


_context: WorkerContext | None = None


def get_context() -> WorkerContext:
    global _context
    if _context is None:
        settings = get_settings()
        mongo = MongoClient(settings.mongo_uri, tz_aware=True)
        _context = WorkerContext(
            db=mongo[settings.mongo_db],
            redis=Redis.from_url(settings.redis_url),
            geo=GeoLookup(settings.geoip_db_path),
        )
    return _context


def build_click(event: ClickEvent, redis: Redis, geo: GeoLookup) -> Click:
    bot_name = detect_bot(event.user_agent)
    salt = daily_salt(redis, event.timestamp.date())
    return Click(
        timestamp=event.timestamp,
        meta={"linkId": event.code, "ownerId": ObjectId(event.owner_id)},
        visitor_hash=visitor_hash(salt, event.code, event.ip or "", event.user_agent),
        geo=geo.lookup(event.ip),
        is_bot=bot_name is not None,
        bot_name=bot_name,
        referer=referer_domain(event.referer),
        language=primary_language(event.accept_language),
        **parse_user_agent(event.user_agent),
    )


def record_click(db: Database, click: Click) -> None:
    db[CLICKS_COLLECTION].insert_one(click.to_document())
    if not click.is_bot:
        # No-op if the link was deleted meanwhile.
        db[URLS_COLLECTION].update_one({"_id": click.meta["linkId"]}, {"$inc": {"clickCount": 1}})


def process_click(raw_event: dict[str, Any]) -> None:
    context = get_context()
    event = ClickEvent.model_validate(raw_event)
    record_click(context.db, build_click(event, context.redis, context.geo))
