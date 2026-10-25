import re
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from fastapi.responses import RedirectResponse

from app.click_queue import build_event, enqueue_click
from app.codes import CODE_PATTERN
from app.deps import ClickQueueDep, DbDep
from app.repository import find_link

router = APIRouter(tags=["redirect"])


def is_speculative(request: Request) -> bool:
    """True for a prefetch or prerender: the browser guessing a click that may never come.

    Sent as "Sec-Purpose: prefetch" (or "prefetch;prerender"); "Purpose" is the older name.
    """
    purpose = request.headers.get("sec-purpose") or request.headers.get("purpose") or ""
    return "prefetch" in purpose.lower()


@router.get("/{code}", response_class=RedirectResponse, status_code=status.HTTP_302_FOUND)
async def redirect(
    code: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: DbDep,
    click_queue: ClickQueueDep,
) -> RedirectResponse:
    # A prefetched redirect is reused when the user clicks, so the real click would never
    # reach us. Declining it (any non-2xx; 503 is what browsers document) means nothing is
    # cached, and an actual click arrives as a normal request that gets counted.
    if is_speculative(request):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Speculative loading not supported",
            headers={"Cache-Control": "no-store"},
        )

    # Validated by hand so a malformed code is a 404, not a 422.
    doc = await find_link(db, code) if re.fullmatch(CODE_PATTERN, code) else None
    # The TTL monitor runs about once a minute, so an expired link can still be in the collection.
    expires_at = doc.get("expiresAt") if doc else None
    if doc is None or (expires_at is not None and expires_at <= datetime.now(UTC)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")

    # Background tasks run after the response is sent: the visitor never waits for the
    # queue, and a Redis outage only loses the click.
    background_tasks.add_task(enqueue_click, click_queue, build_event(request, doc))
    return RedirectResponse(doc["originalUrl"], status_code=status.HTTP_302_FOUND)
