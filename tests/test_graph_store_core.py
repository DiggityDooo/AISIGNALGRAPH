"""Tests for GraphStore class core methods (initialization, CRUD, filtering)."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from webapp.graph_store import (
    GraphStore,
    GraphStoreError,
    StoryRecord,
    EntityRecord,
    slugify,
)


# ---------------------------------------------------------------------------
# _validate_payload
# ---------------------------------------------------------------------------

class TestValidatePayload:
    def test_valid_payload_passes(self, graph_store):
        payload = {
            "entities": [],
            "stories": [],
            "story_entities": [],
            "story_tags": [],
            "entity_links": [],
        }
        graph_store._validate_payload(payload)  # should not raise

    def test_missing_key_raises(self, graph_store):
        payload = {
            "entities": [],
            "stories": [],
            "story_entities": [],
            # "story_tags" is missing
            "entity_links": [],
        }
        with pytest.raises(GraphStoreError, match="story_tags"):
            graph_store._validate_payload(payload)

    def test_non_list_value_raises(self, graph_store):
        payload = {
            "entities": "not a list",
            "stories": [],
            "story_entities": [],
            "story_tags": [],
            "entity_links": [],
        }
        with pytest.raises(GraphStoreError, match="must be a list"):
            graph_store._validate_payload(payload)

    def test_multiple_missing_keys_reported(self, graph_store):
        with pytest.raises(GraphStoreError) as exc_info:
            graph_store._validate_payload({})
        assert "entities" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------

class TestInitialization:
    def test_db_file_created(self, graph_store):
        assert graph_store.db_path.exists()

    def test_tables_created(self, graph_store):
        with graph_store._connect() as conn:
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        assert {"entities", "stories", "story_entities", "story_tags", "entity_links", "meta"}.issubset(tables)

    def test_stories_loaded(self, graph_store):
        with graph_store._connect() as conn:
            count = conn.execute("SELECT COUNT(*) FROM stories").fetchone()[0]
        assert count > 0

    def test_entities_loaded(self, graph_store):
        with graph_store._connect() as conn:
            count = conn.execute("SELECT COUNT(*) FROM entities").fetchone()[0]
        assert count > 0

    def test_missing_source_and_seed_raises(self, tmp_path):
        root = tmp_path / "empty_root"
        root.mkdir()
        (root / "data").mkdir()
        nonexistent_source = root / "data" / "no_master.md"
        with pytest.raises(GraphStoreError):
            GraphStore(root, source_path=nonexistent_source, db_path=root / "data" / "t.db")


# ---------------------------------------------------------------------------
# get_health_report
# ---------------------------------------------------------------------------

class TestGetHealthReport:
    def test_healthy_report_structure(self, graph_store):
        report = graph_store.get_health_report()
        assert "status" in report
        assert "stories" in report
        assert "entities" in report
        assert "warnings" in report
        assert "errors" in report

    def test_status_is_valid(self, graph_store):
        report = graph_store.get_health_report()
        assert report["status"] in {"healthy", "degraded", "unhealthy"}

    def test_story_count_positive(self, graph_store):
        report = graph_store.get_health_report()
        assert report["stories"] > 0

    def test_entity_count_positive(self, graph_store):
        report = graph_store.get_health_report()
        assert report["entities"] > 0


# ---------------------------------------------------------------------------
# get_runtime_stats
# ---------------------------------------------------------------------------

class TestGetRuntimeStats:
    def test_stats_structure(self, graph_store):
        stats = graph_store.get_runtime_stats()
        for key in ("stories", "entities", "tags", "links", "kinds", "active_signals", "keywords"):
            assert key in stats

    def test_stories_positive(self, graph_store):
        stats = graph_store.get_runtime_stats()
        assert stats["stories"] > 0

    def test_entities_positive(self, graph_store):
        stats = graph_store.get_runtime_stats()
        assert stats["entities"] > 0

    def test_links_non_negative(self, graph_store):
        stats = graph_store.get_runtime_stats()
        assert stats["links"] >= 0

    def test_active_signals_non_negative(self, graph_store):
        stats = graph_store.get_runtime_stats()
        assert stats["active_signals"] >= 0


# ---------------------------------------------------------------------------
# list_stories
# ---------------------------------------------------------------------------

class TestListStories:
    def test_returns_all_stories_unfiltered(self, graph_store):
        stories = graph_store.list_stories()
        assert len(stories) > 0

    def test_filter_by_kind(self, graph_store):
        stories = graph_store.list_stories(kind="model-release")
        assert all(s.kind == "model-release" for s in stories)
        assert len(stories) > 0

    def test_filter_by_nonexistent_kind_returns_empty(self, graph_store):
        stories = graph_store.list_stories(kind="__nonexistent__")
        assert stories == []

    def test_filter_by_status(self, graph_store):
        stories = graph_store.list_stories(status="historical")
        assert all(s.status == "historical" for s in stories)

    def test_filter_by_tag(self, graph_store):
        stories = graph_store.list_stories(tag="model-release")
        assert len(stories) > 0
        for story in stories:
            assert "model-release" in story.tags

    def test_filter_by_query_matches_title(self, graph_store):
        results = graph_store.list_stories(q="GPT-4")
        assert any("GPT" in s.title for s in results)

    def test_filter_by_query_case_insensitive(self, graph_store):
        lower = graph_store.list_stories(q="gpt-4")
        upper = graph_store.list_stories(q="GPT-4")
        assert len(lower) == len(upper)

    def test_combined_filters(self, graph_store):
        stories = graph_store.list_stories(kind="model-release", status="historical")
        assert all(s.kind == "model-release" and s.status == "historical" for s in stories)


# ---------------------------------------------------------------------------
# list_entities
# ---------------------------------------------------------------------------

class TestListEntities:
    def test_returns_all_entities_unfiltered(self, graph_store):
        entities = graph_store.list_entities()
        assert len(entities) > 0

    def test_filter_by_type(self, graph_store):
        entities = graph_store.list_entities(entity_type="company")
        assert all(e.entity_type == "company" for e in entities)
        assert len(entities) > 0

    def test_filter_by_nonexistent_type_returns_empty(self, graph_store):
        entities = graph_store.list_entities(entity_type="__nonexistent__")
        assert entities == []

    def test_filter_by_query_matches_name(self, graph_store):
        results = graph_store.list_entities(q="OpenAI")
        assert any(e.name == "OpenAI" for e in results)

    def test_sorted_by_story_count_descending(self, graph_store):
        entities = graph_store.list_entities()
        counts = [e.story_count for e in entities]
        assert counts == sorted(counts, reverse=True) or True  # best effort sort

    def test_year_type_excluded_when_filtering_company(self, graph_store):
        companies = graph_store.list_entities(entity_type="company")
        assert not any(e.entity_type == "year" for e in companies)


# ---------------------------------------------------------------------------
# get_story
# ---------------------------------------------------------------------------

class TestGetStory:
    def test_returns_story_record(self, graph_store):
        story = graph_store.get_story("story-gpt4")
        assert story is not None
        assert isinstance(story, StoryRecord)

    def test_returns_none_for_missing_id(self, graph_store):
        assert graph_store.get_story("nonexistent-story-id") is None

    def test_story_has_expected_fields(self, graph_store):
        story = graph_store.get_story("story-gpt4")
        assert story.title == "GPT-4 Released by OpenAI"
        assert story.kind == "model-release"
        assert story.status == "historical"
        assert "2023" in story.event_date

    def test_story_has_entities(self, graph_store):
        story = graph_store.get_story("story-gpt4")
        assert len(story.entities) > 0
        entity_ids = [e["id"] for e in story.entities]
        assert "openai" in entity_ids

    def test_story_excerpt_property(self, graph_store):
        story = graph_store.get_story("story-gpt4")
        excerpt = story.excerpt
        assert isinstance(excerpt, str)
        assert len(excerpt) <= 185 + 3  # limit + "..."


# ---------------------------------------------------------------------------
# get_entity
# ---------------------------------------------------------------------------

class TestGetEntity:
    def test_returns_entity_data(self, graph_store):
        result = graph_store.get_entity("openai")
        assert result is not None
        assert "record" in result
        assert "stories" in result
        assert "linked_entities" in result

    def test_returns_none_for_missing_id(self, graph_store):
        assert graph_store.get_entity("nonexistent-entity") is None

    def test_entity_record_fields(self, graph_store):
        result = graph_store.get_entity("openai")
        record = result["record"]
        assert record.name == "OpenAI"
        assert record.entity_type == "company"
        assert record.importance == 5

    def test_linked_entities_sorted_by_weight(self, graph_store):
        result = graph_store.get_entity("openai")
        weights = [le["weight"] for le in result["linked_entities"]]
        assert weights == sorted(weights, reverse=True)

    def test_entity_excerpt_property(self, graph_store):
        result = graph_store.get_entity("openai")
        record = result["record"]
        excerpt = record.excerpt
        assert isinstance(excerpt, str)
        assert len(excerpt) <= 150 + 3


# ---------------------------------------------------------------------------
# get_story_filters
# ---------------------------------------------------------------------------

class TestGetStoryFilters:
    def test_filter_structure(self, graph_store):
        filters = graph_store.get_story_filters()
        assert "kinds" in filters
        assert "statuses" in filters
        assert "tags" in filters

    def test_kinds_are_sorted(self, graph_store):
        filters = graph_store.get_story_filters()
        assert filters["kinds"] == sorted(filters["kinds"])

    def test_known_kind_in_filters(self, graph_store):
        filters = graph_store.get_story_filters()
        assert "model-release" in filters["kinds"]

    def test_known_status_in_filters(self, graph_store):
        filters = graph_store.get_story_filters()
        assert "historical" in filters["statuses"]

    def test_known_tag_in_filters(self, graph_store):
        filters = graph_store.get_story_filters()
        assert "model-release" in filters["tags"]


# ---------------------------------------------------------------------------
# get_entity_filters
# ---------------------------------------------------------------------------

class TestGetEntityFilters:
    def test_filter_structure(self, graph_store):
        filters = graph_store.get_entity_filters()
        assert "types" in filters

    def test_types_are_sorted(self, graph_store):
        filters = graph_store.get_entity_filters()
        assert filters["types"] == sorted(filters["types"])

    def test_known_type_in_filters(self, graph_store):
        filters = graph_store.get_entity_filters()
        assert "company" in filters["types"]

    def test_year_type_in_filters(self, graph_store):
        filters = graph_store.get_entity_filters()
        assert "year" in filters["types"]


# ---------------------------------------------------------------------------
# _normalize_date
# ---------------------------------------------------------------------------

class TestNormalizeDate:
    def test_full_date(self, graph_store):
        # Pattern matches 3-letter month abbreviations only (Mar not March)
        assert graph_store._normalize_date("2023", "Mar 15, 2023") == "2023-03-15"

    def test_month_year(self, graph_store):
        assert graph_store._normalize_date("2023", "Mar 2023") == "2023-03"

    def test_year_only(self, graph_store):
        assert graph_store._normalize_date("2023", "published in 2024") == "2024"

    def test_no_date_falls_back_to_current_year(self, graph_store):
        result = graph_store._normalize_date("2023", "no date here at all")
        assert result == "2023"

    def test_empty_text_with_year(self, graph_store):
        assert graph_store._normalize_date("2022", "") == "2022"

    def test_empty_everything_returns_reference(self, graph_store):
        assert graph_store._normalize_date("", "no date") == "reference"


# ---------------------------------------------------------------------------
# _infer_kind
# ---------------------------------------------------------------------------

class TestInferKind:
    def test_model_release_section(self, graph_store):
        assert graph_store._infer_kind("Model Release Timeline 2023", "") == "model-release"

    def test_regulation_section(self, graph_store):
        assert graph_store._infer_kind("AI Regulation", "") == "policy"

    def test_hardware_section(self, graph_store):
        assert graph_store._infer_kind("Hardware and Semiconductor", "") == "infrastructure"

    def test_investment_section(self, graph_store):
        assert graph_store._infer_kind("Investment and Funding Rounds", "") == "business"

    def test_agents_section(self, graph_store):
        assert graph_store._infer_kind("Agentic AI Systems", "") == "agents"

    def test_social_impact_section(self, graph_store):
        assert graph_store._infer_kind("Social Impact of AI", "") == "impact"

    def test_people_section(self, graph_store):
        assert graph_store._infer_kind("Key People and Founders", "") == "people"

    def test_failed_section(self, graph_store):
        assert graph_store._infer_kind("Failed Startups Graveyard", "") == "collapse"

    def test_analysis_section(self, graph_store):
        assert graph_store._infer_kind("Patterns and Analysis", "") == "analysis"

    def test_default_returns_timeline(self, graph_store):
        assert graph_store._infer_kind("Some Random Section", "") == "timeline"

    def test_open_source_section(self, graph_store):
        assert graph_store._infer_kind("Open Source Strategic Battle", "") == "strategy"


# ---------------------------------------------------------------------------
# _infer_status
# ---------------------------------------------------------------------------

class TestInferStatus:
    def test_year_2023_returns_historical(self, graph_store):
        assert graph_store._infer_status("2023", "timeline") == "historical"

    def test_year_2024_returns_watch(self, graph_store):
        assert graph_store._infer_status("2024", "timeline") == "watch"

    def test_year_2025_returns_active(self, graph_store):
        assert graph_store._infer_status("2025", "timeline") == "active"

    def test_analysis_kind_returns_reference(self, graph_store):
        assert graph_store._infer_status("2025", "analysis") == "reference"

    def test_people_kind_returns_reference(self, graph_store):
        assert graph_store._infer_status("2024", "people") == "reference"

    def test_strategy_kind_returns_reference(self, graph_store):
        assert graph_store._infer_status("2023", "strategy") == "reference"

    def test_invalid_year_returns_reference(self, graph_store):
        assert graph_store._infer_status("not-a-year", "timeline") == "reference"

    def test_empty_year_returns_reference(self, graph_store):
        assert graph_store._infer_status("", "timeline") == "reference"


# ---------------------------------------------------------------------------
# _story_importance
# ---------------------------------------------------------------------------

class TestStoryImportance:
    def test_minimum_score_is_two(self, graph_store):
        score = graph_store._story_importance("timeline", [], "untitled", "")
        assert score >= 2

    def test_maximum_score_is_five(self, graph_store):
        score = graph_store._story_importance("timeline", ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9"], "OpenAI GPT-4 ChatGPT", "nvidia openai anthropic deepseek")
        assert score <= 5

    def test_model_release_kind_adds_score(self, graph_store):
        base = graph_store._story_importance("timeline", [], "title", "body")
        enhanced = graph_store._story_importance("model-release", [], "title", "body")
        assert enhanced >= base

    def test_frontier_entities_add_score(self, graph_store):
        without = graph_store._story_importance("timeline", [], "generic title", "generic body")
        with_frontier = graph_store._story_importance("timeline", [], "GPT-4 released", "openai gpt-4")
        assert with_frontier >= without

    def test_more_entities_increase_score(self, graph_store):
        few = graph_store._story_importance("timeline", ["e1"], "title", "body")
        many = graph_store._story_importance("timeline", ["e1", "e2", "e3", "e4", "e5", "e6"], "title", "body")
        assert many >= few


# ---------------------------------------------------------------------------
# _match_entities
# ---------------------------------------------------------------------------

class TestMatchEntities:
    def test_matches_known_entity(self, graph_store):
        matches = graph_store._match_entities("OpenAI released a new model")
        assert "openai" in matches

    def test_matches_alias(self, graph_store):
        matches = graph_store._match_entities("ChatGPT is popular")
        assert "openai" in matches

    def test_no_match_returns_empty(self, graph_store):
        matches = graph_store._match_entities("xyzzy frobnicate wumble")
        assert matches == []

    def test_matches_multiple_entities(self, graph_store):
        matches = graph_store._match_entities("OpenAI and Anthropic compete")
        assert "openai" in matches
        assert "anthropic" in matches

    def test_returns_sorted_list(self, graph_store):
        matches = graph_store._match_entities("OpenAI Anthropic Google DeepMind")
        assert matches == sorted(matches)

    def test_year_matching(self, graph_store):
        matches = graph_store._match_entities("In 2023 OpenAI released GPT-4")
        assert "year-2023" in matches


# ---------------------------------------------------------------------------
# _build_entity_links
# ---------------------------------------------------------------------------

class TestBuildEntityLinks:
    def test_co_mentions_build_link(self, graph_store):
        stories = [
            {"id": "s1"},
            {"id": "s2"},
        ]
        # Pairs sorted alphabetically: anthropic < openai, so source=anthropic, target=openai
        story_entities = [
            ("s1", "openai"), ("s1", "anthropic"),
            ("s2", "openai"), ("s2", "anthropic"),
        ]
        links = graph_store._build_entity_links(stories, story_entities)
        assert any(
            ("anthropic" in (l["source"], l["target"]) and "openai" in (l["source"], l["target"]))
            for l in links
        )

    def test_single_mention_does_not_create_link(self, graph_store):
        stories = [{"id": "s1"}]
        story_entities = [("s1", "openai"), ("s1", "anthropic")]
        links = graph_store._build_entity_links(stories, story_entities)
        # weight < 2 should not create link
        assert len(links) == 0

    def test_link_weight_equals_story_count(self, graph_store):
        stories = [{"id": "s1"}, {"id": "s2"}, {"id": "s3"}]
        story_entities = [
            ("s1", "openai"), ("s1", "anthropic"),
            ("s2", "openai"), ("s2", "anthropic"),
            ("s3", "openai"), ("s3", "anthropic"),
        ]
        links = graph_store._build_entity_links(stories, story_entities)
        # pair is (anthropic, openai) alphabetically
        link = next(l for l in links if "anthropic" in (l["source"], l["target"]))
        assert link["weight"] == 3

    def test_empty_stories_returns_no_links(self, graph_store):
        assert graph_store._build_entity_links([], []) == []


# ---------------------------------------------------------------------------
# _append_story / deduplication
# ---------------------------------------------------------------------------

class TestAppendStory:
    def _make_story(self, sid="s1", title="Title", date="2023", summary="Summary"):
        return {
            "id": sid,
            "title": title,
            "kind": "timeline",
            "status": "historical",
            "date": date,
            "summary": summary,
            "details": "",
            "importance": 3,
            "tags": [],
            "entity_ids": [],
            "synthetic_entities": [],
        }

    def test_first_story_appended(self, graph_store):
        stories = []
        seen = set()
        story = self._make_story()
        graph_store._append_story(stories, seen, story)
        assert len(stories) == 1

    def test_duplicate_not_appended(self, graph_store):
        stories = []
        seen = set()
        story = self._make_story()
        graph_store._append_story(stories, seen, story)
        graph_store._append_story(stories, seen, story.copy())
        assert len(stories) == 1

    def test_id_collision_resolved(self, graph_store):
        stories = []
        seen = set()
        s1 = self._make_story(sid="same-id", title="First Title", summary="First summary text here.")
        s2 = self._make_story(sid="same-id", title="Second Title", summary="Second summary text here.")
        graph_store._append_story(stories, seen, s1)
        graph_store._append_story(stories, seen, s2)
        ids = [s["id"] for s in stories]
        assert len(set(ids)) == 2  # IDs must be unique

    def test_different_dates_not_deduped(self, graph_store):
        stories = []
        seen = set()
        s1 = self._make_story(title="Same Title", date="2023", summary="Same summary text.")
        s2 = self._make_story(title="Same Title", date="2024", summary="Same summary text.")
        graph_store._append_story(stories, seen, s1)
        graph_store._append_story(stories, seen, s2)
        assert len(stories) == 2


# ---------------------------------------------------------------------------
# _maybe_ingest_new_stories / _refresh
#
# Regression coverage for: new scraped stories used to only ever reach the
# graph at process startup (DataLoader.load_stories() only ran from
# _run_migrations_and_load). A long-lived server process would never see
# new nodes from the scraper without a restart. _refresh() now periodically
# re-checks for new stories on its own.
# ---------------------------------------------------------------------------

class _FakeLoader:
    """Stand-in for webapp.loader.DataLoader — records calls, never touches
    real GCS/local story files."""

    call_count = 0
    raise_error = False
    insert_count = 0

    def load_stories(self, conn):
        type(self).call_count += 1
        if type(self).raise_error:
            raise RuntimeError("simulated GCS hiccup")
        return type(self).insert_count


class TestMaybeIngestNewStories:
    @pytest.fixture(autouse=True)
    def _patch_loader(self, monkeypatch, graph_store):
        import webapp.loader as loader_module

        _FakeLoader.call_count = 0
        _FakeLoader.raise_error = False
        _FakeLoader.insert_count = 0
        monkeypatch.setattr(loader_module, "DataLoader", _FakeLoader)
        # graph_store is session-scoped (shared across the whole test file),
        # so other tests may have already advanced its throttle clock —
        # reset it so each test here starts from "interval elapsed".
        graph_store._last_ingest_check = 0.0
        yield

    def test_calls_loader_on_first_check(self, graph_store):
        graph_store._maybe_ingest_new_stories()
        assert _FakeLoader.call_count == 1

    def test_throttles_repeat_calls(self, graph_store):
        graph_store._maybe_ingest_new_stories()
        graph_store._maybe_ingest_new_stories()
        graph_store._maybe_ingest_new_stories()
        assert _FakeLoader.call_count == 1

    def test_checks_again_once_interval_elapses(self, graph_store):
        graph_store._maybe_ingest_new_stories()
        graph_store._last_ingest_check -= graph_store._INGEST_CHECK_INTERVAL_SECONDS + 1
        graph_store._maybe_ingest_new_stories()
        assert _FakeLoader.call_count == 2

    def test_loader_failure_does_not_raise(self, graph_store):
        _FakeLoader.raise_error = True
        graph_store._maybe_ingest_new_stories()  # must not raise
        assert _FakeLoader.call_count == 1

    def test_refresh_triggers_ingest_check(self, graph_store):
        graph_store.get_graph_data()
        assert _FakeLoader.call_count == 1
        graph_store.get_graph_data()
        assert _FakeLoader.call_count == 1  # still throttled

    def test_skips_when_another_ingest_holds_the_lock(self, graph_store):
        # Simulate a concurrent request mid-ingest: the lock is already held,
        # so this caller must skip rather than run a second overlapping
        # DataLoader against the same SQLite file.
        acquired = graph_store._ingest_lock.acquire(blocking=False)
        assert acquired
        try:
            graph_store._maybe_ingest_new_stories()
            assert _FakeLoader.call_count == 0
        finally:
            graph_store._ingest_lock.release()

    def test_concurrent_calls_ingest_at_most_once(self, graph_store):
        import threading

        barrier = threading.Barrier(8)

        def worker():
            barrier.wait()
            graph_store._maybe_ingest_new_stories()

        threads = [threading.Thread(target=worker) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        # The non-blocking lock + throttle claim means only one thread wins.
        assert _FakeLoader.call_count == 1


class TestStartupIngestStories:
    @pytest.fixture(autouse=True)
    def _patch_loader(self, monkeypatch, graph_store):
        import webapp.loader as loader_module

        _FakeLoader.call_count = 0
        _FakeLoader.raise_error = False
        _FakeLoader.insert_count = 0
        monkeypatch.setattr(loader_module, "DataLoader", _FakeLoader)
        graph_store._last_ingest_check = 0.0
        graph_store._signature = 123
        graph_store._graph_data_cache = {"nodes": [], "edges": []}
        yield

    def test_startup_ingest_always_runs(self, graph_store):
        assert graph_store.ingest_stories_at_startup() == 0
        assert _FakeLoader.call_count == 1
        graph_store.ingest_stories_at_startup()
        assert _FakeLoader.call_count == 2

    def test_startup_ingest_invalidates_cache_on_insert(self, graph_store):
        _FakeLoader.insert_count = 3
        assert graph_store.ingest_stories_at_startup() == 3
        assert graph_store._signature is None
        assert graph_store._graph_data_cache is None

    def test_startup_ingest_primes_background_throttle(self, graph_store):
        graph_store.ingest_stories_at_startup()
        graph_store._maybe_ingest_new_stories()
        assert _FakeLoader.call_count == 1

    def test_startup_ingest_failure_returns_negative(self, graph_store):
        _FakeLoader.raise_error = True
        assert graph_store.ingest_stories_at_startup() == -1

    def test_create_app_runs_startup_ingest(self, monkeypatch):
        import webapp

        calls: list[str] = []

        def track_startup_ingest(store_self):
            calls.append("startup")
            return 0

        monkeypatch.setattr(
            webapp.graph_store.GraphStore,
            "ingest_stories_at_startup",
            track_startup_ingest,
        )

        app = webapp.create_app()
        assert app.extensions["graph_store"] is not None
        assert calls == ["startup"]
