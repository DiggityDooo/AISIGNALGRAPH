"""Shared test fixtures for AISIGNALGRAPH test suite."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from webapp import create_app
from webapp.graph_store import GraphStore

# ---------------------------------------------------------------------------
# Minimal seed dataset used for unit tests
# ---------------------------------------------------------------------------

MINIMAL_SEED = {
    "name": "Test Graph",
    "entities": [
        {
            "id": "openai",
            "name": "OpenAI",
            "type": "company",
            "group": "Labs",
            "description": "Frontier AI lab behind ChatGPT and GPT-4.",
            "importance": 5,
        },
        {
            "id": "anthropic",
            "name": "Anthropic",
            "type": "company",
            "group": "Labs",
            "description": "Safety-focused AI lab behind Claude.",
            "importance": 5,
        },
        {
            "id": "nvidia",
            "name": "NVIDIA",
            "type": "company",
            "group": "Infrastructure",
            "description": "GPU maker central to AI training.",
            "importance": 4,
        },
        {
            "id": "year-2023",
            "name": "2023",
            "type": "year",
            "group": "Years",
            "description": "Year 2023.",
            "importance": 3,
        },
        {
            "id": "year-2024",
            "name": "2024",
            "type": "year",
            "group": "Years",
            "description": "Year 2024.",
            "importance": 3,
        },
        {
            "id": "safety",
            "name": "Safety vs Speed",
            "type": "keyword",
            "group": "Risk",
            "description": "Tension between deployment velocity and safety.",
            "importance": 4,
        },
    ],
    "stories": [
        {
            "id": "story-gpt4",
            "title": "GPT-4 Released by OpenAI",
            "kind": "model-release",
            "status": "historical",
            "date": "2023-03",
            "summary": "OpenAI released GPT-4, a multimodal flagship model.",
            "details": "## Detail\n\nGPT-4 was released in March 2023.",
            "importance": 5,
        },
        {
            "id": "story-claude3",
            "title": "Claude 3 Family Launch",
            "kind": "model-release",
            "status": "watch",
            "date": "2024-03",
            "summary": "Anthropic released Claude 3 family of models.",
            "details": "## Detail\n\nClaude 3 Opus, Sonnet, and Haiku launched.",
            "importance": 5,
        },
        {
            "id": "story-ai-safety-summit",
            "title": "UK AI Safety Summit",
            "kind": "policy",
            "status": "historical",
            "date": "2023-11",
            "summary": "World leaders met to discuss AI safety.",
            "details": "## Detail\n\nBletchley Park hosted the summit.",
            "importance": 4,
        },
        {
            "id": "story-nvidia-h100",
            "title": "NVIDIA H100 Dominates AI Training",
            "kind": "infrastructure",
            "status": "watch",
            "date": "2024-01",
            "summary": "NVIDIA H100 GPUs became the primary training accelerator.",
            "details": "## Detail\n\nH100 shortages shaped AI lab roadmaps.",
            "importance": 4,
        },
        {
            "id": "story-active",
            "title": "AI Labor Disruption Accelerates",
            "kind": "impact",
            "status": "active",
            "date": "2025-01",
            "summary": "AI-driven job displacement reached new sectors.",
            "details": "## Detail\n\nLabor economists flagged structural changes.",
            "importance": 3,
        },
    ],
    "story_entities": [
        ["story-gpt4", "openai"],
        ["story-gpt4", "year-2023"],
        ["story-claude3", "anthropic"],
        ["story-claude3", "year-2024"],
        ["story-ai-safety-summit", "openai"],
        ["story-ai-safety-summit", "anthropic"],
        ["story-ai-safety-summit", "year-2023"],
        ["story-nvidia-h100", "nvidia"],
        ["story-nvidia-h100", "year-2024"],
        ["story-active", "openai"],
        ["story-active", "anthropic"],
        ["story-active", "safety"],
    ],
    "story_tags": [
        ["story-gpt4", "model-release"],
        ["story-gpt4", "2023"],
        ["story-claude3", "model-release"],
        ["story-claude3", "2024"],
        ["story-ai-safety-summit", "policy"],
        ["story-ai-safety-summit", "2023"],
        ["story-nvidia-h100", "infrastructure"],
        ["story-nvidia-h100", "2024"],
        ["story-active", "impact"],
        ["story-active", "2025"],
    ],
    "entity_links": [
        {"source": "openai", "target": "anthropic", "relation": "co-mentioned", "weight": 3},
        {"source": "openai", "target": "safety", "relation": "co-mentioned", "weight": 2},
    ],
}


@pytest.fixture(scope="session")
def graph_root(tmp_path_factory):
    root = tmp_path_factory.mktemp("graph_root")
    data_dir = root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    seed_path = data_dir / "ai_graph_seed.json"
    seed_path.write_text(json.dumps(MINIMAL_SEED))
    return root


@pytest.fixture(scope="session")
def graph_store(graph_root):
    """Minimal GraphStore backed by a temp seed database (no master document)."""
    source_path = graph_root / "data" / "nonexistent_master.md"  # deliberately missing
    db_path = graph_root / "data" / "test_graph.db"
    return GraphStore(graph_root, source_path=source_path, db_path=db_path)


@pytest.fixture(scope="session")
def client():
    """Flask test client using the real app (reads from data/ai_graph.db)."""
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@pytest.fixture
def blank_conn(tmp_path):
    """Bare SQLite connection with schema but no data."""
    from webapp.db import run_migrations

    conn = sqlite3.connect(tmp_path / "blank.db")
    conn.executescript("""
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
    """)
    run_migrations(conn)
    yield conn
    conn.close()
