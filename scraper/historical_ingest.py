"""One-time historical ingest: seed corpus + Wayback Machine CDX backfill.

Run manually (locally or as a one-off Cloud Run Job execution):
    python -m scraper.historical_ingest
Env:
    GEMINI_API_KEY                 — required for Wayback extraction
    SEED_YEAR_FROM / SEED_YEAR_TO  — Wayback CDX year range (default 1990-2012)
    SKIP_WAYBACK=1                 — load only the static seed file
"""

import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from loguru import logger

from scraper.dedup import DedupEngine
from scraper.extractor import GeminiRateLimitError, StoryExtractor
from scraper.security.rate_limiter import RateLimiter
from scraper.security.sanitizer import html_to_plain_text
from scraper.security.validator import SecurityValidator
from scraper.sources import classify_era
from scraper.storage import StoryStorage

SEED_PATH = Path(os.environ.get("AI_SEED_PATH", "data/ai_history_seed.json"))

CDX_ENDPOINT = "http://web.archive.org/cdx/search/cdx"
WAYBACK_DOMAINS = [
    "mitpress.mit.edu",
    "cacm.acm.org",
    "spectrum.ieee.org",
    "wired.com",
    "nytimes.com",
]
WAYBACK_THROTTLE_S = 3.0
CDX_LIMIT = 50
REQUEST_TIMEOUT = 15

SCRAPER_HEADERS = {
    "User-Agent": (
        "AISIGNALGRAPH-Bot/2.0 "
        "(+https://github.com/DiggityDooo/AISIGNALGRAPH; "
        "AI knowledge graph research project)"
    ),
}


def load_seed_entries() -> list[dict]:
    if not SEED_PATH.exists():
        logger.warning("Seed file not found at {}", SEED_PATH)
        return []
    try:
        entries = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.error("Failed to load seed file: {}", exc)
        return []
    return entries if isinstance(entries, list) else []


def fetch_cdx_records(domain: str, year_from: int, year_to: int) -> list[dict]:
    params = {
        "url": domain,
        "output": "json",
        "matchType": "domain",
        "filter": "statuscode:200",
        "from": f"{year_from}0101",
        "to": f"{year_to}1231",
        "limit": str(CDX_LIMIT),
        "fl": "original,timestamp,statuscode",
    }
    try:
        response = requests.get(
            CDX_ENDPOINT, params=params, headers=SCRAPER_HEADERS, timeout=REQUEST_TIMEOUT
        )
        response.raise_for_status()
        rows = response.json()
    except (requests.RequestException, json.JSONDecodeError) as exc:
        logger.warning("CDX query failed for {}: {}", domain, exc)
        return []

    if not isinstance(rows, list) or len(rows) < 2:
        return []

    header = rows[0]
    return [dict(zip(header, row)) for row in rows[1:]]


def ingest_wayback(
    year_from: int,
    year_to: int,
    validator: SecurityValidator,
    dedup: DedupEngine,
    extractor: StoryExtractor,
) -> list[dict]:
    results: list[dict] = []
    for domain in WAYBACK_DOMAINS:
        records = fetch_cdx_records(domain, year_from, year_to)
        logger.info("CDX returned {} records for {}", len(records), domain)
        for record in records:
            original = record.get("original", "")
            timestamp = record.get("timestamp", "")
            if not original or not timestamp:
                continue

            wayback_url = f"https://web.archive.org/web/{timestamp}/{original}"
            title_hint = urlparse(original).path.strip("/").replace("-", " ")[:120] or original

            if dedup.is_duplicate(wayback_url, title_hint):
                continue

            ok, reason = validator.validate_url(wayback_url)
            if not ok:
                logger.info("Wayback URL rejected ({}): {}", reason, wayback_url)
                continue

            time.sleep(WAYBACK_THROTTLE_S)
            try:
                response = requests.get(
                    wayback_url,
                    headers=SCRAPER_HEADERS,
                    timeout=REQUEST_TIMEOUT,
                    allow_redirects=True,
                )
            except requests.RequestException as exc:
                logger.warning("Wayback fetch failed: {}", exc)
                continue

            ok, reason = validator.validate_response(response)
            if not ok:
                logger.info("Wayback response rejected ({}): {}", reason, wayback_url)
                continue

            text = html_to_plain_text(response.text)
            ok, reason = validator.validate_content(text, wayback_url)
            if not ok:
                logger.info("Wayback content rejected ({}): {}", reason, wayback_url)
                continue

            year = int(timestamp[:4])
            date = f"{timestamp[:4]}-{timestamp[4:6]}-{timestamp[6:8]}"
            extracted = extractor.extract_story(
                title=title_hint,
                text=text,
                source_name="Wayback Machine Archive",
                date=date,
                is_historical=True,
            )
            if extracted is None:
                continue

            story = {
                "id": str(uuid.uuid4()),
                "title": title_hint,
                "summary": extracted["summary"],
                "date": date,
                "source_url": wayback_url,
                "source_name": "Wayback Machine Archive",
                "entities": extracted.get("entities", []),
                "keywords": extracted.get("keywords", []),
                "relationships": extracted.get("relationships", []),
                "era": classify_era(year),
                "importance_score": extracted["importance_score"],
                "scraped_at": datetime.now(timezone.utc).isoformat(),
            }
            dedup.register(wayback_url, title_hint)
            results.append(story)
            logger.info("Wayback captured: {}", title_hint)

    return results


def main() -> int:
    storage = StoryStorage()
    existing = storage.load_stories()
    dedup = DedupEngine(stories=existing)

    new_stories: list[dict] = []

    # 1. Static curated seed (no network, no LLM needed).
    for entry in load_seed_entries():
        url = entry.get("source_url", "")
        title = entry.get("title", "")
        if dedup.is_duplicate(url, title):
            continue
        dedup.register(url, title)
        new_stories.append(entry)
    logger.info("Seed corpus contributed {} new stories.", len(new_stories))

    # 2. Wayback Machine CDX backfill (requires GEMINI_API_KEY).
    if os.environ.get("SKIP_WAYBACK", "").strip() != "1":
        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not api_key:
            logger.warning("GEMINI_API_KEY missing; skipping Wayback backfill.")
        else:
            year_from = int(os.environ.get("SEED_YEAR_FROM", "1990"))
            year_to = int(os.environ.get("SEED_YEAR_TO", "2012"))
            rate_limiter = RateLimiter()
            validator = SecurityValidator(rate_limiter)
            extractor = StoryExtractor(api_key=api_key)
            try:
                wayback = ingest_wayback(year_from, year_to, validator, dedup, extractor)
                logger.info("Wayback backfill contributed {} stories.", len(wayback))
                new_stories.extend(wayback)
            except GeminiRateLimitError as exc:
                logger.error("Historical backfill aborted due to Gemini API rate limit: {}", exc)

    if not new_stories:
        logger.info("Nothing new to ingest.")
        return 0

    if not storage.save_stories(existing + new_stories):
        logger.error("Failed to persist ingested stories.")
        return 1

    logger.info("Historical ingest complete: {} stories added.", len(new_stories))
    return 0


if __name__ == "__main__":
    sys.exit(main())
