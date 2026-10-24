from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.config import Settings, get_settings
from app.main import app
from app.security import COOKIE_NAME
from tests.conftest import PASSWORD, register


def test_register_logs_the_user_in(client, mongo):
    response = register(client, "Iana@Exemplo.com ")

    body = response.json()
    assert body["email"] == "iana@exemplo.com"
    assert set(body) == {"id", "email", "createdAt"}
    assert COOKIE_NAME in client.cookies
    assert client.get("/api/me").json() == body

    user = mongo.users.find_one({"email": "iana@exemplo.com"})
    assert user["passwordHash"].startswith("$argon2id$")


def test_auth_cookie_attributes(client):
    cookie = register(client, "iana@exemplo.com").headers["set-cookie"]

    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie
    assert f"Max-Age={7 * 24 * 60 * 60}" in cookie
    assert "Secure" not in cookie


def test_auth_cookie_is_secure_when_configured(client):
    app.dependency_overrides[get_settings] = lambda: Settings(cookie_secure=True)

    cookie = register(client, "iana@exemplo.com").headers["set-cookie"]

    assert "Secure" in cookie


def test_register_rejects_duplicate_email_ignoring_case(client):
    register(client, "iana@exemplo.com")

    response = client.post(
        "/api/auth/register", json={"email": "IANA@exemplo.com", "password": PASSWORD}
    )

    assert response.status_code == 409


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "iana@exemplo.com", "password": "curta"},
        {"email": "iana@exemplo.com", "password": "x" * 129},
        {"email": "não é email", "password": PASSWORD},
        {"email": "iana@exemplo.com"},
    ],
)
def test_register_validates_input(client, payload):
    assert client.post("/api/auth/register", json=payload).status_code == 422


def test_login(make_client):
    register(make_client(), "iana@exemplo.com")
    client = make_client()

    response = client.post(
        "/api/auth/login", json={"email": " IANA@exemplo.com", "password": PASSWORD}
    )

    assert response.status_code == 200
    assert response.json()["email"] == "iana@exemplo.com"
    assert client.get("/api/me").status_code == 200


@pytest.mark.parametrize(
    "credentials",
    [
        {"email": "iana@exemplo.com", "password": "senha errada"},
        {"email": "ninguem@exemplo.com", "password": PASSWORD},
    ],
)
def test_login_failure_does_not_reveal_which_part_is_wrong(make_client, credentials):
    register(make_client(), "iana@exemplo.com")
    client = make_client()

    response = client.post("/api/auth/login", json=credentials)

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid email or password"}
    assert COOKIE_NAME not in client.cookies


def test_me_requires_login(client):
    response = client.get("/api/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def _token(user_id: str, *, secret: str, algorithm: str = "HS256", **overrides) -> str:
    now = datetime.now(UTC)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(days=1), **overrides}
    return jwt.encode(payload, secret, algorithm=algorithm)


@pytest.mark.parametrize(
    "make_token",
    [
        lambda uid, secret: _token(uid, secret=secret, exp=datetime.now(UTC) - timedelta(1)),
        lambda uid, secret: _token(uid, secret="another-secret-with-32-characters-x"),
        lambda uid, secret: _token(uid, secret=None, algorithm="none"),
        lambda uid, secret: jwt.encode({"sub": uid}, secret, algorithm="HS256"),
        lambda uid, secret: "not-a-jwt",
    ],
    ids=["expired", "wrong-signature", "alg-none", "no-exp", "garbage"],
)
def test_invalid_tokens_are_rejected(user_client, make_token):
    user_id = user_client.get("/api/me").json()["id"]
    user_client.cookies.set(COOKIE_NAME, make_token(user_id, get_settings().jwt_secret))

    assert user_client.get("/api/me").status_code == 401


def test_logout_clears_the_cookie(user_client):
    response = user_client.post("/api/auth/logout")

    assert response.status_code == 204
    assert COOKIE_NAME not in user_client.cookies
    assert user_client.get("/api/me").status_code == 401


def test_delete_account_removes_user_and_links(user_client, mongo):
    token = user_client.cookies[COOKIE_NAME]
    user_client.post("/api/links", json={"url": "https://exemplo.com/"})

    response = user_client.delete("/api/me")

    assert response.status_code == 204
    assert mongo.users.count_documents({}) == 0
    assert mongo.urls.count_documents({}) == 0
    # The old token is still validly signed, but its user no longer exists.
    user_client.cookies.set(COOKIE_NAME, token)
    assert user_client.get("/api/me").status_code == 401
