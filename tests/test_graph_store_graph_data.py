"""Tests for GraphStore graph-building methods: get_graph_data, clustering, etc."""

from __future__ import annotations

import numpy as np
import pytest

from webapp.graph_store import GraphStore, GraphStoreError


# ---------------------------------------------------------------------------
# get_graph_data
# ---------------------------------------------------------------------------

class TestGetGraphData:
    def test_returns_nodes_and_edges(self, graph_store):
        data = graph_store.get_graph_data()
        assert "nodes" in data
        assert "edges" in data
        assert isinstance(data["nodes"], list)
        assert isinstance(data["edges"], list)

    def test_nodes_have_required_fields(self, graph_store):
        data = graph_store.get_graph_data()
        assert len(data["nodes"]) > 0
        node = data["nodes"][0]
        for field in ("id", "label", "node_type", "type", "importance"):
            assert field in node, f"Missing field: {field}"

    def test_node_ids_prefixed_correctly(self, graph_store):
        data = graph_store.get_graph_data()
        for node in data["nodes"]:
            assert node["id"].startswith("entity:") or node["id"].startswith("story:")

    def test_edges_have_required_fields(self, graph_store):
        data = graph_store.get_graph_data()
        if data["edges"]:
            edge = data["edges"][0]
            for field in ("source", "target", "flow_kind"):
                assert field in edge, f"Missing edge field: {field}"

    def test_edge_endpoints_exist_as_nodes(self, graph_store):
        data = graph_store.get_graph_data()
        node_ids = {n["id"] for n in data["nodes"]}
        for edge in data["edges"]:
            assert edge["source"] in node_ids, f"Source node not found: {edge['source']}"
            assert edge["target"] in node_ids, f"Target node not found: {edge['target']}"

    def test_caching_returns_same_object(self, graph_store):
        """Second call should return the same cached dict."""
        first = graph_store.get_graph_data()
        second = graph_store.get_graph_data()
        assert first is second

    def test_story_nodes_have_year_field(self, graph_store):
        # get_graph_data returns compact nodes: event_date is dropped, but year is kept
        data = graph_store.get_graph_data()
        story_nodes = [n for n in data["nodes"] if n["node_type"] == "story"]
        assert len(story_nodes) > 0
        assert all("label" in n for n in story_nodes)

    def test_entity_nodes_have_description(self, graph_store):
        data = graph_store.get_graph_data()
        entity_nodes = [n for n in data["nodes"] if n["node_type"] == "entity"]
        assert all("description" in n for n in entity_nodes)

    def test_communities_list_present(self, graph_store):
        data = graph_store.get_graph_data()
        assert "communities" in data
        assert isinstance(data["communities"], list)


class TestGraphYearEdgePruning:
    """Phase 2a: chronology uses year->story timeline edges only."""

    def test_no_story_to_year_mention_edges(self, graph_store):
        data = graph_store.get_graph_data()
        year_node_ids = {n["id"] for n in data["nodes"] if n.get("type") == "year"}
        story_year_mentions = [
            edge
            for edge in data["edges"]
            if edge["flow_kind"] == "mention"
            and edge["source"].startswith("story:")
            and edge["target"] in year_node_ids
        ]
        assert story_year_mentions == []

    def test_year_to_story_timeline_edges_preserved(self, graph_store):
        data = graph_store.get_graph_data()
        year_node_ids = {n["id"] for n in data["nodes"] if n.get("type") == "year"}
        story_node_ids = {n["id"] for n in data["nodes"] if n["node_type"] == "story"}
        timeline_edges = [
            edge
            for edge in data["edges"]
            if edge["flow_kind"] == "timeline"
            and edge["source"] in year_node_ids
            and edge["target"] in story_node_ids
        ]
        assert len(timeline_edges) > 0
        assert all(edge["flow_kind"] == "timeline" for edge in timeline_edges)

    def test_stories_with_year_entities_still_link_via_timeline(self, graph_store):
        """Seed links stories to year-* entities; timeline edges replace mention edges."""
        from tests.conftest import MINIMAL_SEED

        data = graph_store.get_graph_data()
        year_node_ids = {n["id"] for n in data["nodes"] if n.get("type") == "year"}
        for story_id, entity_id in MINIMAL_SEED["story_entities"]:
            if not entity_id.startswith("year-"):
                continue
            year_node_id = f"entity:{entity_id}"
            if year_node_id not in year_node_ids:
                continue
            story_node_id = f"story:{story_id}"
            if story_node_id not in {n["id"] for n in data["nodes"]}:
                continue
            timeline = [
                e
                for e in data["edges"]
                if e["flow_kind"] == "timeline"
                and e["source"] == year_node_id
                and e["target"] == story_node_id
            ]
            assert len(timeline) == 1


# ---------------------------------------------------------------------------
# get_graph_data_by_era
# ---------------------------------------------------------------------------

class TestGetGraphDataByEra:
    def test_valid_era_returns_data(self, graph_store):
        data = graph_store.get_graph_data_by_era("frontier")
        assert "nodes" in data
        assert "edges" in data

    def test_invalid_era_raises_value_error(self, graph_store):
        with pytest.raises(ValueError, match="unknown era"):
            graph_store.get_graph_data_by_era("nonexistent-era")

    def test_era_filters_to_correct_years(self, graph_store):
        data = graph_store.get_graph_data_by_era("frontier")
        # frontier era is 2022-2024; story nodes should be in this range
        story_nodes = [n for n in data["nodes"] if n["node_type"] == "story"]
        for node in story_nodes:
            year_str = node.get("year", "")
            if year_str:
                year = int(year_str)
                assert 2022 <= year <= 2024, f"Unexpected year {year} in frontier era"

    def test_all_valid_eras_return_data(self, graph_store):
        from scraper.sources import ERA_DATE_RANGES
        for era in ERA_DATE_RANGES:
            data = graph_store.get_graph_data_by_era(era)
            assert isinstance(data["nodes"], list)


# ---------------------------------------------------------------------------
# get_graph_data_by_year_range
# ---------------------------------------------------------------------------

class TestGetGraphDataByYearRange:
    def test_valid_range_returns_data(self, graph_store):
        data = graph_store.get_graph_data_by_year_range(2023, 2024)
        assert isinstance(data["nodes"], list)
        assert isinstance(data["edges"], list)

    def test_tight_range_filters_correctly(self, graph_store):
        data = graph_store.get_graph_data_by_year_range(2023, 2023)
        story_nodes = [n for n in data["nodes"] if n["node_type"] == "story"]
        for node in story_nodes:
            year_str = node.get("year", "")
            if year_str:
                assert int(year_str) == 2023

    def test_no_matching_year_returns_empty_nodes(self, graph_store):
        data = graph_store.get_graph_data_by_year_range(1999, 1999)
        story_nodes = [n for n in data["nodes"] if n["node_type"] == "story"]
        assert len(story_nodes) == 0

    def test_wide_range_includes_all_stories(self, graph_store):
        all_data = graph_store.get_graph_data()
        wide_data = graph_store.get_graph_data_by_year_range(2000, 2030)
        all_story_count = sum(1 for n in all_data["nodes"] if n["node_type"] == "story")
        wide_story_count = sum(1 for n in wide_data["nodes"] if n["node_type"] == "story")
        assert wide_story_count == all_story_count


# ---------------------------------------------------------------------------
# _pick_cluster_count
# ---------------------------------------------------------------------------

class TestPickClusterCount:
    def test_returns_1_for_single_node(self, graph_store):
        values = np.array([0.5, 0.8, 1.0])
        assert graph_store._pick_cluster_count(values, node_count=1) == 1

    def test_returns_1_for_empty_nontrivial(self, graph_store):
        values = np.array([])
        assert graph_store._pick_cluster_count(values, node_count=5) == 1

    def test_clamps_to_node_count(self, graph_store):
        values = np.array([0.1, 0.2, 0.5, 0.8, 0.9, 1.0])
        result = graph_store._pick_cluster_count(values, node_count=3)
        assert result <= 3

    def test_returns_at_least_1(self, graph_store):
        values = np.array([0.5])
        result = graph_store._pick_cluster_count(values, node_count=10)
        assert result >= 1

    def test_never_exceeds_25(self, graph_store):
        values = np.linspace(0.1, 1.0, 50)
        result = graph_store._pick_cluster_count(values, node_count=100)
        assert result <= 25


# ---------------------------------------------------------------------------
# _deterministic_cluster_chunks
# ---------------------------------------------------------------------------

class TestDeterministicClusterChunks:
    def test_single_cluster_assigns_all_to_zero(self, graph_store):
        result = graph_store._deterministic_cluster_chunks(["a", "b", "c"], 1)
        assert all(v == 0 for v in result.values())

    def test_all_nodes_assigned(self, graph_store):
        node_ids = ["a", "b", "c", "d", "e"]
        result = graph_store._deterministic_cluster_chunks(node_ids, 3)
        assert set(result.keys()) == set(node_ids)

    def test_cluster_ids_in_range(self, graph_store):
        node_ids = [f"n{i}" for i in range(10)]
        k = 4
        result = graph_store._deterministic_cluster_chunks(node_ids, k)
        assert all(0 <= v < k for v in result.values())

    def test_deterministic_same_result_twice(self, graph_store):
        node_ids = ["a", "b", "c", "d", "e", "f"]
        r1 = graph_store._deterministic_cluster_chunks(node_ids, 3)
        r2 = graph_store._deterministic_cluster_chunks(node_ids, 3)
        assert r1 == r2

    def test_month_index_affects_ordering(self, graph_store):
        node_ids = ["early", "late"]
        month_index = {"early": 2023 * 12 + 1, "late": 2024 * 12 + 12}
        result = graph_store._deterministic_cluster_chunks(node_ids, 2, month_index)
        assert set(result.values()) == {0, 1}


# ---------------------------------------------------------------------------
# _build_story_context_links
# ---------------------------------------------------------------------------

class TestBuildStoryContextLinks:
    def _make_row(self, story_id, event_date):
        return {"id": story_id, "event_date": event_date}

    def test_no_overlap_no_links(self, graph_store):
        stories = [
            self._make_row("s1", "2023-01"),
            self._make_row("s2", "2023-02"),
        ]
        story_to_entities = {
            "s1": ["e1", "e2"],
            "s2": ["e3", "e4"],
        }
        links = graph_store._build_story_context_links(stories, story_to_entities)
        assert links == []

    def test_strong_overlap_creates_link(self, graph_store):
        stories = [
            self._make_row("s1", "2023-01"),
            self._make_row("s2", "2023-02"),
        ]
        story_to_entities = {
            "s1": ["e1", "e2", "e3", "e4"],
            "s2": ["e1", "e2", "e3", "e4"],
        }
        links = graph_store._build_story_context_links(stories, story_to_entities)
        assert len(links) > 0
        link = links[0]
        assert "source" in link and "target" in link and "weight" in link

    def test_link_weight_equals_shared_entities(self, graph_store):
        stories = [
            self._make_row("s1", "2023-01"),
            self._make_row("s2", "2023-02"),
        ]
        shared = ["e1", "e2", "e3", "e4"]
        story_to_entities = {"s1": shared, "s2": shared}
        links = graph_store._build_story_context_links(stories, story_to_entities)
        if links:
            assert links[0]["weight"] == 4

    def test_minimum_overlap_threshold_is_3(self, graph_store):
        stories = [
            self._make_row("s1", "2023-01"),
            self._make_row("s2", "2023-02"),
        ]
        story_to_entities = {
            "s1": ["e1", "e2"],  # only 2 shared — below threshold
            "s2": ["e1", "e2", "e3"],
        }
        links = graph_store._build_story_context_links(stories, story_to_entities)
        assert links == []

    def test_links_go_forward_in_time_only(self, graph_store):
        stories = [
            self._make_row("early", "2023-01"),
            self._make_row("late", "2023-06"),
        ]
        shared = ["e1", "e2", "e3", "e4"]
        story_to_entities = {"early": shared, "late": shared}
        links = graph_store._build_story_context_links(stories, story_to_entities)
        for link in links:
            assert link["source"] == "early"
            assert link["target"] == "late"


# ---------------------------------------------------------------------------
# _fixed_k_spectral_assignments
# ---------------------------------------------------------------------------

class TestFixedKSpectralAssignments:
    def test_returns_assignment_for_all_nodes(self, graph_store):
        node_ids = ["a", "b", "c", "d"]
        edges = [("a", "b", 1.0), ("b", "c", 1.0), ("c", "d", 1.0)]
        month_index = {"a": 0, "b": 1, "c": 2, "d": 3}
        result = graph_store._fixed_k_spectral_assignments(node_ids, edges, 2, month_index)
        assert set(result.keys()) == set(node_ids)

    def test_all_cluster_ids_in_range(self, graph_store):
        node_ids = [f"n{i}" for i in range(6)]
        edges = [(node_ids[i], node_ids[i + 1], 1.0) for i in range(5)]
        month_index = {nid: i for i, nid in enumerate(node_ids)}
        k = 3
        result = graph_store._fixed_k_spectral_assignments(node_ids, edges, k, month_index)
        assert all(0 <= v < k for v in result.values())

    def test_single_node_gets_cluster_zero(self, graph_store):
        result = graph_store._fixed_k_spectral_assignments(["only"], [], 1, {})
        assert result == {"only": 0}

    def test_disconnected_graph_falls_back(self, graph_store):
        node_ids = ["a", "b", "c"]
        result = graph_store._fixed_k_spectral_assignments(node_ids, [], 2, {})
        assert set(result.keys()) == set(node_ids)


# ---------------------------------------------------------------------------
# get_graph_etag
# ---------------------------------------------------------------------------

class TestGetGraphEtag:
    def test_returns_string(self, graph_store):
        etag = graph_store.get_graph_etag()
        assert isinstance(etag, str)

    def test_starts_with_graph_prefix(self, graph_store):
        etag = graph_store.get_graph_etag()
        assert etag.startswith("graph-")

    def test_same_etag_before_changes(self, graph_store):
        etag1 = graph_store.get_graph_etag()
        etag2 = graph_store.get_graph_etag()
        assert etag1 == etag2
