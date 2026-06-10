"""HTML/text content sanitization. Raw HTML never reaches the database."""

import re

import bleach
from bs4 import BeautifulSoup

ALLOWED_TAGS = [
    "p", "br", "b", "i", "em", "strong", "a", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "blockquote", "pre", "code", "span",
]

ALLOWED_ATTRIBUTES = {
    "a": ["href", "title"],
    "span": ["class"],
    "code": ["class"],
}

PLAIN_TEXT_LIMIT = 4096

_EVENT_HANDLER_RE = re.compile(r"\son\w+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", re.IGNORECASE)
_DATA_URI_RE = re.compile(r"(href|src)\s*=\s*([\"'])data:[^\"']*\2", re.IGNORECASE)
_WHITESPACE_RE = re.compile(r"\s+")


def sanitize_html(raw_html: str) -> str:
    """Strip everything except a minimal safe tag/attribute set."""
    cleaned = bleach.clean(
        raw_html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True,
        strip_comments=True,
    )
    cleaned = _EVENT_HANDLER_RE.sub("", cleaned)
    cleaned = _DATA_URI_RE.sub(r'\1=""', cleaned)
    return cleaned.strip()


def html_to_plain_text(html: str) -> str:
    """Sanitize then flatten HTML to whitespace-collapsed plain text."""
    cleaned = sanitize_html(html)
    soup = BeautifulSoup(cleaned, "html.parser")
    text = soup.get_text(separator=" ", strip=True)
    text = _WHITESPACE_RE.sub(" ", text).strip()
    return text[:PLAIN_TEXT_LIMIT]
