from datetime import date
from types import SimpleNamespace

import pytest

from app.analytics.bots import detect_bot
from app.analytics.geo import GeoLookup
from app.analytics.referer import primary_language, referer_domain
from app.analytics.useragent import parse_user_agent
from app.analytics.visitor import daily_salt, visitor_hash

CHROME_ANDROID = (
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Mobile Safari/537.36"
)
SAFARI_IOS = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)
SAFARI_IPAD = (
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)
FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0"


@pytest.mark.parametrize(
    ("user_agent", "expected"),
    [
        ("WhatsApp/2.23.20.0 A", "WhatsApp"),
        ("Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", "Slackbot-LinkExpanding"),
        (
            "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
            "facebookexternalhit",
        ),
        ("Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)", "Discordbot"),
        ("TelegramBot (like TwitterBot)", "TelegramBot"),
        ("Googlebot/2.1 (+http://www.google.com/bot.html)", "crawler"),
        ("curl/8.5.0", "crawler"),
        ("", "crawler"),
        (CHROME_ANDROID, None),
        (FIREFOX_LINUX, None),
    ],
)
def test_detect_bot(user_agent, expected):
    assert detect_bot(user_agent) == expected


@pytest.mark.parametrize(
    ("user_agent", "expected"),
    [
        (
            CHROME_ANDROID,
            {
                "browser": {"name": "Chrome", "version": "130"},
                "os": {"name": "Android"},
                "device": "mobile",
            },
        ),
        (
            SAFARI_IOS,
            {
                "browser": {"name": "Safari", "version": "17"},
                "os": {"name": "iOS"},
                "device": "mobile",
            },
        ),
        (
            SAFARI_IPAD,
            {
                "browser": {"name": "Safari", "version": "17"},
                "os": {"name": "iOS"},
                "device": "tablet",
            },
        ),
        (
            FIREFOX_LINUX,
            {
                "browser": {"name": "Firefox", "version": "131"},
                "os": {"name": "Linux"},
                "device": "desktop",
            },
        ),
        ("", {"device": "other"}),
    ],
)
def test_parse_user_agent(user_agent, expected):
    assert parse_user_agent(user_agent) == expected


@pytest.mark.parametrize(
    ("referer", "expected"),
    [
        ("https://www.instagram.com/p/x?y=1", "instagram.com"),
        ("https://L.Facebook.com/l.php?u=abc", "l.facebook.com"),
        ("android-app://com.google.android.gm/", "com.google.android.gm"),
        ("", None),
        (None, None),
        ("não é url", None),
    ],
)
def test_referer_domain(referer, expected):
    assert referer_domain(referer) == expected


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        ("pt-BR,pt;q=0.9,en;q=0.8", "pt-BR"),
        ("en", "en"),
        ("en-US;q=0.9", "en-US"),
        ("*", None),
        ("", None),
        (None, None),
    ],
)
def test_primary_language(header, expected):
    assert primary_language(header) == expected


def test_daily_salt_is_shared_within_a_day_and_expires(redis):
    first = daily_salt(redis, date(2026, 10, 19))

    assert daily_salt(redis, date(2026, 10, 19)) == first
    assert daily_salt(redis, date(2026, 10, 20)) != first
    assert 0 < redis.ttl("salt:2026-10-19") <= 48 * 60 * 60


def test_visitor_hash_is_stable_only_within_day_and_link():
    same = visitor_hash("salt-a", "aB3xK9q", "203.0.113.7", CHROME_ANDROID)

    assert visitor_hash("salt-a", "aB3xK9q", "203.0.113.7", CHROME_ANDROID) == same
    assert visitor_hash("salt-b", "aB3xK9q", "203.0.113.7", CHROME_ANDROID) != same
    assert visitor_hash("salt-a", "ZZZZZZZ", "203.0.113.7", CHROME_ANDROID) != same
    assert visitor_hash("salt-a", "aB3xK9q", "203.0.113.8", CHROME_ANDROID) != same
    assert "203.0.113.7" not in same


def _fake_reader(country: str | None, region: str | None):
    response = SimpleNamespace(
        country=SimpleNamespace(iso_code=country),
        subdivisions=SimpleNamespace(most_specific=SimpleNamespace(iso_code=region)),
    )
    return SimpleNamespace(city=lambda ip: response)


@pytest.mark.parametrize(
    ("country", "region", "expected"),
    [
        ("BR", "TO", {"country": "BR", "region": "TO"}),
        ("BR", None, {"country": "BR"}),
        (None, None, None),
    ],
)
def test_geo_lookup(country, region, expected):
    geo = GeoLookup("")
    geo._reader = _fake_reader(country, region)

    assert geo.lookup("177.37.12.34") == expected


def test_geo_lookup_without_database():
    assert GeoLookup("").lookup("177.37.12.34") is None


def test_geo_lookup_with_missing_database_fails_at_start(tmp_path):
    with pytest.raises(FileNotFoundError):
        GeoLookup(str(tmp_path / "GeoLite2-City.mmdb"))
