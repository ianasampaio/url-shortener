import re
from urllib.parse import urlsplit

_LANGUAGE_TAG = re.compile(r"^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*$")


def referer_domain(referer: str | None) -> str | None:
    """Only the host: the full URL rarely matters for the report and may carry personal data."""
    if not referer:
        return None
    try:
        host = urlsplit(referer.strip()).hostname
    except ValueError:
        return None
    if not host:
        return None
    return host.removeprefix("www.")


def primary_language(accept_language: str | None) -> str | None:
    """First tag of Accept-Language, e.g. "pt-BR,pt;q=0.9" -> "pt-BR"."""
    if not accept_language:
        return None
    tag = accept_language.split(",", 1)[0].split(";", 1)[0].strip()
    return tag if _LANGUAGE_TAG.fullmatch(tag) else None
