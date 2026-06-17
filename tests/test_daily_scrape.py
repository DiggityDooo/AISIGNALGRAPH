"""Tests for scraper/daily_scrape.py — scraping orchestration logic."""

from __future__ import annotations

import sys
import time
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

# feedparser 6.x uses sgmllib which was removed in Python 3.12+; mock it so
# the module can still be imported for testing without the dependency.
if "feedparser" not in sys.modules:
    sys.modules["feedparser"] = MagicMock()

from scraper.daily_scrape import (  # noqa: E402
    MAX_ARTICLES_PER_SOURCE,
    MAX_RESPONSE_SIZE,
    _entry_date,
    _fetch_article,
    _now_iso,
    scrape_rss_source,
)


# ---------------------------------------------------------------------------
# _now_iso
# ---------------------------------------------------------------------------

class TestNowIso:
    def test_returns_string(self):
        result = _now_iso()
        assert isinstance(result, str)

    def test_parseable_as_datetime(self):
        result = _now_iso()
        parsed = datetime.fromisoformat(result)
        assert parsed.tzinfo is not None

    def test_is_utc(self):
        result = _now_iso()
        parsed = datetime.fromisoformat(result)
        assert parsed.utcoffset().total_seconds() == 0

    def test_recent_timestamp(self):
        before = datetime.now(timezone.utc)
        result = _now_iso()
        after = datetime.now(timezone.utc)
        parsed = datetime.fromisoformat(result)
        assert before <= parsed <= after


# ---------------------------------------------------------------------------
# _entry_date
# ---------------------------------------------------------------------------

class TestEntryDate:
    def test_uses_published_parsed_if_available(self):
        entry = MagicMock()
        entry.published_parsed = time.strptime("2024-03-15", "%Y-%m-%d")
        entry.updated_parsed = None
        result = _entry_date(entry)
        assert result == "2024-03-15"

    def test_falls_back_to_updated_parsed(self):
        entry = MagicMock()
        entry.published_parsed = None
        entry.updated_parsed = time.strptime("2024-06-01", "%Y-%m-%d")
        result = _entry_date(entry)
        assert result == "2024-06-01"

    def test_falls_back_to_today_when_no_date(self):
        entry = MagicMock()
        entry.published_parsed = None
        entry.updated_parsed = None
        result = _entry_date(entry)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        assert result == today

    def test_date_format_is_yyyy_mm_dd(self):
        entry = MagicMock()
        entry.published_parsed = time.strptime("2023-11-05", "%Y-%m-%d")
        entry.updated_parsed = None
        result = _entry_date(entry)
        # Must match YYYY-MM-DD
        parts = result.split("-")
        assert len(parts) == 3
        assert len(parts[0]) == 4


# ---------------------------------------------------------------------------
# _fetch_article
# ---------------------------------------------------------------------------

class TestFetchArticle:
    def test_returns_response_on_success(self):
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_session.get.return_value = mock_response

        result = _fetch_article("https://example.com/article", mock_session)
        assert result is mock_response

    def test_returns_none_on_request_exception(self):
        import requests
        mock_session = MagicMock()
        mock_session.get.side_effect = requests.RequestException("timeout")

        result = _fetch_article("https://example.com/article", mock_session)
        assert result is None

    def test_calls_session_get_with_correct_url(self):
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock()

        _fetch_article("https://openai.com/blog/gpt4", mock_session)
        call_args = mock_session.get.call_args
        assert call_args[0][0] == "https://openai.com/blog/gpt4"

    def test_passes_verify_true(self):
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock()

        _fetch_article("https://example.com", mock_session)
        kwargs = mock_session.get.call_args[1]
        assert kwargs.get("verify") is True


# ---------------------------------------------------------------------------
# scrape_rss_source
# ---------------------------------------------------------------------------

class TestScrapeRssSource:
    def _make_source(self):
        return {"name": "Test Source", "rss": "https://test.com/rss.xml"}

    def _make_entry(self, url="https://test.com/article-1", title="AI News Story"):
        entry = MagicMock()
        entry.link = url
        entry.title = title
        entry.published_parsed = time.strptime("2024-01-15", "%Y-%m-%d")
        entry.updated_parsed = None
        return entry

    def test_rejects_invalid_rss_url(self):
        from scraper.security.validator import SecurityValidator
        from scraper.security.rate_limiter import RateLimiter
        from scraper.dedup import DedupEngine
        from scraper.extractor import StoryExtractor

        mock_validator = MagicMock()
        mock_validator.validate_url.return_value = (False, "blocked domain")
        source = {"name": "Bad Source", "rss": "https://malicious.ru/rss.xml"}

        result = scrape_rss_source(
            source,
            mock_validator,
            MagicMock(),
            MagicMock(),
            MagicMock(),
            MagicMock(),
        )
        assert result == []

    def test_handles_feedparser_exception(self):
        mock_validator = MagicMock()
        mock_validator.validate_url.return_value = (True, "ok")
        mock_rate_limiter = MagicMock()

        with patch("scraper.daily_scrape.feedparser") as mock_fp:
            mock_fp.parse.side_effect = Exception("Feed error")
            result = scrape_rss_source(
                self._make_source(),
                mock_validator,
                mock_rate_limiter,
                MagicMock(),
                MagicMock(),
                MagicMock(),
            )
        assert result == []

    def test_skips_duplicate_articles(self):
        mock_validator = MagicMock()
        mock_validator.validate_url.return_value = (True, "ok")
        mock_validator.validate_response.return_value = (True, "ok")
        mock_validator.validate_content.return_value = (True, "ok")

        mock_dedup = MagicMock()
        mock_dedup.is_duplicate.return_value = True  # all duplicates

        mock_feed = MagicMock()
        mock_feed.entries = [self._make_entry()]

        with patch("scraper.daily_scrape.feedparser") as mock_fp:
            mock_fp.parse.return_value = mock_feed
            result = scrape_rss_source(
                self._make_source(),
                mock_validator,
                MagicMock(),
                mock_dedup,
                MagicMock(),
                MagicMock(),
            )
        assert result == []

    def test_skips_entries_without_url(self):
        mock_validator = MagicMock()
        mock_validator.validate_url.return_value = (True, "ok")

        entry = MagicMock()
        entry.link = ""  # no URL
        entry.title = "No URL Story"

        mock_feed = MagicMock()
        mock_feed.entries = [entry]

        with patch("scraper.daily_scrape.feedparser") as mock_fp:
            mock_fp.parse.return_value = mock_feed
            result = scrape_rss_source(
                self._make_source(),
                mock_validator,
                MagicMock(),
                MagicMock(),
                MagicMock(),
                MagicMock(),
            )
        assert result == []

    def test_skips_entries_without_title(self):
        mock_validator = MagicMock()
        mock_validator.validate_url.return_value = (True, "ok")

        entry = MagicMock()
        entry.link = "https://example.com/article"
        entry.title = ""  # no title

        mock_feed = MagicMock()
        mock_feed.entries = [entry]

        with patch("scraper.daily_scrape.feedparser") as mock_fp:
            mock_fp.parse.return_value = mock_feed
            result = scrape_rss_source(
                self._make_source(),
                mock_validator,
                MagicMock(),
                MagicMock(),
                MagicMock(),
                MagicMock(),
            )
        assert result == []

    def test_skips_failed_fetch(self):
        mock_validator = MagicMock()
        mock_validator.validate_url.return_value = (True, "ok")
        mock_dedup = MagicMock()
        mock_dedup.is_duplicate.return_value = False

        mock_feed = MagicMock()
        mock_feed.entries = [self._make_entry()]

        with patch("scraper.daily_scrape.feedparser") as mock_fp, \
             patch("scraper.daily_scrape._fetch_article") as mock_fetch:
            mock_fp.parse.return_value = mock_feed
            mock_fetch.return_value = None  # fetch failed

            result = scrape_rss_source(
                self._make_source(),
                mock_validator,
                MagicMock(),
                mock_dedup,
                MagicMock(),
                MagicMock(),
            )
        assert result == []

    def test_skips_rejected_response(self):
        mock_validator = MagicMock()
        mock_validator.validate_url.return_value = (True, "ok")
        mock_validator.validate_response.return_value = (False, "too large")
        mock_dedup = MagicMock()
        mock_dedup.is_duplicate.return_value = False

        mock_feed = MagicMock()
        mock_feed.entries = [self._make_entry()]
        mock_response = MagicMock()
        mock_response.text = "some content"

        with patch("scraper.daily_scrape.feedparser") as mock_fp, \
             patch("scraper.daily_scrape._fetch_article") as mock_fetch:
            mock_fp.parse.return_value = mock_feed
            mock_fetch.return_value = mock_response

            result = scrape_rss_source(
                self._make_source(),
                mock_validator,
                MagicMock(),
                mock_dedup,
                MagicMock(),
                MagicMock(),
            )
        assert result == []

    def test_successful_scrape_returns_story(self):
        mock_validator = MagicMock()
        mock_validator.validate_url.return_value = (True, "ok")
        mock_validator.validate_response.return_value = (True, "ok")
        mock_validator.validate_content.return_value = (True, "ok")
        mock_dedup = MagicMock()
        mock_dedup.is_duplicate.return_value = False

        mock_extractor = MagicMock()
        mock_extractor.extract_story.return_value = {
            "summary": "OpenAI released GPT-5.",
            "entities": ["OpenAI"],
            "keywords": ["GPT-5", "AI"],
            "relationships": [],
            "importance_score": 0.9,
        }

        mock_feed = MagicMock()
        mock_feed.entries = [self._make_entry(title="OpenAI Releases GPT-5")]
        mock_response = MagicMock()
        mock_response.text = "OpenAI has released GPT-5 with improved capabilities."

        with patch("scraper.daily_scrape.feedparser") as mock_fp, \
             patch("scraper.daily_scrape._fetch_article") as mock_fetch:
            mock_fp.parse.return_value = mock_feed
            mock_fetch.return_value = mock_response

            result = scrape_rss_source(
                self._make_source(),
                mock_validator,
                MagicMock(),
                mock_dedup,
                mock_extractor,
                MagicMock(),
            )

        assert len(result) == 1
        story = result[0]
        assert story["title"] == "OpenAI Releases GPT-5"
        assert "id" in story
        assert "source_name" in story
        assert story["source_name"] == "Test Source"

    def test_respects_max_articles_per_source(self):
        mock_validator = MagicMock()
        mock_validator.validate_url.return_value = (True, "ok")
        mock_validator.validate_response.return_value = (True, "ok")
        mock_validator.validate_content.return_value = (True, "ok")
        mock_dedup = MagicMock()
        mock_dedup.is_duplicate.return_value = False

        mock_extractor = MagicMock()
        mock_extractor.extract_story.return_value = {
            "summary": "Story summary.",
            "entities": [],
            "keywords": [],
            "relationships": [],
            "importance_score": 0.5,
        }

        entries = [self._make_entry(url=f"https://test.com/article-{i}", title=f"Story {i}") for i in range(20)]
        mock_feed = MagicMock()
        mock_feed.entries = entries
        mock_response = MagicMock()
        mock_response.text = "AI content about machine learning"

        with patch("scraper.daily_scrape.feedparser") as mock_fp, \
             patch("scraper.daily_scrape._fetch_article") as mock_fetch:
            mock_fp.parse.return_value = mock_feed
            mock_fetch.return_value = mock_response

            result = scrape_rss_source(
                self._make_source(),
                mock_validator,
                MagicMock(),
                mock_dedup,
                mock_extractor,
                MagicMock(),
            )

        assert len(result) <= MAX_ARTICLES_PER_SOURCE

    def test_skips_if_extractor_returns_none(self):
        mock_validator = MagicMock()
        mock_validator.validate_url.return_value = (True, "ok")
        mock_validator.validate_response.return_value = (True, "ok")
        mock_validator.validate_content.return_value = (True, "ok")
        mock_dedup = MagicMock()
        mock_dedup.is_duplicate.return_value = False
        mock_extractor = MagicMock()
        mock_extractor.extract_story.return_value = None  # extractor skips

        mock_feed = MagicMock()
        mock_feed.entries = [self._make_entry()]
        mock_response = MagicMock()
        mock_response.text = "content"

        with patch("scraper.daily_scrape.feedparser") as mock_fp, \
             patch("scraper.daily_scrape._fetch_article") as mock_fetch:
            mock_fp.parse.return_value = mock_feed
            mock_fetch.return_value = mock_response

            result = scrape_rss_source(
                self._make_source(),
                mock_validator,
                MagicMock(),
                mock_dedup,
                mock_extractor,
                MagicMock(),
            )
        assert result == []

    def test_story_has_era_set(self):
        mock_validator = MagicMock()
        mock_validator.validate_url.return_value = (True, "ok")
        mock_validator.validate_response.return_value = (True, "ok")
        mock_validator.validate_content.return_value = (True, "ok")
        mock_dedup = MagicMock()
        mock_dedup.is_duplicate.return_value = False
        mock_extractor = MagicMock()
        mock_extractor.extract_story.return_value = {
            "summary": "Test summary.",
            "entities": [],
            "keywords": [],
            "relationships": [],
            "importance_score": 0.5,
        }

        mock_feed = MagicMock()
        mock_feed.entries = [self._make_entry()]
        mock_response = MagicMock()
        mock_response.text = "AI content"

        with patch("scraper.daily_scrape.feedparser") as mock_fp, \
             patch("scraper.daily_scrape._fetch_article") as mock_fetch:
            mock_fp.parse.return_value = mock_feed
            mock_fetch.return_value = mock_response

            result = scrape_rss_source(
                self._make_source(),
                mock_validator,
                MagicMock(),
                mock_dedup,
                mock_extractor,
                MagicMock(),
            )

        assert result[0]["era"] in ("frontier", "agentic", "transformer", "deep_learning")


# ---------------------------------------------------------------------------
# main() function
# ---------------------------------------------------------------------------

class TestScraperMain:
    def test_main_returns_1_without_api_key(self):
        from scraper.daily_scrape import main
        with patch.dict("os.environ", {"GEMINI_API_KEY": ""}, clear=False):
            result = main()
        assert result == 1

    def test_main_skips_stale_run(self):
        from scraper.daily_scrape import main
        from datetime import datetime, timezone, timedelta

        recent_time = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        mock_storage = MagicMock()
        mock_storage.load_state.return_value = {
            "status": "running",
            "started_at": recent_time,
        }

        with patch("scraper.daily_scrape.StoryStorage", return_value=mock_storage), \
             patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}, clear=False):
            result = main()
        assert result == 0

    def test_main_processes_stale_lock_with_old_timestamp(self):
        from scraper.daily_scrape import main
        from datetime import datetime, timezone, timedelta

        old_time = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        mock_storage = MagicMock()
        mock_storage.load_state.return_value = {
            "status": "running",
            "started_at": old_time,
        }
        mock_storage.load_stories.return_value = []
        mock_storage.save_state.return_value = True

        with patch("scraper.daily_scrape.StoryStorage", return_value=mock_storage), \
             patch("scraper.daily_scrape.RateLimiter"), \
             patch("scraper.daily_scrape.SecurityValidator"), \
             patch("scraper.daily_scrape.StoryExtractor"), \
             patch("scraper.daily_scrape.DedupEngine"), \
             patch("scraper.daily_scrape.scrape_rss_source", return_value=[]), \
             patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}, clear=False):
            result = main()
        # Should proceed (not skip) and return 0 since no new stories
        assert result == 0
