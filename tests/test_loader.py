import json
import sqlite3

import pytest

from scraper.storage import StoryStorage
from webapp.db import run_migrations
from webapp.loader import DataLoader

STORY = {
    "id": "11111111-1111-4111-8111-111111111111",
    "title": "Test Story About AI",
    "summary": "A test summary.",
    "date": "2024-03-01",
    "source_url": "https://openai.com/test-story",
    "source_name": "Test Source",
    "entities": [
        {"name": "OpenAI", "type": "lab"},
        {"name": "GPT-Test", "type": "model"},
    ],
    "keywords": ["testing", "ai"],
    "relationships": [
        {"source": "OpenAI", "target": "GPT-Test", "relation": "released"}
    ],
    "era": "frontier",
    "importance_score": 0.8,
    "scraped_at": "2026-06-10T00:00:00+00:00",
}


@pytest.fixture
def conn(tmp_path):
    connection = sqlite3.connect(tmp_path / "test.db")
    connection.executescript(
        """
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE entities (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, entity_type TEXT NOT NULL,
            group_name TEXT NOT NULL, description TEXT NOT NULL, importance INTEGER NOT NULL
        );
        CREATE TABLE stories (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL,
            status TEXT NOT NULL, event_date TEXT NOT NULL, summary TEXT NOT NULL,
            details TEXT NOT NULL, importance INTEGER NOT NULL
        );
        CREATE TABLE story_entities (
            story_id TEXT NOT NULL, entity_id TEXT NOT NULL,
            PRIMARY KEY (story_id, entity_id)
        );
        CREATE TABLE story_tags (
            story_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (story_id, tag)
        );
        CREATE TABLE entity_links (
            source_id TEXT NOT NULL, target_id TEXT NOT NULL, relation TEXT NOT NULL,
            weight INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (source_id, target_id, relation)
        );
        """
    )
    run_migrations(connection)
    yield connection
    connection.close()


def _loader_with_stories(tmp_path, stories):
    stories_path = tmp_path / "stories.json"
    stories_path.write_text(json.dumps(stories))
    storage = StoryStorage(bucket_name="", stories_path=stories_path)
    return DataLoader(storage=storage)


def test_load_stories_inserts_new_entries(conn, tmp_path):
    loader = _loader_with_stories(tmp_path, [STORY])
    inserted = loader.load_stories(conn)
    assert inserted == 1

    row = conn.execute("SELECT title, era, importance_score FROM stories").fetchone()
    assert row[0] == "Test Story About AI"
    assert row[1] == "frontier"
    assert row[2] == 0.8

    entity_count = conn.execute("SELECT COUNT(*) FROM entities").fetchone()[0]
    assert entity_count == 2
    link = conn.execute("SELECT relation, weight FROM entity_links").fetchone()
    assert link == ("released", 1)


def test_load_stories_skips_duplicates(conn, tmp_path):
    loader = _loader_with_stories(tmp_path, [STORY])
    assert loader.load_stories(conn) == 1
    assert loader.load_stories(conn) == 0


def test_load_seed_is_idempotent(conn, tmp_path):
    seed_path = tmp_path / "seed.json"
    seed_path.write_text(json.dumps([STORY]))
    storage = StoryStorage(bucket_name="", stories_path=tmp_path / "none.json")
    loader = DataLoader(storage=storage, seed_path=seed_path)

    assert loader.load_seed(conn) == 1
    assert loader.load_seed(conn) == 0


def test_load_handles_missing_file(conn, tmp_path):
    storage = StoryStorage(bucket_name="", stories_path=tmp_path / "missing.json")
    loader = DataLoader(storage=storage)
    assert loader.load_stories(conn) == 0


def test_load_handles_malformed_json(conn, tmp_path):
    stories_path = tmp_path / "bad.json"
    stories_path.write_text("{not valid json")
    storage = StoryStorage(bucket_name="", stories_path=stories_path)
    loader = DataLoader(storage=storage)
    assert loader.load_stories(conn) == 0


def test_fts_search_works_after_load(conn, tmp_path):
    loader = _loader_with_stories(tmp_path, [STORY])
    loader.load_stories(conn)
    rows = conn.execute(
        "SELECT story_id FROM stories_fts WHERE stories_fts MATCH '\"test\"'"
    ).fetchall()
    assert len(rows) == 1
