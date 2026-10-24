import ipaddress
import logging
import time
from dataclasses import dataclass

from fastapi import HTTPException, Request, status
from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Limit:
    name: str
    max_requests: int
    window_seconds: int


async def enforce_limit(redis: Redis, limit: Limit, subject: str) -> None:
    """Count one request for subject in a fixed window; raise 429 once over the limit."""
    now = int(time.time())
    window = now // limit.window_seconds
    key = f"rl:{limit.name}:{subject}:{window}"

    try:
        async with redis.pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.expire(key, limit.window_seconds, nx=True)
            count, _ = await pipe.execute()
    except RedisError:
        # Availability over protection: without Redis the request goes through unlimited.
        logger.warning("Rate limit skipped, Redis unavailable", exc_info=True)
        return

    if count > limit.max_requests:
        retry_after = limit.window_seconds - now % limit.window_seconds
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests",
            headers={"Retry-After": str(retry_after)},
        )


def client_ip(request: Request) -> str:
    # Behind a proxy, uvicorn --proxy-headers --forwarded-allow-ips=<proxy> fills
    # request.client from X-Forwarded-For; the header is never read directly.
    host = request.client.host if request.client else "unknown"
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return host

    if ip.version == 6:
        if ip.ipv4_mapped:
            return str(ip.ipv4_mapped)
        # A single IPv6 connection gets a whole /64, so limit the prefix, not the address.
        return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    return str(ip)
