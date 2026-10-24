from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from app.config import get_settings
from app.db import create_client, ensure_schema, get_database
from app.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    client = create_client(settings)
    app.state.db = get_database(client, settings)
    try:
        await ensure_schema(app.state.db)
        yield
    finally:
        await client.close()


app = FastAPI(title="URL Shortener", lifespan=lifespan)


@app.get("/health")
async def health(request: Request) -> dict[str, str]:
    await request.app.state.db.command("ping")
    return {"status": "ok"}


# Registered after /health so the catch-all GET /{code} does not shadow it.
app.include_router(router)
