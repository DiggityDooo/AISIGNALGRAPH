"""Per-domain and API rate limiting. Thread-safe."""

import threading
import time


class ApiRateLimiter:
    """Rolling-window cap for outbound API calls (e.g. Gemini free tier)."""

    def __init__(self, max_requests: int = 12, window_seconds: float = 60.0) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._timestamps: list[float] = []
        self._lock = threading.Lock()

    def acquire(self) -> None:
        """Block until a request slot is available within the window."""
        with self._lock:
            while True:
                now = time.monotonic()
                cutoff = now - self.window_seconds
                self._timestamps = [t for t in self._timestamps if t > cutoff]
                if len(self._timestamps) < self.max_requests:
                    self._timestamps.append(now)
                    return
                sleep_for = self._timestamps[0] + self.window_seconds - now
                if sleep_for > 0:
                    time.sleep(sleep_for)


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
