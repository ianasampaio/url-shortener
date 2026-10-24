import re
from datetime import UTC, datetime, timedelta
from itertools import chain, repeat

import pytest

from app.config import Settings, get_settings
from app.main import app


def test_create_link(client, mongo):
    response = client.post("/links", json={"url": "https://exemplo.com/um/caminho/longo"})

    assert response.status_code == 201
    body = response.json()
    assert re.fullmatch(r"[a-zA-Z0-9]{7}", body["code"])
    assert body["shortUrl"] == f"http://localhost:8000/{body['code']}"
    assert body["originalUrl"] == "https://exemplo.com/um/caminho/longo"

    doc = mongo.urls.find_one({"_id": body["code"]})
    assert doc["originalUrl"] == "https://exemplo.com/um/caminho/longo"
    assert abs(doc["createdAt"] - datetime.now(UTC)) < timedelta(seconds=5)
    expires_at = datetime.fromisoformat(body["expiresAt"])
    assert expires_at == doc["createdAt"] + timedelta(days=30)


def test_create_link_normalizes_url(client):
    response = client.post("/links", json={"url": "HTTPS://Exemplo.com"})

    assert response.json()["originalUrl"] == "https://exemplo.com/"


def test_same_url_gets_a_new_code_each_time(client):
    first = client.post("/links", json={"url": "https://exemplo.com/"}).json()
    second = client.post("/links", json={"url": "https://exemplo.com/"}).json()

    assert first["code"] != second["code"]


def test_code_length_is_configurable(client):
    app.dependency_overrides[get_settings] = lambda: Settings(code_length=6)
    try:
        response = client.post("/links", json={"url": "https://exemplo.com/"})
    finally:
        app.dependency_overrides.clear()

    assert len(response.json()["code"]) == 6


@pytest.mark.parametrize(
    "payload",
    [
        {"url": "ftp://exemplo.com/arquivo"},
        {"url": "exemplo.com"},
        {"url": "não é uma url"},
        {"url": "https://exemplo.com/" + "a" * 2048},
        {},
    ],
)
def test_create_link_rejects_invalid_url(client, payload):
    response = client.post("/links", json=payload)

    assert response.status_code == 422


def test_create_link_retries_on_collision(client, mongo, monkeypatch):
    mongo.urls.insert_one(
        {"_id": "AAAAAAA", "originalUrl": "https://antigo.com/", "createdAt": datetime.now(UTC)}
    )
    codes = iter(["AAAAAAA", "AAAAAAA", "BBBBBBB"])
    monkeypatch.setattr("app.repository.generate_code", lambda length: next(codes))

    response = client.post("/links", json={"url": "https://novo.com/"})

    assert response.status_code == 201
    assert response.json()["code"] == "BBBBBBB"
    assert mongo.urls.find_one({"_id": "AAAAAAA"})["originalUrl"] == "https://antigo.com/"


def test_create_link_gives_up_after_repeated_collisions(client, mongo, monkeypatch):
    mongo.urls.insert_one(
        {"_id": "AAAAAAA", "originalUrl": "https://antigo.com/", "createdAt": datetime.now(UTC)}
    )
    codes = chain(repeat("AAAAAAA", 5), ["BBBBBBB"])
    monkeypatch.setattr("app.repository.generate_code", lambda length: next(codes))

    response = client.post("/links", json={"url": "https://novo.com/"})

    assert response.status_code == 503
    assert mongo.urls.count_documents({}) == 1
