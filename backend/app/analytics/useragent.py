from typing import Any

from user_agents import parse

UNKNOWN_FAMILY = "Other"


def _browser_name(family: str) -> str:
    # The device is stored separately, so "Chrome Mobile" and "Mobile Safari" rank
    # together with their desktop versions.
    return " ".join(word for word in family.split() if word != "Mobile")


def parse_user_agent(user_agent: str) -> dict[str, Any]:
    ua = parse(user_agent)
    result: dict[str, Any] = {}

    if ua.browser.family != UNKNOWN_FAMILY:
        version = ua.browser.version
        # Major only: browsers freeze or zero the minor parts of the version.
        result["browser"] = {
            "name": _browser_name(ua.browser.family),
            "version": str(version[0]) if version else None,
        }

    # No OS version: Chrome reports every Android as 10 and every macOS as 10_15_7.
    if ua.os.family != UNKNOWN_FAMILY:
        result["os"] = {"name": ua.os.family}

    if ua.is_tablet:
        result["device"] = "tablet"
    elif ua.is_mobile:
        result["device"] = "mobile"
    elif ua.is_pc:
        result["device"] = "desktop"
    else:
        result["device"] = "other"
    return result
