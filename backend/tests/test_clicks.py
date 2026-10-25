from datetime import UTC, datetime

import pytest
from redis import Redis
from rq import Queue

from app.analytics.geo import GeoLookup
from app.deps import get_click_queue
from app.main import app
from app.worker import ClickEvent, build_click
from tests.test_analytics import CHROME_ANDROID, _fake_reader

BROWSER_HEADERS = {
    "User-Agent": CHROME_ANDROID,
    "Referer": "https://www.instagram.com/p/abc?igsh=123",
    "Accept-Language": "pt-BR,pt;q=0.9",
}


def _create_link(client) -> str:
    return client.post("/api/links", json={"url": "https://exemplo.com/"}).json()["code"]


def test_redirect_records_a_click(inline_clicks, user_client, client, mongo):
    code = _create_link(user_client)
    owner_id = mongo.urls.find_one({"_id": code})["ownerId"]

    response = client.get(f"/{code}", headers=BROWSER_HEADERS)

    assert response.status_code == 302
    [click] = mongo.clicks.find()
    assert click["meta"] == {"linkId": code, "ownerId": owner_id}
    assert abs(click["timestamp"] - datetime.now(UTC)).total_seconds() < 5
    assert click["browser"] == {"name": "Chrome", "version": "130"}
    assert click["os"] == {"name": "Android"}
    assert click["device"] == "mobile"
    assert click["referer"] == "instagram.com"
    assert click["language"] == "pt-BR"
    assert click["isBot"] is False
    assert len(click["visitorHash"]) == 64
    # Never stored: the IP, and fields that are unknown (no geo database in tests).
    assert set(click) == {
        "_id",
        "timestamp",
        "meta",
        "visitorHash",
        "browser",
        "os",
        "device",
        "isBot",
        "referer",
        "language",
    }


def test_click_count_counts_humans_only(inline_clicks, user_client, client):
    code = _create_link(user_client)

    client.get(f"/{code}", headers=BROWSER_HEADERS)
    client.get(f"/{code}", headers=BROWSER_HEADERS)
    client.get(f"/{code}", headers={"User-Agent": "WhatsApp/2.23.20.0 A"})

    [link] = user_client.get("/api/links").json()["items"]
    assert link["clickCount"] == 2


@pytest.mark.parametrize(
    "header",
    [
        ("Sec-Purpose", "prefetch"),
        ("Sec-Purpose", "prefetch;prerender"),
        ("Purpose", "prefetch"),
    ],
)
def test_speculative_loads_are_declined_and_not_recorded(
    inline_clicks, user_client, client, mongo, header
):
    code = _create_link(user_client)

    response = client.get(f"/{code}", headers={**BROWSER_HEADERS, header[0]: header[1]})

    assert response.status_code == 503
    assert "location" not in response.headers
    assert response.headers["cache-control"] == "no-store"
    assert mongo.clicks.count_documents({}) == 0
    # The click that may follow is a normal request, and it is counted.
    assert client.get(f"/{code}", headers=BROWSER_HEADERS).status_code == 302
    assert mongo.clicks.count_documents({}) == 1


def test_bot_click_is_stored_with_its_name(inline_clicks, user_client, client, mongo):
    code = _create_link(user_client)

    client.get(f"/{code}", headers={"User-Agent": "WhatsApp/2.23.20.0 A"})

    [click] = mongo.clicks.find()
    assert (click["isBot"], click["botName"]) == (True, "WhatsApp")


def test_new_link_has_zero_clicks(user_client):
    response = user_client.post("/api/links", json={"url": "https://exemplo.com/"})

    assert response.json()["clickCount"] == 0


def test_redirect_works_when_redis_is_down(user_client, client, mongo):
    code = _create_link(user_client)
    unreachable = Redis.from_url(
        "redis://localhost:1/0", socket_timeout=0.05, socket_connect_timeout=0.05
    )
    app.dependency_overrides[get_click_queue] = lambda: Queue("clicks", connection=unreachable)

    response = client.get(f"/{code}", headers=BROWSER_HEADERS)

    assert response.status_code == 302
    assert mongo.clicks.count_documents({}) == 0


def test_redirect_only_enqueues_when_no_worker_runs(user_client, client, redis, mongo):
    code = _create_link(user_client)

    client.get(f"/{code}", headers=BROWSER_HEADERS)

    queue = Queue("clicks", connection=redis)
    [job] = queue.get_jobs()
    assert job.func_name == "app.worker.process_click"
    assert job.args[0]["code"] == code
    assert job.ttl == 3600 and job.result_ttl == 0 and job.failure_ttl == 6 * 3600
    assert job.description == f"click on {code}"
    assert mongo.clicks.count_documents({}) == 0


def test_build_click_adds_geo(redis):
    geo = GeoLookup("")
    geo._reader = _fake_reader("BR", "TO")
    event = ClickEvent.model_validate(
        {
            "code": "aB3xK9q",
            "ownerId": "6adcafb3249ab049d8a39c78",
            "timestamp": "2026-10-19T14:32:10+00:00",
            "ip": "177.37.12.34",
            "userAgent": CHROME_ANDROID,
            "referer": None,
            "acceptLanguage": None,
        }
    )

    doc = build_click(event, redis, geo).to_document()

    assert doc["geo"] == {"country": "BR", "region": "TO"}
    assert "referer" not in doc and "language" not in doc and "botName" not in doc
    assert redis.exists("salt:2026-10-19")


def test_deleting_a_link_deletes_its_clicks(inline_clicks, user_client, client, mongo):
    kept, deleted = _create_link(user_client), _create_link(user_client)
    client.get(f"/{kept}", headers=BROWSER_HEADERS)
    client.get(f"/{deleted}", headers=BROWSER_HEADERS)

    user_client.delete(f"/api/links/{deleted}")

    assert [c["meta"]["linkId"] for c in mongo.clicks.find()] == [kept]


def test_deleting_an_account_deletes_its_clicks(inline_clicks, make_client, client, mongo):
    iana, other = make_client("iana@exemplo.com"), make_client("outra@exemplo.com")
    other_code = _create_link(other)
    for code in (_create_link(iana), _create_link(iana), other_code):
        client.get(f"/{code}", headers=BROWSER_HEADERS)

    iana.delete("/api/me")

    assert [c["meta"]["linkId"] for c in mongo.clicks.find()] == [other_code]
