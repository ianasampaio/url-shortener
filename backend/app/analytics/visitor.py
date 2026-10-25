import hashlib
import secrets
from datetime import date

from redis import Redis

# Two days, so a click processed shortly after midnight UTC still finds yesterday's salt.
SALT_TTL_SECONDS = 48 * 60 * 60


def daily_salt(redis: Redis, day: date) -> str:
    key = f"salt:{day.isoformat()}"
    # NX: the first worker of the day creates it, every other one reads the same value.
    redis.set(key, secrets.token_hex(16), nx=True, ex=SALT_TTL_SECONDS)
    return redis.get(key).decode()


def visitor_hash(salt: str, code: str, ip: str, user_agent: str) -> str:
    """Anonymous visitor id, stable only within one day and one link.

    The salt rotates daily and is then discarded, so the hash cannot follow someone
    across days or links, and the IP never needs to be stored.
    """
    return hashlib.sha256(f"{salt}|{code}|{ip}|{user_agent}".encode()).hexdigest()
