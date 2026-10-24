import os
from contextlib import ExitStack

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient
from redis import Redis

# Forced (not setdefault) so the suite never runs against the dev database or Redis.
os.environ["MONGO_DB"] = "url_shortener_test"
os.environ["REDIS_URL"] = "redis://localhost:6379/15"
os.environ["JWT_SECRET"] = "test-secret-with-at-least-32-characters"
# TestClient talks plain http://, where a Secure cookie would never be sent back.
os.environ["COOKIE_SECURE"] = "false"

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402

PASSWORD = "correct horse battery"


@pytest.fixture
def mongo():
    settings = get_settings()
    client = MongoClient(settings.mongo_uri, tz_aware=True)
    client.drop_database(settings.mongo_db)
    yield client[settings.mongo_db]
    client.close()


@pytest.fixture
def redis():
    client = Redis.from_url(get_settings().redis_url)
    client.flushdb()
    yield client
    client.close()


def register(client: "Session", email: str, password: str = PASSWORD):
    response = client.post("/api/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text
    return response


class Session:
    """One user's cookie jar over the shared TestClient.

    Each TestClient runs the lifespan on its own event loop and the app keeps a single
    AsyncMongoClient in app.state, so two TestClients open at once would clash. Sessions
    share one TestClient and swap in their own cookies for each request.
    """

    def __init__(self, client: TestClient):
        self._client = client
        self.cookies = httpx.Cookies()

    def request(self, method: str, url: str, **kwargs) -> httpx.Response:
        self._client.cookies = self.cookies
        try:
            return self._client.request(method, url, **kwargs)
        finally:
            self.cookies = self._client.cookies

    def get(self, url: str, **kwargs) -> httpx.Response:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs) -> httpx.Response:
        return self.request("POST", url, **kwargs)

    def delete(self, url: str, **kwargs) -> httpx.Response:
        return self.request("DELETE", url, **kwargs)


@pytest.fixture
def make_client(mongo, redis):
    """Build sessions, each with its own cookies; logged in when given an email.

    The app starts (lifespan) on the first call, so a test can prepare the database first.
    """
    with ExitStack() as stack:
        shared: list[TestClient] = []

        def _make(email: str | None = None) -> Session:
            if not shared:
                shared.append(stack.enter_context(TestClient(app, follow_redirects=False)))
            session = Session(shared[0])
            if email is not None:
                register(session, email)
            return session

        yield _make
    app.dependency_overrides.clear()


@pytest.fixture
def client(make_client):
    return make_client()


@pytest.fixture
def user_client(make_client):
    return make_client("iana@exemplo.com")
