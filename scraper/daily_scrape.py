"""Daily scrape orchestrator. Runs as a Cloud Run Job (run-to-completion).

Pipeline per article: dedup -> URL validation -> rate limit -> fetch ->
response validation -> sanitize -> content validation -> LLM extraction.
A failure at any step silently drops the item and logs the reason.
"""

import os
import sys
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

import feedparser
import requests
from loguru import logger

from scraper.dedup import DedupEngine
from scraper.extractor import GeminiRateLimitError, StoryExtractor
from scraper.security.rate_limiter import RateLimiter
from scraper.security.sanitizer import html_to_plain_text
from scraper.security.validator import SecurityValidator
from scraper.sources import RSS_SOURCES, classify_era
from scraper.storage import StoryStorage

MAX_ARTICLES_PER_SOURCE = 5
REQUEST_TIMEOUT = 10
MAX_RESPONSE_SIZE = 5_242_880  # 5MB
STALE_LOCK_MINUTES = 30

SCRAPER_HEADERS = {
    "User-Agent": (
        "AISIGNALGRAPH-Bot/2.0 "
        "(+https://github.com/DiggityDooo/AISIGNALGRAPH; "
        "AI knowledge graph research project)"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    "Accept-Language": "en-US,en;q=0.5",
    "DNT": "1",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _entry_date(entry) -> str:
    for attr in ("published_parsed", "updated_parsed"):
        parsed = getattr(entry, attr, None)
        if parsed:
            return time.strftime("%Y-%m-%d", parsed)
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _fetch_article(url: str, session: requests.Session) -> requests.Response | None:
    try:
        return session.get(
            url,
            headers=SCRAPER_HEADERS,
            timeout=REQUEST_TIMEOUT,
            verify=True,
            allow_redirects=True,
            stream=False,
        )
    except requests.RequestException as exc:
        logger.warning("Fetch failed for {}: {}", url, exc)
        return None


def scrape_rss_source(
    source: dict,
    validator: SecurityValidator,
    rate_limiter: RateLimiter,
    dedup: DedupEngine,
    extractor: StoryExtractor,
    session: requests.Session,
) -> list[dict]:
    rss_url = source["rss"]
    ok, reason = validator.validate_url(rss_url)
    if not ok:
        logger.warning("RSS URL rejected for {}: {}", source["name"], reason)
        return []

    rss_domain = urlparse(rss_url).hostname or ""
    rate_limiter.wait_if_needed(rss_domain, RateLimiter.RSS_DELAY_S)

    try:
        feed = feedparser.parse(rss_url)
    except Exception as exc:
        logger.warning("feedparser failed for {}: {}", source["name"], exc)
        return []

    results: list[dict] = []
    for entry in feed.entries[:MAX_ARTICLES_PER_SOURCE]:
        url = (getattr(entry, "link", "") or "").strip()
        title = (getattr(entry, "title", "") or "").strip()
        if not url or not title:
            continue

        if dedup.is_duplicate(url, title):
            logger.debug("Duplicate skipped: {}", title)
            continue

        ok, reason = validator.validate_url(url)
        if not ok:
            logger.info("URL rejected ({}): {}", reason, url)
            continue

        article_domain = urlparse(url).hostname or ""
        rate_limiter.wait_if_needed(article_domain)

        response = _fetch_article(url, session)
        if response is None:
            continue

        ok, reason = validator.validate_response(response)
        if not ok:
            logger.info("Response rejected ({}): {}", reason, url)
            continue

        text = html_to_plain_text(response.text[:MAX_RESPONSE_SIZE])
        ok, reason = validator.validate_content(text, url)
        if not ok:
            logger.info("Content rejected ({}): {}", reason, url)
            continue

        date = _entry_date(entry)
        extracted = extractor.extract_story(
            title=title, text=text, source_name=source["name"], date=date
        )
        if extracted is None:
            logger.info("Extractor skipped: {}", title)
            continue

        year = int(date[:4])
        story = {
            "id": str(uuid.uuid4()),
            "title": title,
            "summary": extracted["summary"],
            "date": date,
            "source_url": url,
            "source_name": source["name"],
            "entities": extracted.get("entities", []),
            "keywords": extracted.get("keywords", []),
            "relationships": extracted.get("relationships", []),
            "era": classify_era(year),
            "importance_score": extracted["importance_score"],
            "scraped_at": _now_iso(),
        }
        dedup.register(url, title)
        results.append(story)
        logger.info("Captured: {} ({})", title, source["name"])

    return results


def main() -> int:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        logger.error("GEMINI_API_KEY is not set; aborting.")
        return 1

    storage = StoryStorage()

    # Stale-run guard: skip if another run started < 30 minutes ago.
    state = storage.load_state()
    if state.get("status") == "running":
        started_at = state.get("started_at", "")
        try:
            started = datetime.fromisoformat(started_at)
            age_minutes = (datetime.now(timezone.utc) - started).total_seconds() / 60
            if age_minutes < STALE_LOCK_MINUTES:
                logger.info("Another scrape started {:.0f}m ago; exiting.", age_minutes)
                return 0
        except ValueError:
            pass

    started_iso = _now_iso()
    storage.save_state({"status": "running", "started_at": started_iso})

    start_time = time.monotonic()
    rate_limiter = RateLimiter()
    validator = SecurityValidator(rate_limiter)
    extractor = StoryExtractor(api_key=api_key)
    existing_stories = storage.load_stories()
    dedup = DedupEngine(stories=existing_stories)
    session = requests.Session()
    session.max_redirects = 3

    all_new: list[dict] = []
    aborted = False
    try:
        for source in RSS_SOURCES:
            try:
                new_stories = scrape_rss_source(
                    source, validator, rate_limiter, dedup, extractor, session
                )
                all_new.extend(new_stories)
            except GeminiRateLimitError:
                raise
            except Exception as exc:
                logger.error("Source {} failed entirely: {}", source["name"], exc)
                continue  # never let one bad source crash the run
    except GeminiRateLimitError as exc:
        logger.error("Scrape run aborted due to Gemini API rate limit / quota exhaustion: {}", exc)
        aborted = True

    duration = time.monotonic() - start_time

    if all_new:
        combined = existing_stories + all_new
        if not storage.save_stories(combined):
            storage.save_state(
                {
                    "status": "error",
                    "started_at": started_iso,
                    "last_scrape_iso": _now_iso(),
                    "error": "failed to persist stories",
                }
            )
            return 1

    if aborted:
        storage.save_state(
            {
                "status": "error",
                "started_at": started_iso,
                "last_scrape_iso": _now_iso(),
                "error": "Gemini API rate limit or daily quota exceeded",
                "stories_added": len(all_new),
                "stories_total": len(existing_stories) + len(all_new),
                "scrape_duration_s": round(duration, 2),
            }
        )
        return 1

    storage.save_state(
        {
            "status": "ok",
            "started_at": started_iso,
            "last_scrape_iso": _now_iso(),
            "stories_added": len(all_new),
            "stories_total": len(existing_stories) + len(all_new),
            "scrape_duration_s": round(duration, 2),
        }
    )

    logger.info(
        "Scrape complete: {} new stories in {:.1f}s ({} total).",
        len(all_new),
        duration,
        len(existing_stories) + len(all_new),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
