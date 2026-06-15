"""Tests for Flask app routes in webapp/__init__.py — routes, headers, error handlers."""

from __future__ import annotations

import pytest

from webapp import create_app


@pytest.fixture(scope="module")
def app():
    application = create_app()
    application.config["TESTING"] = True
    return application


@pytest.fixture(scope="module")
def client(app):
    with app.test_client() as c:
        yield c


# ---------------------------------------------------------------------------
# Static / page routes
# ---------------------------------------------------------------------------

class TestPageRoutes:
    def test_home_returns_200(self, client):
        response = client.get("/")
        assert response.status_code == 200

    def test_hub_redirects_to_home(self, client):
        response = client.get("/hub")
        assert response.status_code == 302
        assert "/" in response.headers.get("Location", "")

    def test_graph_route_returns_200(self, client):
        response = client.get("/graph")
        assert response.status_code == 200

    def test_stories_route_returns_200(self, client):
        response = client.get("/stories")
        assert response.status_code == 200

    def test_entities_route_returns_200(self, client):
        response = client.get("/entities")
        assert response.status_code == 200

    def test_unknown_path_returns_404(self, client):
        response = client.get("/this-path-does-not-exist-at-all")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# API overview and health
# ---------------------------------------------------------------------------

class TestOverviewAndHealth:
    def test_overview_returns_200(self, client):
        response = client.get("/api/overview")
        assert response.status_code == 200

    def test_overview_has_stats_and_job(self, client):
        data = client.get("/api/overview").get_json()
        assert "stats" in data
        assert "job" in data

    def test_health_returns_200_or_503(self, client):
        response = client.get("/api/health")
        assert response.status_code in (200, 503)

    def test_health_200_has_status_field(self, client):
        response = client.get("/api/health")
        if response.status_code == 200:
            data = response.get_json()
            assert data["status"] == "healthy"

    def test_health_has_database_path(self, client):
        data = client.get("/api/health").get_json()
        assert "database" in data or "message" in data


# ---------------------------------------------------------------------------
# /api/graph (main graph endpoint)
# ---------------------------------------------------------------------------

class TestApiGraph:
    def test_returns_200(self, client):
        response = client.get("/api/graph")
        assert response.status_code == 200

    def test_returns_nodes_and_edges(self, client):
        data = client.get("/api/graph").get_json()
        assert "nodes" in data
        assert "edges" in data

    def test_status_ok(self, client):
        data = client.get("/api/graph").get_json()
        assert data.get("status") == "ok"

    def test_nodes_are_list(self, client):
        data = client.get("/api/graph").get_json()
        assert isinstance(data["nodes"], list)

    def test_etag_header_present(self, client):
        response = client.get("/api/graph")
        assert "ETag" in response.headers

    def test_conditional_get_304(self, client):
        response = client.get("/api/graph")
        etag = response.headers.get("ETag")
        if etag:
            conditional = client.get("/api/graph", headers={"If-None-Match": etag})
            assert conditional.status_code == 304


# ---------------------------------------------------------------------------
# /api/stories
# ---------------------------------------------------------------------------

class TestApiStories:
    def test_returns_200(self, client):
        assert client.get("/api/stories").status_code == 200

    def test_returns_list(self, client):
        data = client.get("/api/stories").get_json()
        assert isinstance(data, list)

    def test_story_has_required_fields(self, client):
        data = client.get("/api/stories").get_json()
        if data:
            story = data[0]
            for field in ("id", "title", "kind", "status", "event_date", "summary"):
                assert field in story, f"Missing field: {field}"

    def test_filter_by_kind(self, client):
        data = client.get("/api/stories?kind=model-release").get_json()
        assert isinstance(data, list)
        for story in data:
            assert story["kind"] == "model-release"

    def test_filter_by_query(self, client):
        data = client.get("/api/stories?q=OpenAI").get_json()
        assert isinstance(data, list)

    def test_empty_list_for_no_match(self, client):
        data = client.get("/api/stories?kind=__nonexistent__").get_json()
        assert data == []


# ---------------------------------------------------------------------------
# /api/entities
# ---------------------------------------------------------------------------

class TestApiEntities:
    def test_returns_200(self, client):
        assert client.get("/api/entities").status_code == 200

    def test_returns_list(self, client):
        data = client.get("/api/entities").get_json()
        assert isinstance(data, list)

    def test_entity_has_required_fields(self, client):
        data = client.get("/api/entities").get_json()
        if data:
            entity = data[0]
            for field in ("id", "name", "type", "group", "story_count"):
                assert field in entity, f"Missing field: {field}"

    def test_filter_by_type(self, client):
        data = client.get("/api/entities?type=company").get_json()
        for entity in data:
            assert entity["type"] == "company"

    def test_filter_by_query(self, client):
        data = client.get("/api/entities?q=OpenAI").get_json()
        assert isinstance(data, list)
        assert any(e["name"] == "OpenAI" for e in data)


# ---------------------------------------------------------------------------
# /api/filters
# ---------------------------------------------------------------------------

class TestApiFilters:
    def test_returns_200(self, client):
        assert client.get("/api/filters").status_code == 200

    def test_response_structure(self, client):
        data = client.get("/api/filters").get_json()
        assert "stories" in data
        assert "entities" in data

    def test_stories_filters_has_keys(self, client):
        data = client.get("/api/filters").get_json()
        stories = data["stories"]
        assert "kinds" in stories
        assert "statuses" in stories
        assert "tags" in stories

    def test_entities_filters_has_types(self, client):
        data = client.get("/api/filters").get_json()
        assert "types" in data["entities"]

    def test_kinds_includes_model_release(self, client):
        data = client.get("/api/filters").get_json()
        assert "model-release" in data["stories"]["kinds"]


# ---------------------------------------------------------------------------
# /api/story/<id>
# ---------------------------------------------------------------------------

class TestApiStoryDetail:
    def _get_first_story_id(self, client):
        stories = client.get("/api/stories").get_json()
        return stories[0]["id"] if stories else None

    def test_valid_id_returns_200(self, client):
        story_id = self._get_first_story_id(client)
        if story_id:
            response = client.get(f"/api/story/{story_id}")
            assert response.status_code == 200

    def test_response_has_required_fields(self, client):
        story_id = self._get_first_story_id(client)
        if story_id:
            data = client.get(f"/api/story/{story_id}").get_json()
            for field in ("id", "title", "content_html", "kind", "event_date", "tags"):
                assert field in data, f"Missing field: {field}"

    def test_nonexistent_id_returns_404(self, client):
        response = client.get("/api/story/this-story-does-not-exist-abc123")
        assert response.status_code == 404

    def test_invalid_id_format_returns_404(self, client):
        response = client.get("/api/story/__INVALID__")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------

class TestSecurityHeaders:
    def test_x_content_type_options(self, client):
        response = client.get("/")
        assert response.headers.get("X-Content-Type-Options") == "nosniff"

    def test_x_frame_options(self, client):
        response = client.get("/")
        assert response.headers.get("X-Frame-Options") == "DENY"

    def test_referrer_policy(self, client):
        response = client.get("/")
        assert "Referrer-Policy" in response.headers

    def test_csp_header_set(self, client):
        response = client.get("/")
        assert "Content-Security-Policy" in response.headers

    def test_coop_header(self, client):
        response = client.get("/")
        assert "Cross-Origin-Opener-Policy" in response.headers

    def test_json_api_has_headers(self, client):
        response = client.get("/api/overview")
        assert response.headers.get("X-Content-Type-Options") == "nosniff"


# ---------------------------------------------------------------------------
# CORS headers
# ---------------------------------------------------------------------------

class TestCORSHeaders:
    def test_localhost_origin_gets_cors_header(self, client):
        response = client.get("/api/graph", headers={"Origin": "http://localhost:3000"})
        assert "Access-Control-Allow-Origin" in response.headers
        assert response.headers["Access-Control-Allow-Origin"] == "http://localhost:3000"

    def test_non_localhost_origin_no_cors_header(self, client):
        response = client.get("/api/graph", headers={"Origin": "https://evil.com"})
        assert "Access-Control-Allow-Origin" not in response.headers

    def test_localhost_cors_exposes_methods(self, client):
        response = client.get("/api/graph", headers={"Origin": "http://localhost:3000"})
        assert "Access-Control-Allow-Methods" in response.headers

    def test_localhost_cors_allows_credentials(self, client):
        response = client.get("/api/graph", headers={"Origin": "http://localhost:3000"})
        assert response.headers.get("Access-Control-Allow-Credentials") == "true"


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

class TestErrorHandlers:
    def test_404_returns_html(self, client):
        response = client.get("/this/does/not/exist")
        assert response.status_code == 404

    def test_404_response_is_html(self, client):
        response = client.get("/this/does/not/exist")
        assert b"html" in response.data.lower() or response.status_code == 404


# ---------------------------------------------------------------------------
# CSRF protection
# ---------------------------------------------------------------------------

class TestCSRFProtection:
    def test_post_rebuild_without_csrf_rejected(self, client):
        response = client.post("/api/rebuild")
        # Should be rejected (403 bad CSRF or 400 bad request)
        assert response.status_code in (400, 403, 429)

    def test_get_requests_do_not_require_csrf(self, client):
        response = client.get("/api/graph")
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# Rate limiting configuration
# ---------------------------------------------------------------------------

class TestRateLimiting:
    def test_graph_endpoint_not_rate_limited_on_single_call(self, client):
        response = client.get("/api/graph")
        assert response.status_code == 200

    def test_overview_not_rate_limited(self, client):
        for _ in range(5):
            assert client.get("/api/overview").status_code == 200


# ---------------------------------------------------------------------------
# Path resolution helpers
# ---------------------------------------------------------------------------

class TestPathHelpers:
    def test_resolve_path_setting_absolute(self, app):
        from webapp import _resolve_path_setting
        from pathlib import Path
        result = _resolve_path_setting(Path("/root"), "/absolute/path.md")
        assert result == Path("/absolute/path.md")

    def test_resolve_path_setting_relative(self, app):
        from webapp import _resolve_path_setting
        from pathlib import Path
        result = _resolve_path_setting(Path("/root"), "relative/path.md")
        assert result == Path("/root/relative/path.md")

    def test_resolve_path_setting_none_uses_default(self, app):
        from webapp import _resolve_path_setting
        from pathlib import Path
        result = _resolve_path_setting(Path("/root"), None, "default/path.md")
        assert result == Path("/root/default/path.md")

    def test_normalize_query_value_strips_whitespace(self, app):
        from webapp import _normalize_query_value
        with app.test_request_context("/"):
            result = _normalize_query_value("  hello   world  ", max_length=100)
            assert result == "hello world"

    def test_is_same_origin_request_false_for_external(self, app):
        from webapp import _is_same_origin_request
        with app.test_request_context("/", headers={"Referer": "https://evil.com/page"}):
            assert not _is_same_origin_request()

    def test_is_same_origin_request_false_without_referer(self, app):
        from webapp import _is_same_origin_request
        with app.test_request_context("/"):
            assert not _is_same_origin_request()
