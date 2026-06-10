"""Per-domain rate limiting. Thread-safe."""

import threading
import time


class RateLimiter:
    DEFAULT_DELAY_S = 2.0  # minimum seconds between requests to same domain
    WAYBACK_DELAY_S = 3.0  # Wayback Machine gets extra courtesy
    RSS_DELAY_S = 1.0      # RSS endpoints are lighter

    def __init__(self) -> None:
        self._last_request: dict[str, float] = {}
        self._lock = threading.Lock()

    def wait_if_needed(self, domain: str, delay_override: float | None = None) -> None:
        """Block until the rate limit for this domain clears."""
        delay = delay_override if delay_override is not None else self.DEFAULT_DELAY_S
        with self._lock:
            last = self._last_request.get(domain)
            if last is not None:
                elapsed = time.monotonic() - last
                if elapsed < delay:
                    time.sleep(delay - elapsed)
            self._last_request[domain] = time.monotonic()

    def record_request(self, domain: str) -> None:
        """Mark that a request was just made to this domain."""
        with self._lock:
            self._last_request[domain] = time.monotonic()
