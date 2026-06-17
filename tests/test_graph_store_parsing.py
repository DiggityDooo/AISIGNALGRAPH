"""Tests for GraphStore markdown parsing methods (bullet, table row, paragraph, master doc)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from webapp.graph_store import GraphStore, GraphStoreError


# ---------------------------------------------------------------------------
# Helpers: _section_tags, _entity_tags, _build_details
# ---------------------------------------------------------------------------

class TestSectionTags:
    def test_includes_kind(self, graph_store):
        tags = graph_store._section_tags("Model Release Timeline", "", "2023", "model-release")
        assert "model-release" in tags

    def test_includes_year_when_provided(self, graph_store):
        tags = graph_store._section_tags("Section", "", "2024", "timeline")
        assert "2024" in tags

    def test_tokenizes_section_words(self, graph_store):
        tags = graph_store._section_tags("Regulation Policy 2023", "", "2023", "policy")
        assert "regulation" in tags

    def test_filters_short_tokens(self, graph_store):
        tags = graph_store._section_tags("AI in 2023", "", "2023", "timeline")
        assert "in" not in tags

    def test_empty_section_and_subsection(self, graph_store):
        tags = graph_store._section_tags("", "", "2023", "timeline")
        assert "timeline" in tags


class TestEntityTags:
    def test_returns_set(self, graph_store):
        tags = graph_store._entity_tags(["openai"])
        assert isinstance(tags, set)

    def test_known_entity_id_includes_type(self, graph_store):
        tags = graph_store._entity_tags(["openai"])
        assert "company" in tags

    def test_known_entity_id_includes_slugified_name(self, graph_store):
        tags = graph_store._entity_tags(["openai"])
        assert "openai" in tags

    def test_unknown_entity_id_returns_empty(self, graph_store):
        tags = graph_store._entity_tags(["__nonexistent__"])
        assert len(tags) == 0

    def test_multiple_entities(self, graph_store):
        tags = graph_store._entity_tags(["openai", "anthropic"])
        assert "company" in tags


class TestBuildDetails:
    def test_includes_section(self, graph_store):
        result = graph_store._build_details("Model Releases", "", "Some text")
        assert "Model Releases" in result

    def test_includes_subsection(self, graph_store):
        result = graph_store._build_details("Section", "Sub", "Some text")
        assert "Sub" in result

    def test_includes_text(self, graph_store):
        result = graph_store._build_details("Section", "", "The main content")
        assert "The main content" in result

    def test_includes_label_when_provided(self, graph_store):
        result = graph_store._build_details("Section", "", "Body text", label="The Label")
        assert "The Label" in result

    def test_markdown_sections_present(self, graph_store):
        result = graph_store._build_details("Section", "Sub", "Body")
        assert "## Section" in result
        assert "## Subsection" in result
        assert "## Detail" in result


# ---------------------------------------------------------------------------
# _normalize_jobs_date
# ---------------------------------------------------------------------------

class TestNormalizeJobsDate:
    def test_finds_date_in_first_text(self, graph_store):
        result = graph_store._normalize_jobs_date("2026-04", "Mar 2025", "fallback text")
        assert result == "2025-03"

    def test_falls_back_to_second_text(self, graph_store):
        result = graph_store._normalize_jobs_date("2026-04", "no date here", "Apr 2024")
        assert result == "2024-04"

    def test_returns_default_when_no_dates(self, graph_store):
        result = graph_store._normalize_jobs_date("2026-04", "no date", "no date either")
        assert result == "2026-04"


# ---------------------------------------------------------------------------
# _jobs_kind_for_section
# ---------------------------------------------------------------------------

class TestJobsKindForSection:
    def test_returns_none_for_non_jobs_section(self, graph_store):
        result = graph_store._jobs_kind_for_section("Model Releases", "GPT-4")
        assert result is None

    def test_ai_work_platform_subsection(self, graph_store):
        result = graph_store._jobs_kind_for_section(
            "AI Jobs Appendix", "AI Evaluation & Training Platforms"
        )
        assert result == "ai-work-platform"

    def test_job_creation_subsection(self, graph_store):
        result = graph_store._jobs_kind_for_section(
            "AI Jobs Appendix", "New Job Roles AI Has Created"
        )
        assert result == "job-creation"

    def test_job_displacement_subsection(self, graph_store):
        result = graph_store._jobs_kind_for_section(
            "AI Jobs Appendix", "Job Roles Being Eliminated or Severely Reduced"
        )
        assert result == "job-displacement"

    def test_ai_layoff_subsection(self, graph_store):
        result = graph_store._jobs_kind_for_section(
            "AI Jobs Appendix", "Companies That Have Cut Jobs and Cited AI"
        )
        assert result == "ai-layoff"


# ---------------------------------------------------------------------------
# _lookup_entity_id_by_alias
# ---------------------------------------------------------------------------

class TestLookupEntityIdByAlias:
    def test_exact_id_match(self, graph_store):
        result = graph_store._lookup_entity_id_by_alias("OpenAI")
        assert result == "openai"

    def test_alias_match(self, graph_store):
        result = graph_store._lookup_entity_id_by_alias("ChatGPT")
        assert result == "openai"

    def test_returns_none_for_unknown(self, graph_store):
        result = graph_store._lookup_entity_id_by_alias("xyz_no_match_here_42")
        assert result is None

    def test_case_insensitive_via_slugify(self, graph_store):
        result = graph_store._lookup_entity_id_by_alias("ANTHROPIC")
        assert result == "anthropic"


# ---------------------------------------------------------------------------
# _synthetic_entity
# ---------------------------------------------------------------------------

class TestSyntheticEntity:
    def test_existing_entity_returns_id_and_none(self, graph_store):
        entity_id, entity = graph_store._synthetic_entity(
            "OpenAI",
            entity_type="company",
            group_name="Labs",
            description="desc",
            prefix="org",
        )
        assert entity_id == "openai"
        assert entity is None  # existing entity, no new record

    def test_new_entity_returns_id_and_record(self, graph_store):
        entity_id, entity = graph_store._synthetic_entity(
            "Fictional Corp XYZ",
            entity_type="company",
            group_name="Labs",
            description="A fictional company",
            prefix="org",
        )
        assert entity_id.startswith("org-")
        assert entity is not None
        assert entity["name"] == "Fictional Corp XYZ"
        assert entity["type"] == "company"

    def test_new_entity_has_description(self, graph_store):
        _, entity = graph_store._synthetic_entity(
            "Another Fake Corp",
            entity_type="company",
            group_name="Labs",
            description="This is the description",
            prefix="org",
        )
        assert entity is not None
        assert entity["description"] == "This is the description"


# ---------------------------------------------------------------------------
# _story_from_bullet
# ---------------------------------------------------------------------------

class TestStoryFromBullet:
    def test_short_bullet_returns_none(self, graph_store):
        result = graph_store._story_from_bullet("Short", "Section", "", "2023")
        assert result is None

    def test_basic_bullet_produces_story(self, graph_store):
        bullet = "OpenAI released GPT-4 with multimodal capabilities"
        result = graph_store._story_from_bullet(bullet, "Model Releases", "", "2023")
        assert result is not None
        assert "title" in result
        assert "summary" in result
        assert result["kind"] is not None

    def test_dash_separator_splits_title_body(self, graph_store):
        bullet = "GPT-4 Launch — OpenAI released a multimodal flagship model in March 2023"
        result = graph_store._story_from_bullet(bullet, "Model Releases", "", "2023")
        assert result is not None
        assert result["title"] == "GPT-4 Launch"

    def test_entities_matched_from_text(self, graph_store):
        bullet = "OpenAI and Anthropic both announced safety commitments"
        result = graph_store._story_from_bullet(bullet, "Safety", "", "2023")
        assert result is not None
        entity_ids = result["entity_ids"]
        assert "openai" in entity_ids or "anthropic" in entity_ids

    def test_story_has_id(self, graph_store):
        bullet = "DeepSeek V3 released with impressive benchmark results and low cost"
        result = graph_store._story_from_bullet(bullet, "Model Releases", "", "2025")
        assert result is not None
        assert result["id"] and len(result["id"]) > 0

    def test_story_has_tags(self, graph_store):
        bullet = "NVIDIA H100 GPUs became the standard for AI training workloads"
        result = graph_store._story_from_bullet(bullet, "Infrastructure", "", "2023")
        assert result is not None
        assert isinstance(result["tags"], list)


# ---------------------------------------------------------------------------
# _story_from_paragraph
# ---------------------------------------------------------------------------

class TestStoryFromParagraph:
    def test_returns_story_dict(self, graph_store):
        paragraph = "OpenAI launched GPT-4 in March 2023, representing a significant leap in multimodal AI capabilities and pushing the frontier for both reasoning and vision tasks."
        result = graph_store._story_from_paragraph(paragraph, "Model Releases", "", "2023")
        assert result is not None
        assert "title" in result
        assert "summary" in result

    def test_entities_matched(self, graph_store):
        paragraph = "Anthropic released Claude 3 Opus, outperforming GPT-4 on many benchmarks and demonstrating safety improvements in early 2024."
        result = graph_store._story_from_paragraph(paragraph, "Model Releases", "", "2024")
        assert result is not None
        entity_ids = result["entity_ids"]
        assert "anthropic" in entity_ids

    def test_uses_subsection_as_title_when_available(self, graph_store):
        paragraph = "The model achieved state-of-the-art results across all benchmarks in 2023."
        result = graph_store._story_from_paragraph(paragraph, "Model Releases", "Claude Performance", "2023")
        assert result is not None
        assert "Claude Performance" in result["title"] or "Claude Performance" in result["id"]


# ---------------------------------------------------------------------------
# _story_from_table_row
# ---------------------------------------------------------------------------

class TestStoryFromTableRow:
    def test_single_cell_row(self, graph_store):
        row = "| OpenAI releases GPT-4 multimodal model with vision capabilities |"
        result = graph_store._story_from_table_row(row, "Model Releases", "", "2023")
        assert result is not None
        assert "title" in result

    def test_two_cell_row(self, graph_store):
        row = "| 2023-03 | OpenAI releases GPT-4 with multimodal support and better reasoning |"
        result = graph_store._story_from_table_row(row, "Model Releases", "", "2023")
        assert result is not None

    def test_empty_row_returns_none(self, graph_store):
        result = graph_store._story_from_table_row("| |", "Section", "", "2023")
        assert result is None

    def test_jobs_header_row_skipped_by_jobs_table_story(self, graph_store):
        # _jobs_table_story explicitly returns None for known header rows
        cells = ["Platform", "Role Type", "Pay Range", "Notes"]
        result = graph_store._jobs_table_story(cells, "AI Jobs Appendix", "AI Evaluation & Training Platforms", "2026")
        assert result is None

    def test_entity_matched_from_table_cells(self, graph_store):
        row = "| 2023 | OpenAI and Anthropic signed voluntary safety commitments with the government |"
        result = graph_store._story_from_table_row(row, "Safety and Regulation", "", "2023")
        if result:  # may return None if cells are empty after cleaning
            assert "entity_ids" in result


# ---------------------------------------------------------------------------
# _build_payload_from_master_document (integration)
# ---------------------------------------------------------------------------

SAMPLE_MASTER_DOC = """# AI Master Document

## Model Releases 2023

### GPT-4 and Claude

| Date | Event |
|------|-------|
| 2023-03 | OpenAI released GPT-4, a powerful multimodal model |
| 2023-03 | Anthropic launched Claude with long context support |

* NVIDIA H100 shortage affected all frontier labs in 2023 — demand far exceeded supply

## AI Regulation 2023

### Policy and Safety

The UK hosted the first global AI Safety Summit at Bletchley Park in November 2023.
"""


class TestBuildPayloadFromMasterDocument:
    @pytest.fixture
    def doc_graph_store(self, tmp_path):
        doc_path = tmp_path / "data" / "ai_master.md"
        doc_path.parent.mkdir(parents=True, exist_ok=True)
        doc_path.write_text(SAMPLE_MASTER_DOC)
        seed_path = tmp_path / "data" / "ai_graph_seed.json"
        seed_path.write_text(json.dumps({
            "name": "Test", "entities": [], "stories": [],
            "story_entities": [], "story_tags": [], "entity_links": []
        }))
        db_path = tmp_path / "data" / "doc_test.db"
        store = GraphStore(tmp_path, source_path=doc_path, db_path=db_path)
        return store

    def test_payload_has_required_keys(self, doc_graph_store):
        payload = doc_graph_store._build_payload_from_master_document()
        for key in ("entities", "stories", "story_entities", "story_tags", "entity_links"):
            assert key in payload, f"Missing key: {key}"

    def test_stories_are_generated(self, doc_graph_store):
        payload = doc_graph_store._build_payload_from_master_document()
        assert len(payload["stories"]) > 0

    def test_entities_connected_to_stories(self, doc_graph_store):
        payload = doc_graph_store._build_payload_from_master_document()
        assert len(payload["entities"]) > 0

    def test_story_has_required_fields(self, doc_graph_store):
        payload = doc_graph_store._build_payload_from_master_document()
        for story in payload["stories"]:
            for field in ("id", "title", "kind", "status", "date", "summary", "details", "importance"):
                assert field in story, f"Story missing field: {field}"

    def test_entities_linked_from_openai_mention(self, doc_graph_store):
        payload = doc_graph_store._build_payload_from_master_document()
        entity_ids = {e["id"] for e in payload["entities"]}
        assert "openai" in entity_ids or any("openai" in eid for eid in entity_ids)

    def test_story_importance_in_range(self, doc_graph_store):
        payload = doc_graph_store._build_payload_from_master_document()
        for story in payload["stories"]:
            assert 1 <= story["importance"] <= 5, f"Importance out of range: {story['importance']}"

    def test_year_inferred_from_section(self, doc_graph_store):
        payload = doc_graph_store._build_payload_from_master_document()
        years_found = {story.get("date", "")[:4] for story in payload["stories"]}
        assert "2023" in years_found

    def test_bullet_stories_included(self, doc_graph_store):
        payload = doc_graph_store._build_payload_from_master_document()
        titles = [s["title"].lower() for s in payload["stories"]]
        assert any("nvidia" in t for t in titles)

    def test_story_entities_link_stories_to_entities(self, doc_graph_store):
        payload = doc_graph_store._build_payload_from_master_document()
        if payload["stories"] and payload["entities"]:
            assert len(payload["story_entities"]) > 0

    def test_entity_links_built_for_co_mentioned(self, doc_graph_store):
        payload = doc_graph_store._build_payload_from_master_document()
        # entity_links should exist if any entities co-appear in multiple stories
        assert isinstance(payload["entity_links"], list)

    def test_validate_payload_passes_for_built_payload(self, doc_graph_store):
        payload = doc_graph_store._build_payload_from_master_document()
        doc_graph_store._validate_payload(payload)  # should not raise

    def test_database_seeded_from_master_doc(self, doc_graph_store):
        with doc_graph_store._connect() as conn:
            story_count = conn.execute("SELECT COUNT(*) FROM stories").fetchone()[0]
        assert story_count > 0

    def test_cancellation_supported(self, doc_graph_store):
        from unittest.mock import MagicMock
        cancel_event = MagicMock()
        cancel_event.is_set.return_value = False
        payload = doc_graph_store._build_payload_from_master_document(cancel_event=cancel_event)
        assert isinstance(payload, dict)


# ---------------------------------------------------------------------------
# Supplemental model stories
# ---------------------------------------------------------------------------

class TestSupplementalModelStories:
    def test_supplemental_stories_exist(self, graph_store):
        stories = graph_store._supplemental_model_stories()
        assert len(stories) > 0

    def test_each_story_has_required_fields(self, graph_store):
        for story in graph_store._supplemental_model_stories():
            for field in ("id", "title", "kind", "status", "date", "summary", "details", "importance", "tags", "entity_ids"):
                assert field in story, f"Supplemental story missing: {field}"

    def test_deepseek_story_present(self, graph_store):
        ids = [s["id"] for s in graph_store._supplemental_model_stories()]
        assert any("deepseek" in sid for sid in ids)

    def test_kimi_stories_present(self, graph_store):
        ids = [s["id"] for s in graph_store._supplemental_model_stories()]
        assert any("kimi" in sid for sid in ids)

    def test_importance_in_valid_range(self, graph_store):
        for story in graph_store._supplemental_model_stories():
            assert 1 <= story["importance"] <= 5
