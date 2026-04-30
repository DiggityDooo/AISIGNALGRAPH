from __future__ import annotations

from pathlib import Path
import re

import pytest

from scripts.import_jobs_masterdoc import BEGIN_MARKER, END_MARKER, build_jobs_appendix, import_jobs_masterdoc, upsert_jobs_appendix
from webapp import create_app
from webapp.graph_store import GraphStore


REPO_ROOT = Path(__file__).resolve().parents[1]
EXTERNAL_JOBS_DOC = Path("/home/seanb/Downloads/Pics/AI_Jobs_Masterdoc.md")


def _strip_jobs_appendix(text: str) -> str:
    if BEGIN_MARKER not in text or END_MARKER not in text:
        return text
    start = text.index(BEGIN_MARKER)
    end = text.index(END_MARKER) + len(END_MARKER)
    return text[:start].rstrip() + "\n\n" + text[end:].lstrip("\n")


def _story_by_title(store: GraphStore, title: str):
    return next(story for story in store.list_stories() if story.title == title)


@pytest.fixture
def imported_masterdoc(tmp_path: Path) -> Path:
    target = tmp_path / "data" / "ai_master.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    base_text = (REPO_ROOT / "data" / "ai_master.md").read_text(encoding="utf-8")
    target.write_text(_strip_jobs_appendix(base_text), encoding="utf-8")
    import_jobs_masterdoc(EXTERNAL_JOBS_DOC, target)
    return target


@pytest.fixture
def jobs_store(imported_masterdoc: Path, tmp_path: Path) -> GraphStore:
    return GraphStore(tmp_path, source_path=imported_masterdoc)


@pytest.fixture
def jobs_app(imported_masterdoc: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AI_MASTER_DOC_PATH", str(imported_masterdoc))
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "data" / "ai_graph.db"))
    monkeypatch.setenv("FLASK_SECRET_KEY", "test-secret")
    app = create_app()
    app.config.update({"TESTING": True, "DEBUG": False})
    return app


@pytest.fixture
def jobs_client(jobs_app):
    return jobs_app.test_client()


def test_build_jobs_appendix_contains_all_structured_sections():
    appendix = build_jobs_appendix(EXTERNAL_JOBS_DOC)
    assert BEGIN_MARKER in appendix
    assert END_MARKER in appendix
    assert "### **AI Evaluation & Training Platforms**" in appendix
    assert "### **New Job Roles AI Has Created**" in appendix
    assert "### **Job Roles Being Eliminated or Severely Reduced**" in appendix
    assert "### **Companies That Have Cut Jobs and Cited AI**" in appendix
    assert "| Mercor | AI Evaluator / Expert Contractor |" in appendix
    assert "| AI Engineer / ML Engineer | Builds, trains, and deploys AI models and systems |" in appendix
    assert "| Klarna | 700 | Fintech | 2024 |" in appendix
    assert "* Entry-Level and New Graduate Impact — Apr 2026 snapshot:" in appendix


def test_upsert_jobs_appendix_replaces_existing_block():
    sample_master = "before\n\n<!-- BEGIN AI_JOBS_APPENDIX -->\nold\n<!-- END AI_JOBS_APPENDIX -->\n\nafter\n"
    updated = upsert_jobs_appendix(sample_master, "<!-- BEGIN AI_JOBS_APPENDIX -->\nnew\n<!-- END AI_JOBS_APPENDIX -->\n")
    assert "old" not in updated
    assert "new" in updated
    assert updated.count(BEGIN_MARKER) == 1


def test_jobs_date_normalization(jobs_store: GraphStore):
    assert jobs_store._normalize_jobs_date("2026-04", "May 2025") == "2025-05"
    assert jobs_store._normalize_jobs_date("2026-04", "2025") == "2025"
    assert jobs_store._normalize_jobs_date("2026-04", "By 2026") == "2026"
    assert jobs_store._normalize_jobs_date("2026-04", "No explicit date here") == "2026-04"


def test_jobs_appendix_creates_structured_story_kinds(jobs_store: GraphStore):
    mercor = _story_by_title(jobs_store, "Mercor")
    engineer = _story_by_title(jobs_store, "AI Engineer / ML Engineer")
    data_entry = _story_by_title(jobs_store, "Data Entry Clerk")
    microsoft = _story_by_title(jobs_store, "Microsoft")
    entry_level = _story_by_title(jobs_store, "Entry-Level and New Graduate Impact")

    assert mercor.kind == "ai-work-platform"
    assert mercor.event_date == "2025-10"
    assert engineer.kind == "job-creation"
    assert engineer.event_date == "2026-04"
    assert data_entry.kind == "job-displacement"
    assert microsoft.kind == "ai-layoff"
    assert microsoft.event_date == "2025-05"
    assert entry_level.kind == "labor-analysis"
    assert entry_level.event_date == "2026-04"


def test_jobs_appendix_creates_synthetic_entities(jobs_store: GraphStore):
    mercor = jobs_store.get_entity("org-mercor")
    data_entry = jobs_store.get_entity("job-role-data-entry-clerk")
    engineer = jobs_store.get_entity("job-role-ai-engineer-ml-engineer")

    assert mercor is not None
    assert mercor["record"].name == "Mercor"
    assert data_entry is not None
    assert data_entry["record"].name == "Data Entry Clerk"
    assert engineer is not None
    assert engineer["record"].story_count >= 1


def test_jobs_appendix_surfaces_in_graph_and_story_api(jobs_client, jobs_store: GraphStore):
    graph_response = jobs_client.get("/api/graph")
    assert graph_response.status_code == 200
    graph_payload = graph_response.get_json()
    labels = {node["label"] for node in graph_payload["nodes"]}
    assert "Mercor" in labels
    assert "Data Entry Clerk" in labels
    assert "AI Engineer / ML Engineer" in labels

    mercor_story = _story_by_title(jobs_store, "Mercor")
    displacement_story = _story_by_title(jobs_store, "Data Entry Clerk")
    layoff_story = _story_by_title(jobs_store, "Microsoft")

    mercor_response = jobs_client.get(f"/api/story/{mercor_story.id}")
    displacement_response = jobs_client.get(f"/api/story/{displacement_story.id}")
    layoff_response = jobs_client.get(f"/api/story/{layoff_story.id}")

    assert mercor_response.status_code == 200
    assert mercor_response.get_json()["kind"] == "ai-work-platform"
    assert displacement_response.status_code == 200
    assert displacement_response.get_json()["kind"] == "job-displacement"
    assert layoff_response.status_code == 200
    assert layoff_response.get_json()["kind"] == "ai-layoff"

    entity_response = jobs_client.get("/entities/org-mercor")
    assert entity_response.status_code == 200


def test_community_labels_are_semantic_not_numbered(jobs_store: GraphStore):
    communities = jobs_store.get_graph_data()["communities"]
    assert communities
    for community in communities:
        assert not re.fullmatch(r"Community \d+", community["label"])
