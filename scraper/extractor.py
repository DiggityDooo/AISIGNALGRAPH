"""Google Gemini-powered story extraction engine."""

import json
import os
import re

import tenacity
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from loguru import logger

from scraper.security.rate_limiter import ApiRateLimiter

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)
_GEMINI_LIMITER = ApiRateLimiter(max_requests=12, window_seconds=60.0)
_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)


def _is_retryable(exc: BaseException) -> bool:
    """Retry on rate limits and transient server errors."""
    if isinstance(exc, genai_errors.APIError):
        return exc.code in (429, 500, 502, 503, 504)
    return False


class StoryExtractor:
    MODEL = "gemini-3.1-flash-lite"
    MAX_TOKENS = 900
    TEXT_CHAR_LIMIT = 3000

    def __init__(
        self,
        api_key: str | None = None,
        rate_limiter: ApiRateLimiter | None = None,
    ):
        key = (api_key or os.environ.get("GEMINI_API_KEY", "")).strip()
        if not key:
            raise ValueError("GEMINI_API_KEY is not set")
        self.client = genai.Client(api_key=key)
        self._rate_limiter = rate_limiter if rate_limiter is not None else _GEMINI_LIMITER

    def extract_story(
        self,
        title: str,
        text: str,
        source_name: str,
        date: str,
        is_historical: bool = False,
    ) -> dict | None:
        prompt = self._build_prompt(title, text, source_name, date, is_historical)
        try:
            raw = self._call_api(prompt)
        except Exception as exc:
            logger.error("Extractor API call failed for '{}': {}", title, exc)
            return None
        return self._parse_response(raw)

    @tenacity.retry(
        wait=tenacity.wait_exponential(multiplier=1, min=2, max=30),
        stop=tenacity.stop_after_attempt(3),
        retry=tenacity.retry_if_exception(_is_retryable),
        reraise=True,
    )
    def _call_api(self, prompt: str) -> str:
        self._rate_limiter.acquire()
        response = self.client.models.generate_content(
            model=self.MODEL,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                max_output_tokens=self.MAX_TOKENS,
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )
        return response.text or ""

    def _build_prompt(self, title, text, source_name, date, is_historical) -> str:
        historical_note = (
            "This is a HISTORICAL entry. Weight importance_score toward its "
            "outsized influence on the field of AI, not its recency.\n"
            if is_historical
            else ""
        )
        return f"""Extract structured knowledge-graph data from this AI news article.

TITLE: {title}
SOURCE: {source_name}
DATE: {date}

ARTICLE TEXT:
{text[: self.TEXT_CHAR_LIMIT]}

{historical_note}Return ONLY a JSON object with this exact schema:

{{
  "summary": "2-4 factual sentences. No fluff. No 'In this article'. Just facts.",
  "entities": [
    {{"name": "exact proper name", "type": "lab|model|person|product|concept|policy|risk|dataset|hardware|event"}}
  ],
  "keywords": ["3-8 lowercase topic tags"],
  "relationships": [
    {{"source": "Entity A", "target": "Entity B", "relation": "past-tense verb phrase"}}
  ],
  "importance_score": 0.5,
  "skip": false
}}

Rules:
- importance_score: float 0.0-1.0. Breakthrough papers/models: 0.85-1.0.
  Major product releases: 0.7-0.85. Significant research: 0.5-0.7.
  Minor updates/commentary: 0.1-0.5.
- skip: set to true if the article is not substantively about AI.
- entities: only genuinely named proper nouns. Minimum 2, maximum 15.
  Never include vague entities like "researchers" or "the company".
- relationships: must only pair entities that appear in the entities array.
- Return {{"skip": true}} for non-AI content."""

    def _parse_response(self, raw: str) -> dict | None:
        cleaned = _FENCE_RE.sub("", raw.strip()).strip()
        data = None
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            match = _JSON_BLOCK_RE.search(cleaned)
            if match:
                try:
                    data = json.loads(match.group(0))
                except json.JSONDecodeError:
                    return None
        if not isinstance(data, dict):
            return None

        if data.get("skip") is True:
            return None

        if not all(key in data for key in ("summary", "entities", "keywords")):
            return None

        try:
            score = float(data.get("importance_score", 0.5))
        except (TypeError, ValueError):
            score = 0.5
        data["importance_score"] = max(0.0, min(1.0, score))

        if not isinstance(data.get("relationships"), list):
            data["relationships"] = []

        return data
