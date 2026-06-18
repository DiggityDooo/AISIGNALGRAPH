import json
from unittest.mock import MagicMock, patch

import pytest

from scraper.extractor import GeminiRateLimitError, StoryExtractor


@pytest.fixture
def extractor():
    with patch("scraper.extractor.genai.Client"):
        return StoryExtractor(api_key="test-key", rate_limiter=MagicMock())


VALID_PAYLOAD = {
    "summary": "OpenAI released a new model.",
    "entities": [
        {"name": "OpenAI", "type": "lab"},
        {"name": "GPT-5", "type": "model"},
    ],
    "keywords": ["openai", "gpt-5"],
    "relationships": [
        {"source": "OpenAI", "target": "GPT-5", "relation": "released"}
    ],
    "importance_score": 0.9,
    "skip": False,
}


def test_parse_returns_correct_schema(extractor):
    result = extractor._parse_response(json.dumps(VALID_PAYLOAD))
    assert result is not None
    assert result["summary"] == "OpenAI released a new model."
    assert len(result["entities"]) == 2
    assert result["importance_score"] == 0.9


def test_parse_returns_none_for_skip(extractor):
    result = extractor._parse_response(json.dumps({"skip": True}))
    assert result is None


def test_parse_returns_none_for_missing_fields(extractor):
    result = extractor._parse_response(json.dumps({"summary": "x"}))
    assert result is None


def test_importance_score_clamped_to_unit_range(extractor):
    payload = dict(VALID_PAYLOAD, importance_score=4.2)
    result = extractor._parse_response(json.dumps(payload))
    assert result["importance_score"] == 1.0

    payload = dict(VALID_PAYLOAD, importance_score=-1.0)
    result = extractor._parse_response(json.dumps(payload))
    assert result["importance_score"] == 0.0


def test_parse_strips_markdown_fences(extractor):
    raw = "```json\n" + json.dumps(VALID_PAYLOAD) + "\n```"
    result = extractor._parse_response(raw)
    assert result is not None
    assert result["summary"] == "OpenAI released a new model."


def test_parse_extracts_json_block_from_prose(extractor):
    raw = "Here is the result:\n" + json.dumps(VALID_PAYLOAD) + "\nDone."
    result = extractor._parse_response(raw)
    assert result is not None


def test_parse_returns_none_on_garbage(extractor):
    assert extractor._parse_response("not json at all") is None


def test_extract_returns_none_when_api_fails(extractor):
    extractor.client.models.generate_content = MagicMock(side_effect=RuntimeError("boom"))
    result = extractor.extract_story(
        title="t", text="x", source_name="s", date="2026-01-01"
    )
    assert result is None


def test_extract_parses_successful_response(extractor):
    response = MagicMock()
    response.text = json.dumps(VALID_PAYLOAD)
    extractor.client.models.generate_content = MagicMock(return_value=response)
    result = extractor.extract_story(
        title="t", text="x", source_name="s", date="2026-01-01"
    )
    assert result is not None
    assert result["importance_score"] == 0.9


def test_missing_api_key_raises():
    with patch.dict("os.environ", {"GEMINI_API_KEY": ""}):
        with pytest.raises(ValueError):
            StoryExtractor()


def test_extract_raises_gemini_rate_limit_error_on_429(extractor):
    from google.genai import errors as genai_errors
    api_error = genai_errors.APIError(
        code=429,
        response_json={"message": "Rate limit exceeded"}
    )
    extractor.client.models.generate_content = MagicMock(side_effect=api_error)
    with pytest.raises(GeminiRateLimitError):
        extractor.extract_story(
            title="t", text="x", source_name="s", date="2026-01-01"
        )
