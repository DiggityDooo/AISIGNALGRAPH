import time

import pytest

from scraper.security.allowlist import is_domain_allowed
from scraper.security.blocklist import is_url_blocked
from scraper.security.rate_limiter import RateLimiter
from scraper.security.sanitizer import html_to_plain_text, sanitize_html
from scraper.security.validator import SecurityValidator


@pytest.fixture
def validator():
    return SecurityValidator(RateLimiter())


def test_allowlist_accepts_trusted_domain():
    assert is_domain_allowed("https://openai.com/blog/some-post")
    assert is_domain_allowed("https://www.anthropic.com/news")
    assert is_domain_allowed("https://spectrum.ieee.org/ai-article")


def test_allowlist_rejects_unknown_domain():
    assert not is_domain_allowed("https://random-ai-spam-site.com/post")


def test_blocklist_rejects_url_shortener():
    assert is_url_blocked("https://bit.ly/3xYzAbc")
    assert is_url_blocked("https://tinyurl.com/foo")


def test_blocklist_rejects_raw_ip():
    assert is_url_blocked("https://93.184.216.34/article")


def test_validator_rejects_http_scheme(validator):
    ok, reason = validator.validate_url("http://openai.com/blog")
    assert not ok
    assert "https" in reason


def test_validator_rejects_javascript_scheme(validator):
    ok, _ = validator.validate_url("javascript:alert(1)")
    assert not ok


def test_validator_rejects_blocked_domain(validator):
    ok, _ = validator.validate_url("https://bit.ly/3xYzAbc")
    assert not ok


def test_validator_accepts_valid_url(validator):
    ok, reason = validator.validate_url("https://openai.com/blog/new-model")
    assert ok
    assert reason == ""


def test_validator_rejects_overlong_url(validator):
    url = "https://openai.com/" + "a" * 2100
    ok, _ = validator.validate_url(url)
    assert not ok


def test_content_validation_rejects_no_ai_keywords(validator):
    ok, reason = validator.validate_content(
        "A lengthy story about gardening and tomatoes growing in the sun.",
        "https://openai.com/x",
    )
    assert not ok
    assert "not AI-relevant" in reason


def test_content_validation_rejects_eval_js(validator):
    content = "AI model research eval(atob('payload')) machine learning"
    ok, reason = validator.validate_content(content, "https://openai.com/x")
    assert not ok


def test_content_validation_accepts_ai_content(validator):
    ok, _ = validator.validate_content(
        "The new transformer model improves machine learning benchmarks.",
        "https://openai.com/x",
    )
    assert ok


def test_sanitizer_strips_script_tags():
    cleaned = sanitize_html("<p>hello</p><script>alert(1)</script>")
    assert "<script" not in cleaned
    assert "hello" in cleaned


def test_sanitizer_strips_event_handlers():
    cleaned = sanitize_html('<a href="https://x.com" onclick="evil()">link</a>')
    assert "onclick" not in cleaned
    assert "link" in cleaned


def test_html_to_plain_text_collapses_whitespace():
    text = html_to_plain_text("<p>one</p>\n\n<p>two   three</p>")
    assert text == "one two three"


def test_rate_limiter_delays_rapid_requests():
    limiter = RateLimiter()
    limiter.wait_if_needed("example.com", 0.2)
    start = time.monotonic()
    limiter.wait_if_needed("example.com", 0.2)
    elapsed = time.monotonic() - start
    assert elapsed >= 0.15
