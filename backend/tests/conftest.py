import os

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient

# Forced (not setdefault) so the suite never runs against the dev database.
os.environ["MONGO_DB"] = "url_shortener_test"

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def mongo():
    settings = get_settings()
    client = MongoClient(settings.mongo_uri, tz_aware=True)
    client.drop_database(settings.mongo_db)
    yield client[settings.mongo_db]
    client.close()


@pytest.fixture
def client(mongo):
    with TestClient(app, follow_redirects=False) as c:
        yield c
