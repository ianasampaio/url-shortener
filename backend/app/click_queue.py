import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import Request
from redis import Redis
from redis.exceptions import RedisError
from rq import Queue

from app.config import Settings

logger = logging.getLogger(__name__)

PROCESS_CLICK = "app.worker.process_click"

# The raw event carries the visitor's IP, so it must not linger in Redis.
JOB_OPTIONS = {
    "result_ttl": 0,  # keep no result
    "failure_ttl": 6 * 60 * 60,  # failed jobs (and their IP) gone after 6 hours
    "ttl": 60 * 60,  # an event nobody processed within an hour is dropped
}


def create_queue(settings: Settings) -> Queue:
    # RQ needs the synchronous client. Short timeouts so a Redis outage costs a
    # lost click, never a slow worker thread.
    connection = Redis.from_url(
        settings.redis_url, socket_timeout=0.05, socket_connect_timeout=0.05
    )
    return Queue(settings.clicks_queue, connection=connection)


def build_event(request: Request, link: dict[str, Any]) -> dict[str, Any]:
    headers = request.headers
    return {
        "code": link["_id"],
        "ownerId": str(link["ownerId"]),
        "timestamp": datetime.now(UTC).isoformat(),
        "ip": request.client.host if request.client else None,
        "userAgent": headers.get("user-agent", ""),
        "referer": headers.get("referer"),
        "acceptLanguage": headers.get("accept-language"),
    }


def enqueue_click(queue: Queue, event: dict[str, Any]) -> None:
    """Runs as a background task, after the redirect response was sent."""
    try:
        queue.enqueue_call(
            PROCESS_CLICK,
            args=(event,),
            # RQ logs and stores the description; the default one would spell out the
            # arguments, IP included.
            description=f"click on {event['code']}",
            **JOB_OPTIONS,
        )
    except RedisError:
        # The visitor was already redirected; only this click is lost.
        logger.warning("Click not recorded, Redis unavailable", exc_info=True)
