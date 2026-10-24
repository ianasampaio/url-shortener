from urllib.parse import urlsplit

# Shortening a short link hides the real destination and can create redirect loops.
SHORTENER_HOSTS = frozenset(
    {
        "bit.ly",
        "tinyurl.com",
        "t.co",
        "goo.gl",
        "is.gd",
        "ow.ly",
        "buff.ly",
        "cutt.ly",
        "rebrand.ly",
        "shorturl.at",
    }
)


def is_blocked_host(host: str, base_url: str) -> bool:
    """True for our own host, known shorteners, and any subdomain of them."""
    host = host.lower().rstrip(".")
    own_host = urlsplit(base_url).hostname or ""
    blocked = SHORTENER_HOSTS | {own_host.lower()}
    return any(host == b or host.endswith(f".{b}") for b in blocked if b)
