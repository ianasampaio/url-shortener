from crawlerdetect import CrawlerDetect

# Link previews fetch the page when someone pastes the link in a chat: a share, not a click.
# Checked in order: Telegram's agent is "TelegramBot (like TwitterBot)", so it must come
# before Twitterbot.
PREVIEW_BOTS = (
    "WhatsApp",
    "Slackbot-LinkExpanding",
    "facebookexternalhit",
    "TelegramBot",
    "Twitterbot",
    "Discordbot",
    "LinkedInBot",
)

_crawler_detect = CrawlerDetect()


def detect_bot(user_agent: str) -> str | None:
    """Return the bot name, or None for a human click.

    Prefetches never get here: the redirect declines them (see app.routes.redirect).
    """
    lowered = user_agent.lower()
    for name in PREVIEW_BOTS:
        if name.lower() in lowered:
            return name

    # Real browsers always send a User-Agent.
    if not user_agent.strip() or _crawler_detect.isCrawler(user_agent):
        return "crawler"
    return None
