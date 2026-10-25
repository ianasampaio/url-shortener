from datetime import date, timedelta
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.db import CLICKS_COLLECTION
from app.schemas import BotEntry, DailyStats, RankEntry, StatsOut, StatsQuery, StatsTotals

TOP_N = 10

# Report dimension -> expression grouped on.
DIMENSIONS: dict[str, Any] = {
    "countries": "$geo.country",
    # $concat yields null when either part is missing, which reads as "unknown".
    "regions": {"$concat": ["$geo.country", "-", "$geo.region"]},
    "referers": "$referer",
    "browsers": "$browser.name",
    "os": "$os.name",
    "devices": "$device",
}


def _ranking_stage(expression: Any, counted: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"$match": counted},
        {"$group": {"_id": expression, "clicks": {"$sum": 1}}},
        {"$sort": {"clicks": -1, "_id": 1}},
        {"$limit": TOP_N},
    ]


def build_pipeline(code: str, query: StatsQuery) -> list[dict[str, Any]]:
    start, end = query.utc_bounds()
    counted = {} if query.include_bots else {"isBot": False}
    return [
        {"$match": {"meta.linkId": code, "timestamp": {"$gte": start, "$lt": end}}},
        {
            "$facet": {
                "daily": [
                    {"$match": counted},
                    # One row per (day, visitor) first, so the second group counts visitors.
                    {
                        "$group": {
                            "_id": {
                                "day": {
                                    "$dateToString": {
                                        "format": "%Y-%m-%d",
                                        "date": "$timestamp",
                                        "timezone": query.tz,
                                    }
                                },
                                "visitor": "$visitorHash",
                            },
                            "clicks": {"$sum": 1},
                        }
                    },
                    {
                        "$group": {
                            "_id": "$_id.day",
                            "clicks": {"$sum": "$clicks"},
                            "uniqueVisitors": {"$sum": 1},
                        }
                    },
                ],
                # Bots are always listed: previews are how often the link was shared.
                "bots": [
                    {"$match": {"isBot": True}},
                    {"$group": {"_id": "$botName", "hits": {"$sum": 1}}},
                    {"$sort": {"hits": -1, "_id": 1}},
                ],
                **{
                    name: _ranking_stage(expression, counted)
                    for name, expression in DIMENSIONS.items()
                },
            }
        },
    ]


def _days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def _ranking(rows: list[dict[str, Any]], total: int) -> list[RankEntry]:
    entries = [RankEntry(key=row["_id"], clicks=row["clicks"]) for row in rows]
    rest = total - sum(entry.clicks for entry in entries)
    if rest > 0:
        entries.append(RankEntry(key="other", clicks=rest))
    return entries


async def link_stats(db: AsyncDatabase, code: str, query: StatsQuery) -> StatsOut:
    cursor = await db[CLICKS_COLLECTION].aggregate(build_pipeline(code, query))
    [facets] = await cursor.to_list()

    by_day = {row["_id"]: row for row in facets["daily"]}
    # Every day of the period, zeros included, so charts do not skip dates.
    daily = [
        DailyStats(
            date=day,
            clicks=by_day.get(day.isoformat(), {}).get("clicks", 0),
            unique_visitors=by_day.get(day.isoformat(), {}).get("uniqueVisitors", 0),
        )
        for day in _days(query.from_, query.to)
    ]
    total_clicks = sum(day.clicks for day in daily)
    bots = [BotEntry(key=row["_id"], hits=row["hits"]) for row in facets["bots"]]

    return StatsOut(
        code=code,
        from_=query.from_,
        to=query.to,
        tz=query.tz,
        totals=StatsTotals(
            clicks=total_clicks,
            unique_visitors=sum(day.unique_visitors for day in daily),
            bot_hits=sum(bot.hits for bot in bots),
        ),
        daily=daily,
        bots=bots,
        **{name: _ranking(facets[name], total_clicks) for name in DIMENSIONS},
    )
