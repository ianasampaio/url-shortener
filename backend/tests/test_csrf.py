import pytest


@pytest.mark.parametrize(
    ("headers", "status"),
    [
        ({"Origin": "https://malicioso.com"}, 403),
        ({"Origin": "http://localhost:5173"}, 201),
        ({}, 201),
    ],
    ids=["foreign-origin", "allowed-origin", "no-origin"],
)
def test_unsafe_methods_check_origin(user_client, headers, status):
    response = user_client.post("/api/links", json={"url": "https://exemplo.com/"}, headers=headers)

    assert response.status_code == status


def test_safe_methods_ignore_origin(user_client):
    response = user_client.get("/api/me", headers={"Origin": "https://malicioso.com"})

    assert response.status_code == 200


def test_foreign_origin_cannot_log_in(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "iana@exemplo.com", "password": "qualquer"},
        headers={"Origin": "https://malicioso.com"},
    )

    assert response.status_code == 403
