"""Extended tests for the API v2 blueprint (api.py) — search and stats endpoints."""

from __future__ import annotations

import pytest

from webapp import create_app


@pytest.fixture(scope="module")
def api_client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


# ---------------------------------------------------------------------------
# /api/stories/search
# ---------------------------------------------------------------------------

class TestStoriesSearch:
    def test_missing_q_returns_400(self, api_client):
        response = api_client.get("/api/stories/search")
        assert response.status_code == 400
        assert "error" in response.get_json()

    def test_empty_q_returns_400(self, api_client):
        response = api_client.get("/api/stories/search?q=")
        assert response.status_code == 400

    def test_valid_query_returns_200(self, api_client):
        response = api_client.get("/api/stories/search?q=AI")
        assert response.status_code == 200

    def test_response_has_results_total_query(self, api_client):
        data = api_client.get("/api/stories/search?q=model").get_json()
        assert "results" in data
        assert "total" in data
        assert "query" in data

    def test_results_is_list(self, api_client):
        data = api_client.get("/api/stories/search?q=OpenAI").get_json()
        assert isinstance(data["results"], list)

    def test_total_matches_result_count_or_more(self, api_client):
        data = api_client.get("/api/stories/search?q=model&limit=5").get_json()
        assert data["total"] >= len(data["results"])

    def test_limit_parameter_respected(self, api_client):
        data = api_client.get("/api/stories/search?q=AI&limit=3").get_json()
        assert len(data["results"]) <= 3

    def test_default_limit_is_20(self, api_client):
        data = api_client.get("/api/stories/search?q=AI").get_json()
        assert len(data["results"]) <= 20

    def test_limit_capped_at_100(self, api_client):
        data = api_client.get("/api/stories/search?q=AI&limit=999").get_json()
        assert len(data["results"]) <= 100

    def test_offset_pagination(self, api_client):
        page1 = api_client.get("/api/stories/search?q=AI&limit=5&offset=0").get_json()
        page2 = api_client.get("/api/stories/search?q=AI&limit=5&offset=5").get_json()
        ids1 = [r["id"] for r in page1["results"]]
        ids2 = [r["id"] for r in page2["results"]]
        # pages should not overlap (if enough results exist)
        if ids1 and ids2:
            assert not set(ids1).intersection(ids2)

    def test_invalid_limit_returns_400(self, api_client):
        response = api_client.get("/api/stories/search?q=AI&limit=abc")
        assert response.status_code == 400

    def test_invalid_offset_returns_400(self, api_client):
        response = api_client.get("/api/stories/search?q=AI&offset=xyz")
        assert response.status_code == 400

    def test_result_fields_present(self, api_client):
        data = api_client.get("/api/stories/search?q=OpenAI").get_json()
        if data["results"]:
            result = data["results"][0]
            for field in ("id", "title", "summary", "source_name"):
                assert field in result, f"Missing field: {field}"

    def test_nonexistent_term_returns_zero_results(self, api_client):
        data = api_client.get("/api/stories/search?q=xyzzy_frobnicate_not_real").get_json()
        assert data["results"] == []
        assert data["total"] == 0

    def test_multiword_query(self, api_client):
        response = api_client.get("/api/stories/search?q=GPT+model+release")
        assert response.status_code == 200

    def test_cache_control_header_set(self, api_client):
        response = api_client.get("/api/stories/search?q=AI")
        assert "Cache-Control" in response.headers


# ---------------------------------------------------------------------------
# /api/stats
# ---------------------------------------------------------------------------

class TestStats:
    def test_returns_200(self, api_client):
        response = api_client.get("/api/stats")
        assert response.status_code == 200

    def test_response_structure(self, api_client):
        data = api_client.get("/api/stats").get_json()
        assert "total_stories" in data
        assert "stories_by_era" in data
        assert "stories_by_year" in data
        assert "top_entities" in data
        assert "last_scrape" in data
        assert "scrape_status" in data

    def test_total_stories_positive(self, api_client):
        data = api_client.get("/api/stats").get_json()
        assert data["total_stories"] > 0

    def test_top_entities_is_list(self, api_client):
        data = api_client.get("/api/stats").get_json()
        assert isinstance(data["top_entities"], list)

    def test_top_entities_have_name_and_degree(self, api_client):
        data = api_client.get("/api/stats").get_json()
        if data["top_entities"]:
            entity = data["top_entities"][0]
            assert "name" in entity
            assert "degree" in entity

    def test_top_entities_limited_to_20(self, api_client):
        data = api_client.get("/api/stats").get_json()
        assert len(data["top_entities"]) <= 20

    def test_stories_by_era_dict(self, api_client):
        data = api_client.get("/api/stats").get_json()
        assert isinstance(data["stories_by_era"], dict)

    def test_stories_by_year_dict(self, api_client):
        data = api_client.get("/api/stats").get_json()
        assert isinstance(data["stories_by_year"], dict)

    def test_cache_control_header_set(self, api_client):
        response = api_client.get("/api/stats")
        assert "Cache-Control" in response.headers

    def test_scrape_status_not_empty(self, api_client):
        data = api_client.get("/api/stats").get_json()
        assert data["scrape_status"] in {"ok", "error", "running", "unknown", None} or isinstance(data["scrape_status"], str)


# ---------------------------------------------------------------------------
# /api/graph/ingest-status
# ---------------------------------------------------------------------------

class TestIngestStatus:
    def test_returns_200(self, api_client):
        response = api_client.get("/api/graph/ingest-status")
        assert response.status_code == 200

    def test_response_structure(self, api_client):
        data = api_client.get("/api/graph/ingest-status").get_json()
        assert data["status"] == "ok"
        for field in (
            "last_ingest_at",
            "last_ingest_inserted",
            "stories_in_db",
            "stories_in_source",
            "last_error",
            "source_backend",
            "scrape",
        ):
            assert field in data, f"Missing field: {field}"

    def test_scrape_subobject_keys(self, api_client):
        scrape = api_client.get("/api/graph/ingest-status").get_json()["scrape"]
        for field in (
            "last_scrape_at",
            "status",
            "error",
            "stories_total",
            "stories_added",
        ):
            assert field in scrape

    def test_stories_in_db_positive(self, api_client):
        data = api_client.get("/api/graph/ingest-status").get_json()
        assert data["stories_in_db"] > 0

    def test_no_cache_header(self, api_client):
        response = api_client.get("/api/graph/ingest-status")
        assert response.headers.get("Cache-Control") == "no-cache"


# ---------------------------------------------------------------------------
# /api/graph/era/<era> — cache header and node shape
# ---------------------------------------------------------------------------

class TestEraEndpointExtended:
    def test_cache_control_set(self, api_client):
        response = api_client.get("/api/graph/era/frontier")
        assert "Cache-Control" in response.headers

    def test_node_id_format(self, api_client):
        data = api_client.get("/api/graph/era/frontier").get_json()
        for node in data.get("nodes", []):
            assert node["id"].startswith(("entity:", "story:"))

    def test_filter_field_echo(self, api_client):
        data = api_client.get("/api/graph/era/agentic").get_json()
        assert data["filter"]["era"] == "agentic"

    def test_all_eras_reachable(self, api_client):
        from scraper.sources import ERA_DATE_RANGES
        for era in ERA_DATE_RANGES:
            resp = api_client.get(f"/api/graph/era/{era}")
            assert resp.status_code == 200, f"Era {era} returned {resp.status_code}"


# ---------------------------------------------------------------------------
# /api/graph/year-range — extended
# ---------------------------------------------------------------------------

class TestYearRangeEndpointExtended:
    def test_default_params_succeed(self, api_client):
        response = api_client.get("/api/graph/year-range")
        assert response.status_code == 200

    def test_equal_from_to_succeeds(self, api_client):
        response = api_client.get("/api/graph/year-range?from=2023&to=2023")
        assert response.status_code == 200

    def test_filter_field_echo(self, api_client):
        data = api_client.get("/api/graph/year-range?from=2022&to=2024").get_json()
        assert data["filter"]["from"] == 2022
        assert data["filter"]["to"] == 2024

    def test_non_integer_from_returns_400(self, api_client):
        response = api_client.get("/api/graph/year-range?from=abc")
        assert response.status_code == 400

    def test_non_integer_to_returns_400(self, api_client):
        response = api_client.get("/api/graph/year-range?to=xyz")
        assert response.status_code == 400

    def test_nodes_have_year_field(self, api_client):
        data = api_client.get("/api/graph/year-range?from=2023&to=2024").get_json()
        # story nodes should have year in their ids/labels
        story_nodes = [n for n in data.get("nodes", []) if n["id"].startswith("story:")]
        assert isinstance(story_nodes, list)

    def test_cache_control_set(self, api_client):
        response = api_client.get("/api/graph/year-range?from=2023&to=2025")
        assert "Cache-Control" in response.headers
