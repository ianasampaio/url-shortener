from typing import Any

import geoip2.database
import geoip2.errors


class GeoLookup:
    """Country and region from an IP, using a local GeoLite2 City database.

    With no database configured every lookup returns None, so clicks are stored
    without geo (the normal case in dev, where clicks come from local IPs anyway).
    """

    def __init__(self, db_path: str):
        # A configured path that does not exist raises here, at worker start.
        self._reader = geoip2.database.Reader(db_path) if db_path else None

    def lookup(self, ip: str | None) -> dict[str, Any] | None:
        if self._reader is None or not ip:
            return None
        try:
            response = self._reader.city(ip)
        except (geoip2.errors.AddressNotFoundError, ValueError):
            return None

        country = response.country.iso_code
        if not country:
            return None
        geo = {"country": country}
        region = response.subdivisions.most_specific.iso_code
        if region:
            geo["region"] = region
        return geo

    def close(self) -> None:
        if self._reader is not None:
            self._reader.close()
