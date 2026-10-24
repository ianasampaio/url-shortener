from datetime import UTC, datetime, timedelta

import pytest


def test_redirects_to_original_url(client):
    code = client.post("/links", json={"url": "https://exemplo.com/destino?a=1"}).json()["code"]

    response = client.get(f"/{code}")

    assert response.status_code == 302
    assert response.headers["location"] == "https://exemplo.com/destino?a=1"


@pytest.mark.parametrize("code", ["ZZZZZZZ", "abc", "abc-def", "abcdefghi"])
def test_unknown_or_malformed_code_returns_404(client, code):
    response = client.get(f"/{code}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Link not found"}


def test_expired_link_returns_404_before_ttl_cleanup(client, monkeypatch):
    # Stub the lookup so the TTL monitor cannot remove the document first and
    # make the test pass for the wrong reason.
    expired = {
        "_id": "OLDLINK",
        "originalUrl": "https://exemplo.com/",
        "createdAt": datetime.now(UTC) - timedelta(days=30, seconds=1),
    }

    async def find_expired(db, code):
        return expired

    monkeypatch.setattr("app.routes.find_link", find_expired)

    response = client.get("/OLDLINK")

    assert response.status_code == 404


def test_link_just_before_expiry_still_redirects(client, mongo):
    mongo.urls.insert_one(
        {
            "_id": "ALMOST1",
            "originalUrl": "https://exemplo.com/",
            "createdAt": datetime.now(UTC) - timedelta(days=30) + timedelta(minutes=1),
        }
    )

    response = client.get("/ALMOST1")

    assert response.status_code == 302
