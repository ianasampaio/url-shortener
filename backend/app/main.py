from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Request
from redis.asyncio import Redis

from app.click_queue import create_queue
from app.config import get_settings
from app.db import create_client, ensure_schema, get_database
from app.deps import check_origin
from app.routes import auth, links, redirect


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    client = create_client(settings)
    # Short timeouts: when Redis is down, rate limiting is skipped instead of stalling requests.
    app.state.redis = Redis.from_url(
        settings.redis_url, socket_timeout=0.5, socket_connect_timeout=0.5
    )
    app.state.click_queue = create_queue(settings)
    app.state.db = get_database(client, settings)
    try:
        await ensure_schema(app.state.db, settings)
        yield
    finally:
        app.state.click_queue.connection.close()
        await app.state.redis.aclose()
        await client.close()


app = FastAPI(title="URL Shortener", lifespan=lifespan)

api = APIRouter(prefix="/api", dependencies=[Depends(check_origin)])
api.include_router(auth.router)
api.include_router(links.router)
app.include_router(api)


@app.get("/health")
async def health(request: Request) -> dict[str, str]:
    await request.app.state.db.command("ping")
    return {"status": "ok"}


# Registered last so the catch-all GET /{code} does not shadow /health or /api.
app.include_router(redirect.router)
