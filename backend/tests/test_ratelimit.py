from fastapi import Request
from redis.asyncio import Redis

from app.deps import get_redis
from app.main import app
from app.ratelimit import Limit, client_ip
from tests.conftest import PASSWORD, register


def test_link_creation_is_limited_per_user(make_client, monkeypatch):
    monkeypatch.setattr("app.routes.links.LINK_CREATION_LIMIT", Limit("create-link", 2, 3600))
    iana = make_client("iana@exemplo.com")
    other = make_client("outra@exemplo.com")

    statuses = [
        iana.post("/api/links", json={"url": "https://exemplo.com/"}).status_code for _ in range(3)
    ]

    assert statuses == [201, 201, 429]
    # Another user has their own budget.
    assert other.post("/api/links", json={"url": "https://exemplo.com/"}).status_code == 201


def test_429_has_retry_after(user_client, monkeypatch):
    monkeypatch.setattr("app.routes.links.LINK_CREATION_LIMIT", Limit("create-link", 1, 3600))
    user_client.post("/api/links", json={"url": "https://exemplo.com/"})

    response = user_client.post("/api/links", json={"url": "https://exemplo.com/"})

    assert response.status_code == 429
    assert response.json() == {"detail": "Too many requests"}
    assert 0 < int(response.headers["retry-after"]) <= 3600


def test_register_is_limited_per_ip(client):
    for i in range(5):
        register(client, f"pessoa{i}@exemplo.com")

    response = client.post(
        "/api/auth/register", json={"email": "pessoa5@exemplo.com", "password": PASSWORD}
    )

    assert response.status_code == 429


def test_login_is_limited_per_email(client, monkeypatch):
    # Raise the per-IP limit so only the per-email one can trigger.
    monkeypatch.setattr("app.routes.auth.LOGIN_IP_LIMIT", Limit("login-ip", 100, 900))
    attempt = {"email": "iana@exemplo.com", "password": "errada"}

    statuses = [client.post("/api/auth/login", json=attempt).status_code for _ in range(11)]

    assert statuses == [401] * 10 + [429]
    other = {"email": "outra@exemplo.com", "password": "errada"}
    assert client.post("/api/auth/login", json=other).status_code == 401


def test_login_is_limited_per_ip(client, monkeypatch):
    monkeypatch.setattr("app.routes.auth.LOGIN_IP_LIMIT", Limit("login-ip", 3, 900))

    statuses = [
        client.post(
            "/api/auth/login", json={"email": f"p{i}@exemplo.com", "password": "x"}
        ).status_code
        for i in range(4)
    ]

    assert statuses == [401, 401, 401, 429]


def test_requests_go_through_when_redis_is_down(user_client, monkeypatch):
    monkeypatch.setattr("app.routes.links.LINK_CREATION_LIMIT", Limit("create-link", 1, 3600))
    unreachable = Redis.from_url("redis://localhost:1/0", socket_connect_timeout=0.2)
    app.dependency_overrides[get_redis] = lambda: unreachable

    statuses = [
        user_client.post("/api/links", json={"url": "https://exemplo.com/"}).status_code
        for _ in range(3)
    ]

    assert statuses == [201, 201, 201]


def _request(host: str) -> Request:
    return Request({"type": "http", "client": (host, 1234)})


def test_client_ip_groups_ipv6_by_64_prefix():
    a = client_ip(_request("2001:db8:1:2:aaaa::1"))
    b = client_ip(_request("2001:db8:1:2:bbbb::2"))

    assert a == b == "2001:db8:1:2::/64"
    assert client_ip(_request("2001:db8:1:3::1")) != a


def test_client_ip_keeps_ipv4_and_unwraps_mapped_addresses():
    assert client_ip(_request("203.0.113.7")) == "203.0.113.7"
    assert client_ip(_request("::ffff:203.0.113.7")) == "203.0.113.7"
