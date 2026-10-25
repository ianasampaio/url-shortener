from datetime import UTC, datetime

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError, WriteError

from app.main import app
from scripts.migrate_phase_2_1 import delete_ownerless_links


def test_urls_ttl_index_uses_expires_at(client, mongo):
    indexes = mongo.urls.index_information()

    ttl = next(i for i in indexes.values() if i["key"] == [("expiresAt", 1)])
    assert ttl["expireAfterSeconds"] == 0
    assert "createdAt_1" not in indexes
    assert any(i["key"] == [("ownerId", 1), ("createdAt", -1)] for i in indexes.values())


def _link(**overrides):
    return {
        "_id": "abcdefg",
        "originalUrl": "https://exemplo.com/",
        "ownerId": ObjectId(),
        "createdAt": datetime.now(UTC),
        **overrides,
    }


@pytest.mark.parametrize(
    "doc",
    [
        _link(_id="abc"),
        _link(_id="abc-def"),
        _link(originalUrl="ftp://exemplo.com/"),
        {k: v for k, v in _link().items() if k != "ownerId"},
        _link(ownerId="not-an-object-id"),
        _link(expiresAt="amanhã"),
    ],
    ids=["short-code", "bad-chars", "ftp", "no-owner", "owner-not-objectid", "expires-not-date"],
)
def test_urls_validator_rejects_invalid_documents(client, mongo, doc):
    with pytest.raises(WriteError):
        mongo.urls.insert_one(doc)


def test_users_email_is_unique(client, mongo):
    user = {"email": "iana@exemplo.com", "passwordHash": "x", "createdAt": datetime.now(UTC)}
    mongo.users.insert_one(dict(user))

    with pytest.raises(DuplicateKeyError):
        mongo.users.insert_one(dict(user))


def test_users_validator_rejects_missing_password(client, mongo):
    with pytest.raises(WriteError):
        mongo.users.insert_one({"email": "iana@exemplo.com", "createdAt": datetime.now(UTC)})


def test_ensure_schema_upgrades_a_phase_1_database(mongo, make_client):
    mongo.create_collection(
        "urls",
        validator={"$jsonSchema": {"bsonType": "object", "required": ["_id", "createdAt"]}},
    )
    mongo.urls.create_index([("createdAt", 1)], expireAfterSeconds=2592000)

    make_client()

    indexes = mongo.urls.index_information()
    assert "createdAt_1" not in indexes
    assert any(i["key"] == [("expiresAt", 1)] for i in indexes.values())
    validator = mongo.get_collection("urls").options()["validator"]
    assert "ownerId" in validator["$jsonSchema"]["required"]


def test_ensure_schema_is_idempotent(mongo):
    for _ in range(2):
        with TestClient(app):
            pass


def test_migration_deletes_only_ownerless_links(client, mongo):
    mongo.urls.insert_one(_link(_id="WITHOWN"))
    # Phase 1 documents predate the ownerId rule; bypass the validator to recreate one.
    mongo.urls.insert_one(
        {"_id": "LEGACY1", "originalUrl": "https://a.com/", "createdAt": datetime.now(UTC)},
        bypass_document_validation=True,
    )

    assert delete_ownerless_links(mongo, apply=False) == 1
    assert mongo.urls.count_documents({}) == 2

    assert delete_ownerless_links(mongo, apply=True) == 1
    assert [d["_id"] for d in mongo.urls.find()] == ["WITHOWN"]


def test_clicks_is_a_time_series_collection(client, mongo):
    options = mongo.get_collection("clicks").options()

    assert options["timeseries"]["timeField"] == "timestamp"
    assert options["timeseries"]["metaField"] == "meta"
    assert options["timeseries"]["granularity"] == "hours"
    assert options["expireAfterSeconds"] == 395 * 24 * 60 * 60
    keys = [index["key"] for index in mongo.clicks.list_indexes()]
    assert {"meta.linkId": 1, "timestamp": -1} in keys
    assert {"meta.ownerId": 1, "timestamp": -1} in keys


def test_urls_validator_accepts_click_count(client, mongo):
    mongo.urls.insert_one(_link(clickCount=3))

    with pytest.raises(WriteError):
        mongo.urls.insert_one(_link(_id="other12", clickCount="três"))
