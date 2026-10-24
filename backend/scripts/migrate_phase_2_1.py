"""Delete phase 1 links, which have no owner.

Without an owner they would also have no expiresAt, so after phase 2.1 they would never
expire. Runs as a dry run unless --apply is given.

    uv run python -m scripts.migrate_phase_2_1           # only counts
    uv run python -m scripts.migrate_phase_2_1 --apply   # deletes
"""

import argparse

from pymongo import MongoClient
from pymongo.database import Database

from app.config import get_settings
from app.db import URLS_COLLECTION

OWNERLESS = {"ownerId": {"$exists": False}}


def delete_ownerless_links(db: Database, apply: bool) -> int:
    urls = db[URLS_COLLECTION]
    if not apply:
        return urls.count_documents(OWNERLESS)
    return urls.delete_many(OWNERLESS).deleted_count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="delete instead of only counting")
    args = parser.parse_args()

    settings = get_settings()
    with MongoClient(settings.mongo_uri) as client:
        count = delete_ownerless_links(client[settings.mongo_db], args.apply)

    action = "Deleted" if args.apply else "Would delete (run with --apply)"
    print(f"{action}: {count} ownerless link(s) in {settings.mongo_db}.{URLS_COLLECTION}")


if __name__ == "__main__":
    main()
