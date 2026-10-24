from datetime import UTC, datetime, timedelta

import pytest
from bson import ObjectId


def test_redirects_to_original_url(user_client, client):
    code = user_client.post("/api/links", json={"url": "https://exemplo.com/destino?a=1"}).json()[
        "code"
    ]

    # The redirect is public: an anonymous client follows it too.
    response = client.get(f"/{code}")

    assert response.status_code == 302
    assert response.headers["location"] == "https://exemplo.com/destino?a=1"


@pytest.mark.parametrize("code", ["ZZZZZZZ", "abc", "abc-def", "abcdefghi"])
def test_unknown_or_malformed_code_returns_404(client, code):
    response = client.get(f"/{code}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Link not found"}


def _link(mongo, code: str, **fields) -> None:
    mongo.urls.insert_one(
        {
            "_id": code,
            "originalUrl": "https://exemplo.com/",
            "ownerId": ObjectId(),
            "createdAt": datetime.now(UTC) - timedelta(days=400),
            **fields,
        }
    )


def test_expired_link_returns_404_before_ttl_cleanup(client, monkeypatch):
    # Stub the lookup so the TTL monitor cannot remove the document first and
    # make the test pass for the wrong reason.
    expired = {
        "_id": "OLDLINK",
        "originalUrl": "https://exemplo.com/",
        "createdAt": datetime.now(UTC) - timedelta(days=2),
        "expiresAt": datetime.now(UTC) - timedelta(seconds=1),
    }

    async def find_expired(db, code):
        return expired

    monkeypatch.setattr("app.routes.redirect.find_link", find_expired)

    assert client.get("/OLDLINK").status_code == 404


def test_link_before_expiry_still_redirects(client, mongo):
    _link(mongo, "ALMOST1", expiresAt=datetime.now(UTC) + timedelta(minutes=1))

    assert client.get("/ALMOST1").status_code == 302


def test_link_without_expiration_never_expires(client, mongo):
    # Created long ago (400 days): only expiresAt matters, not createdAt.
    _link(mongo, "FOREVER")

    assert client.get("/FOREVER").status_code == 302
