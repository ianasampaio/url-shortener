import re
from datetime import UTC, datetime, timedelta
from itertools import chain, repeat

import pytest
from bson import ObjectId

from app.config import Settings, get_settings
from app.main import app


def _seed_link(mongo, code: str, **fields):
    doc = {
        "_id": code,
        "originalUrl": "https://antigo.com/",
        "ownerId": ObjectId(),
        "createdAt": datetime.now(UTC),
        **fields,
    }
    mongo.urls.insert_one(doc)
    return doc


def test_create_link_requires_login(client):
    response = client.post("/api/links", json={"url": "https://exemplo.com/"})

    assert response.status_code == 401


def test_create_link(user_client, mongo):
    user_id = user_client.get("/api/me").json()["id"]

    response = user_client.post("/api/links", json={"url": "https://exemplo.com/um/caminho/longo"})

    assert response.status_code == 201
    body = response.json()
    assert re.fullmatch(r"[a-zA-Z0-9]{7}", body["code"])
    assert body["shortUrl"] == f"http://localhost:8000/{body['code']}"
    assert body["originalUrl"] == "https://exemplo.com/um/caminho/longo"

    doc = mongo.urls.find_one({"_id": body["code"]})
    assert doc["ownerId"] == ObjectId(user_id)
    assert abs(doc["createdAt"] - datetime.now(UTC)) < timedelta(seconds=5)
    assert datetime.fromisoformat(body["createdAt"]) == doc["createdAt"]


@pytest.mark.parametrize(
    ("expires_in", "delta"),
    [
        ("1d", timedelta(days=1)),
        ("7d", timedelta(days=7)),
        ("30d", timedelta(days=30)),
        (None, timedelta(days=30)),
    ],
)
def test_create_link_expiration(user_client, mongo, expires_in, delta):
    payload = {"url": "https://exemplo.com/"}
    if expires_in is not None:
        payload["expiresIn"] = expires_in

    body = user_client.post("/api/links", json=payload).json()

    doc = mongo.urls.find_one({"_id": body["code"]})
    assert doc["expiresAt"] == doc["createdAt"] + delta
    assert datetime.fromisoformat(body["expiresAt"]) == doc["expiresAt"]


def test_create_link_that_never_expires(user_client, mongo):
    body = user_client.post(
        "/api/links", json={"url": "https://exemplo.com/", "expiresIn": "never"}
    ).json()

    assert body["expiresAt"] is None
    assert "expiresAt" not in mongo.urls.find_one({"_id": body["code"]})


def test_create_link_rejects_unknown_expiration(user_client):
    response = user_client.post(
        "/api/links", json={"url": "https://exemplo.com/", "expiresIn": "2d"}
    )

    assert response.status_code == 422


def test_create_link_normalizes_url(user_client):
    response = user_client.post("/api/links", json={"url": "HTTPS://Exemplo.com"})

    assert response.json()["originalUrl"] == "https://exemplo.com/"


def test_same_url_gets_a_new_code_each_time(user_client):
    first = user_client.post("/api/links", json={"url": "https://exemplo.com/"}).json()
    second = user_client.post("/api/links", json={"url": "https://exemplo.com/"}).json()

    assert first["code"] != second["code"]


def test_code_length_is_configurable(user_client):
    app.dependency_overrides[get_settings] = lambda: Settings(code_length=6)

    response = user_client.post("/api/links", json={"url": "https://exemplo.com/"})

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
def test_create_link_rejects_invalid_url(user_client, payload):
    assert user_client.post("/api/links", json=payload).status_code == 422


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:8000/aB3xK9q",
        "https://bit.ly/abc",
        "https://www.bit.ly/abc",
        "https://BIT.LY/abc",
        "https://tinyurl.com/abc",
    ],
)
def test_create_link_rejects_own_domain_and_other_shorteners(user_client, url):
    response = user_client.post("/api/links", json={"url": url})

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["type"] == "blocked_url"
    assert error["loc"] == ["body", "url"]


def test_lookalike_of_a_shortener_is_allowed(user_client):
    response = user_client.post("/api/links", json={"url": "https://bit.ly.exemplo.com/"})

    assert response.status_code == 201


def test_create_link_retries_on_collision(user_client, mongo, monkeypatch):
    _seed_link(mongo, "AAAAAAA")
    codes = iter(["AAAAAAA", "AAAAAAA", "BBBBBBB"])
    monkeypatch.setattr("app.repository.generate_code", lambda length: next(codes))

    response = user_client.post("/api/links", json={"url": "https://novo.com/"})

    assert response.status_code == 201
    assert response.json()["code"] == "BBBBBBB"
    assert mongo.urls.find_one({"_id": "AAAAAAA"})["originalUrl"] == "https://antigo.com/"


def test_create_link_gives_up_after_repeated_collisions(user_client, mongo, monkeypatch):
    _seed_link(mongo, "AAAAAAA")
    codes = chain(repeat("AAAAAAA", 5), ["BBBBBBB"])
    monkeypatch.setattr("app.repository.generate_code", lambda length: next(codes))

    response = user_client.post("/api/links", json={"url": "https://novo.com/"})

    assert response.status_code == 503
    assert mongo.urls.count_documents({}) == 1


def test_list_links_requires_login(client):
    assert client.get("/api/links").status_code == 401


def test_list_links_shows_only_own_active_links_newest_first(make_client, mongo):
    iana = make_client("iana@exemplo.com")
    other = make_client("outra@exemplo.com")
    first = iana.post("/api/links", json={"url": "https://um.com/"}).json()
    second = iana.post("/api/links", json={"url": "https://dois.com/", "expiresIn": "never"}).json()
    other.post("/api/links", json={"url": "https://outra.com/"})
    owner_id = ObjectId(iana.get("/api/me").json()["id"])
    # Expired but not yet removed by the TTL monitor.
    _seed_link(mongo, "EXPIRED", ownerId=owner_id, expiresAt=datetime.now(UTC) - timedelta(1))

    body = iana.get("/api/links").json()

    assert [item["code"] for item in body["items"]] == [second["code"], first["code"]]
    assert body["items"][0] == second
    assert body["total"] == 2
    assert (body["page"], body["pageSize"]) == (1, 20)


def test_list_links_paginates(user_client):
    codes = [
        user_client.post("/api/links", json={"url": f"https://exemplo.com/{i}"}).json()["code"]
        for i in range(5)
    ]

    page_2 = user_client.get("/api/links", params={"page": 2, "pageSize": 2}).json()
    page_3 = user_client.get("/api/links", params={"page": 3, "pageSize": 2}).json()

    newest_first = codes[::-1]
    assert [item["code"] for item in page_2["items"]] == newest_first[2:4]
    assert [item["code"] for item in page_3["items"]] == newest_first[4:]
    assert page_2["total"] == 5


@pytest.mark.parametrize("params", [{"page": 0}, {"pageSize": 0}, {"pageSize": 101}])
def test_list_links_validates_pagination(user_client, params):
    assert user_client.get("/api/links", params=params).status_code == 422


def test_delete_own_link(user_client, mongo):
    code = user_client.post("/api/links", json={"url": "https://exemplo.com/"}).json()["code"]

    response = user_client.delete(f"/api/links/{code}")

    assert response.status_code == 204
    assert mongo.urls.count_documents({}) == 0
    assert user_client.get(f"/{code}").status_code == 404


def test_cannot_delete_someone_elses_link(make_client, mongo):
    owner = make_client("iana@exemplo.com")
    code = owner.post("/api/links", json={"url": "https://exemplo.com/"}).json()["code"]
    intruder = make_client("outra@exemplo.com")

    response = intruder.delete(f"/api/links/{code}")

    assert response.status_code == 404
    assert mongo.urls.count_documents({"_id": code}) == 1


def test_delete_unknown_link_returns_404(user_client):
    assert user_client.delete("/api/links/ZZZZZZZ").status_code == 404
