from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from pymongo.errors import WriteError

from app.main import app


def test_ttl_index_expires_after_30_days(client, mongo):
    indexes = mongo.urls.index_information()

    ttl = next(i for i in indexes.values() if i["key"] == [("createdAt", 1)])
    assert ttl["expireAfterSeconds"] == 2592000


@pytest.mark.parametrize(
    "doc",
    [
        {"_id": "abc", "originalUrl": "https://exemplo.com/"},
        {"_id": "abc-def", "originalUrl": "https://exemplo.com/"},
        {"_id": "abcdefg", "originalUrl": "ftp://exemplo.com/"},
        {"_id": "abcdefg"},
    ],
)
def test_validator_rejects_invalid_documents(client, mongo, doc):
    with pytest.raises(WriteError):
        mongo.urls.insert_one({"createdAt": datetime.now(UTC), **doc})


def test_ensure_schema_is_idempotent(client):
    with TestClient(app):
        pass
