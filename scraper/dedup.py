"""Deduplication engine: exact URL match + fuzzy title fingerprint."""

import hashlib
import json
import re
from pathlib import Path

from loguru import logger

_PUNCT_RE = re.compile(r"[^\w\s]")
_WHITESPACE_RE = re.compile(r"\s+")


class DedupEngine:
    def __init__(self, stories_file: Path | None = None, stories: list[dict] | None = None):
        self._seen_urls: set[str] = set()
        self._seen_title_hashes: set[str] = set()
        if stories is not None:
            self._load_stories(stories)
        elif stories_file is not None:
            self._load(stories_file)

    def _load(self, stories_file: Path) -> None:
        """Load existing URL set and title fingerprints from disk."""
        if not stories_file.exists():
            return
        try:
            stories = json.loads(stories_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("DedupEngine could not load {}: {}", stories_file, exc)
            return
        if isinstance(stories, list):
            self._load_stories(stories)

    def _load_stories(self, stories: list[dict]) -> None:
        for story in stories:
            url = (story.get("source_url") or "").strip()
            title = (story.get("title") or "").strip()
            if url:
                self._seen_urls.add(url)
            if title:
                self._seen_title_hashes.add(self._title_fingerprint(title))

    def _title_fingerprint(self, title: str) -> str:
        """Normalized SHA-256 of the first 60 chars; catches near-duplicates."""
        normalized = _PUNCT_RE.sub("", title.lower())
        normalized = _WHITESPACE_RE.sub(" ", normalized).strip()
        return hashlib.sha256(normalized[:60].encode("utf-8")).hexdigest()

    def is_duplicate(self, url: str, title: str) -> bool:
        """True if this story has already been seen by URL or title."""
        if url and url in self._seen_urls:
            return True
        return bool(title) and self._title_fingerprint(title) in self._seen_title_hashes

    def register(self, url: str, title: str) -> None:
        """Mark a story as seen so future calls detect it as duplicate."""
        if url:
            self._seen_urls.add(url)
        if title:
            self._seen_title_hashes.add(self._title_fingerprint(title))
