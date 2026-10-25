from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from bson import ObjectId


@pytest.fixture
def link(user_client, mongo):
    code = user_client.post("/api/links", json={"url": "https://exemplo.com/"}).json()["code"]
    return code, mongo.urls.find_one({"_id": code})["ownerId"]


def _click(mongo, link, when: datetime, *, visitor="v1", is_bot=False, **fields):
    code, owner_id = link
    doc = {
        "timestamp": when,
        "meta": {"linkId": code, "ownerId": owner_id},
        "visitorHash": visitor,
        "device": "mobile",
        "isBot": is_bot,
        **fields,
    }
    mongo.clicks.insert_one(doc)


def _at(day: str, hour: int = 12) -> datetime:
    return datetime.fromisoformat(day).replace(hour=hour, tzinfo=UTC)


def _stats(client, code, **params):
    return client.get(f"/api/links/{code}/stats", params=params)


def test_daily_series_fills_empty_days_and_counts_visitors(user_client, mongo, link):
    _click(mongo, link, _at("2026-10-01"), visitor="a")
    _click(mongo, link, _at("2026-10-01", 15), visitor="a")
    _click(mongo, link, _at("2026-10-01", 18), visitor="b")
    _click(mongo, link, _at("2026-10-03"), visitor="a")
    # Outside the period.
    _click(mongo, link, _at("2026-09-30"), visitor="a")
    _click(mongo, link, _at("2026-10-04"), visitor="a")

    body = _stats(user_client, link[0], **{"from": "2026-10-01", "to": "2026-10-03"}).json()

    assert body["daily"] == [
        {"date": "2026-10-01", "clicks": 3, "uniqueVisitors": 2},
        {"date": "2026-10-02", "clicks": 0, "uniqueVisitors": 0},
        {"date": "2026-10-03", "clicks": 1, "uniqueVisitors": 1},
    ]
    # Unique visitors are summed per day: "a" on two days counts twice.
    assert body["totals"] == {"clicks": 4, "uniqueVisitors": 3, "botHits": 0}
    assert (body["code"], body["from"], body["to"], body["tz"]) == (
        link[0],
        "2026-10-01",
        "2026-10-03",
        "UTC",
    )


def test_days_follow_the_requested_time_zone(user_client, mongo, link):
    # 01:00 UTC on Oct 2 is still Oct 1 in São Paulo (UTC-3).
    _click(mongo, link, _at("2026-10-02", 1))
    period = {"from": "2026-10-01", "to": "2026-10-01"}

    in_sao_paulo = _stats(user_client, link[0], tz="America/Sao_Paulo", **period).json()
    in_utc = _stats(user_client, link[0], **period).json()

    assert in_sao_paulo["totals"]["clicks"] == 1
    assert in_utc["totals"]["clicks"] == 0


def test_bots_are_excluded_by_default_but_always_listed(user_client, mongo, link):
    _click(mongo, link, _at("2026-10-01"), visitor="a", browser={"name": "Chrome"})
    _click(mongo, link, _at("2026-10-01"), visitor="b", browser={"name": "Chrome"})
    _click(mongo, link, _at("2026-10-01"), visitor="w", is_bot=True, botName="WhatsApp")
    _click(mongo, link, _at("2026-10-01"), visitor="w2", is_bot=True, botName="WhatsApp")
    _click(mongo, link, _at("2026-10-01"), visitor="s", is_bot=True, botName="crawler")
    period = {"from": "2026-10-01", "to": "2026-10-01"}

    humans = _stats(user_client, link[0], **period).json()
    everyone = _stats(user_client, link[0], includeBots="true", **period).json()

    assert humans["totals"] == {"clicks": 2, "uniqueVisitors": 2, "botHits": 3}
    assert humans["browsers"] == [{"key": "Chrome", "clicks": 2}]
    assert everyone["totals"]["clicks"] == 5
    assert everyone["browsers"] == [{"key": None, "clicks": 3}, {"key": "Chrome", "clicks": 2}]
    expected_bots = [{"key": "WhatsApp", "hits": 2}, {"key": "crawler", "hits": 1}]
    assert humans["bots"] == everyone["bots"] == expected_bots


def test_rankings_keep_top_10_and_group_the_rest(user_client, mongo, link):
    # 12 countries (AA: 3 clicks, AB: 2, ten with 1 each) plus 1 click with unknown country.
    countries = ["AA"] * 3 + ["AB"] * 2 + [f"C{i}" for i in range(10)]
    for i, country in enumerate(countries):
        _click(mongo, link, _at("2026-10-01"), visitor=str(i), geo={"country": country})
    _click(mongo, link, _at("2026-10-01"), visitor="nogeo")

    body = _stats(user_client, link[0], **{"from": "2026-10-01", "to": "2026-10-01"}).json()

    ranking = body["countries"]
    assert len(ranking) == 11
    assert ranking[:3] == [
        {"key": "AA", "clicks": 3},
        {"key": "AB", "clicks": 2},
        # Unknown competes for the top 10 too; on ties it sorts before country codes.
        {"key": None, "clicks": 1},
    ]
    assert [entry["key"] for entry in ranking[3:10]] == [f"C{i}" for i in range(7)]
    assert ranking[-1] == {"key": "other", "clicks": 3}
    assert sum(entry["clicks"] for entry in ranking) == body["totals"]["clicks"] == 16


def test_dimensions(user_client, mongo, link):
    _click(
        mongo,
        link,
        _at("2026-10-01"),
        geo={"country": "BR", "region": "TO"},
        referer="instagram.com",
        browser={"name": "Chrome", "version": "130"},
        os={"name": "Android"},
    )
    _click(mongo, link, _at("2026-10-01"), geo={"country": "BR"}, device="desktop")

    body = _stats(user_client, link[0], **{"from": "2026-10-01", "to": "2026-10-01"}).json()

    assert body["countries"] == [{"key": "BR", "clicks": 2}]
    assert body["regions"] == [{"key": None, "clicks": 1}, {"key": "BR-TO", "clicks": 1}]
    # No referer means direct access.
    assert body["referers"] == [{"key": None, "clicks": 1}, {"key": "instagram.com", "clicks": 1}]
    assert body["os"] == [{"key": None, "clicks": 1}, {"key": "Android", "clicks": 1}]
    assert body["devices"] == [{"key": "desktop", "clicks": 1}, {"key": "mobile", "clicks": 1}]


def test_other_links_clicks_are_not_counted(user_client, mongo, link):
    other = (user_client.post("/api/links", json={"url": "https://b.com/"}).json()["code"], link[1])
    _click(mongo, link, _at("2026-10-01"))
    _click(mongo, other, _at("2026-10-01"))

    body = _stats(user_client, link[0], **{"from": "2026-10-01", "to": "2026-10-01"}).json()

    assert body["totals"]["clicks"] == 1


def test_default_period_is_the_last_30_days(user_client, link):
    body = _stats(user_client, link[0]).json()

    today = datetime.now(UTC).date()
    assert body["to"] == today.isoformat()
    assert body["from"] == (today - timedelta(days=29)).isoformat()
    assert len(body["daily"]) == 30


def test_default_period_ends_today_in_the_requested_zone(user_client, link):
    zone = "Pacific/Kiritimati"  # UTC+14: often already tomorrow compared to UTC.

    body = _stats(user_client, link[0], tz=zone).json()

    assert body["to"] == datetime.now(ZoneInfo(zone)).date().isoformat()


@pytest.mark.parametrize(
    "params",
    [
        {"tz": "Mars/Olympus_Mons"},
        {"from": "2025-01-01", "to": "2026-03-01"},
        {"from": "2026-10-05", "to": "2026-10-01"},
        {"from": "ontem"},
        {"includeBots": "talvez"},
    ],
    ids=["bad-tz", "over-400-days", "from-after-to", "bad-date", "bad-bool"],
)
def test_invalid_parameters(user_client, link, params):
    assert _stats(user_client, link[0], **params).status_code == 422


def test_400_days_is_the_maximum(user_client, link):
    end = date(2026, 10, 1)
    params = {"from": (end - timedelta(days=399)).isoformat(), "to": end.isoformat()}

    assert _stats(user_client, link[0], **params).status_code == 200


def test_requires_login(client, link):
    assert _stats(client, link[0]).status_code == 401


def test_someone_elses_link_is_404(make_client, link):
    intruder = make_client("outra@exemplo.com")

    assert _stats(intruder, link[0]).status_code == 404


def test_unknown_link_is_404(user_client):
    assert _stats(user_client, "ZZZZZZZ").status_code == 404


def test_expired_link_is_404(user_client, mongo):
    owner_id = ObjectId(user_client.get("/api/me").json()["id"])
    mongo.urls.insert_one(
        {
            "_id": "EXPIRED",
            "originalUrl": "https://exemplo.com/",
            "ownerId": owner_id,
            "createdAt": datetime.now(UTC) - timedelta(days=2),
            "expiresAt": datetime.now(UTC) - timedelta(seconds=1),
        }
    )

    assert _stats(user_client, "EXPIRED").status_code == 404
