import json

from scraper.dedup import DedupEngine


def test_exact_url_duplicate_detected():
    engine = DedupEngine(stories=[{"source_url": "https://x.com/a", "title": "Story A"}])
    assert engine.is_duplicate("https://x.com/a", "Different Title")


def test_title_fingerprint_catches_near_duplicate():
    engine = DedupEngine(stories=[{"source_url": "https://x.com/a", "title": "OpenAI Releases GPT-5!"}])
    assert engine.is_duplicate("https://other.com/b", "openai releases gpt-5")


def test_register_then_detect():
    engine = DedupEngine(stories=[])
    assert not engine.is_duplicate("https://x.com/new", "Brand New Story")
    engine.register("https://x.com/new", "Brand New Story")
    assert engine.is_duplicate("https://x.com/new", "Brand New Story")


def test_empty_file_returns_no_duplicates(tmp_path):
    stories_file = tmp_path / "stories.json"
    stories_file.write_text(json.dumps([]))
    engine = DedupEngine(stories_file=stories_file)
    assert not engine.is_duplicate("https://x.com/a", "Anything")


def test_missing_file_returns_no_duplicates(tmp_path):
    engine = DedupEngine(stories_file=tmp_path / "nope.json")
    assert not engine.is_duplicate("https://x.com/a", "Anything")
