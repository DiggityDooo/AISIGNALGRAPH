"""Main security gate. Every URL/response/content passes through here."""

import re
from collections import Counter
from urllib.parse import urlparse

import requests

from scraper.security.allowlist import ALLOWED_DOMAINS, is_domain_allowed
from scraper.security.blocklist import is_url_blocked
from scraper.security.rate_limiter import RateLimiter

MAX_URL_LENGTH = 2048
MAX_CONTENT_BYTES = 5_242_880  # 5MB
MAX_SCRIPT_TAGS = 3
MAX_REDIRECTS = 3

ALLOWED_CONTENT_TYPES = (
    "text/html",
    "text/plain",
    "application/rss+xml",
    "application/atom+xml",
    "application/xml",
)

MALICIOUS_JS_PATTERNS = (
    "eval(",
    "document.write(",
    "window.location =",
    "atob(",
    "fromCharCode(",
)

AI_RELEVANCE_VOCABULARY = (
    "ai",
    "artificial intelligence",
    "machine learning",
    "neural",
    "model",
    "llm",
    "gpt",
    "transformer",
    "deep learning",
    "algorithm",
    "robotics",
    "computer vision",
    "nlp",
    "inference",
    "training",
    "dataset",
)

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_WORD_RE = re.compile(r"[a-z]{3,}")


class SecurityValidator:
    def __init__(self, rate_limiter: RateLimiter):
        self.rate_limiter = rate_limiter

    def validate_url(self, url: str) -> tuple[bool, str]:
        """Returns (is_safe, reason). reason is empty on success."""
        try:
            parsed = urlparse(url)
        except ValueError:
            return False, "unparseable URL"

        if parsed.scheme != "https":
            return False, f"scheme '{parsed.scheme}' rejected (https only)"

        if is_url_blocked(url):
            return False, "URL matches blocklist"

        if not is_domain_allowed(url):
            return False, "domain not in allowlist"

        if len(url) > MAX_URL_LENGTH:
            return False, f"URL exceeds {MAX_URL_LENGTH} characters"

        if "\x00" in url or "\r" in url or "\n" in url or _CONTROL_CHARS_RE.search(url):
            return False, "URL contains control characters"

        hostname = parsed.hostname or ""
        if hostname.startswith("xn--") or ".xn--" in hostname:
            try:
                decoded = hostname.encode("ascii").decode("idna")
            except (UnicodeError, ValueError):
                return False, "invalid punycode hostname"
            if decoded != hostname:
                decoded_registered = ".".join(decoded.rsplit(".", 2)[-2:])
                if decoded_registered not in ALLOWED_DOMAINS:
                    return False, "IDN homograph hostname rejected"

        return True, ""

    def validate_response(self, response: requests.Response) -> tuple[bool, str]:
        """Validate an HTTP response before reading its content."""
        if response.status_code != 200:
            return False, f"status code {response.status_code}"

        if len(response.history) > MAX_REDIRECTS:
            return False, f"redirect chain longer than {MAX_REDIRECTS} hops"

        content_type = (response.headers.get("Content-Type") or "").lower()
        if not content_type.startswith(ALLOWED_CONTENT_TYPES):
            return False, f"content type '{content_type}' rejected"

        content_length = response.headers.get("Content-Length")
        if content_length is not None:
            try:
                if int(content_length) > MAX_CONTENT_BYTES:
                    return False, "content length exceeds 5MB"
            except ValueError:
                return False, "invalid Content-Length header"

        frame_options = (response.headers.get("X-Frame-Options") or "").upper()
        set_cookie = response.headers.get("Set-Cookie") or ""
        if frame_options == "DENY" and re.search(r"(?i)(track|session_redirect|phish)", set_cookie):
            return False, "phishing indicator headers"

        return True, ""

    def validate_content(self, content: str, url: str) -> tuple[bool, str]:
        """Validate sanitized text content for malicious or spam signals."""
        if len(content.encode("utf-8", errors="ignore")) > MAX_CONTENT_BYTES:
            return False, "content exceeds 5MB"

        if content.lower().count("<script") > MAX_SCRIPT_TAGS:
            return False, "too many script tags"

        for pattern in MALICIOUS_JS_PATTERNS:
            if pattern in content:
                return False, f"malicious JS pattern '{pattern}'"

        lowered = content.lower()

        # Spam signal: a single word repeated more than 50 times per 1000 chars.
        for start in range(0, len(lowered), 1000):
            window = lowered[start : start + 1000]
            counts = Counter(_WORD_RE.findall(window))
            if counts and counts.most_common(1)[0][1] > 50:
                return False, "excessive word repetition (spam)"

        for term in AI_RELEVANCE_VOCABULARY:
            if " " in term:
                if term in lowered:
                    return True, ""
            elif re.search(rf"\b{re.escape(term)}\b", lowered):
                return True, ""

        return False, "not AI-relevant"
