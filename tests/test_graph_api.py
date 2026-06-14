"""Tests for era/year graph API endpoints."""

from __future__ import annotations

import pytest

from webapp import create_app


@pytest.fixture()
def client():
    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


def test_graph_by_era_returns_legacy_shape(client):
    response = client.get("/api/graph/era/frontier")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "ok"
    assert payload["filter"]["era"] == "frontier"
    assert isinstance(payload["nodes"], list)
    assert isinstance(payload["edges"], list)
    if payload["nodes"]:
        assert "id" in payload["nodes"][0]
        assert payload["nodes"][0]["id"].startswith(("entity:", "story:"))


def test_graph_by_era_unknown_returns_404(client):
    response = client.get("/api/graph/era/not-a-real-era")
    assert response.status_code == 404


def test_graph_year_range_returns_legacy_shape(client):
    response = client.get("/api/graph/year-range?from=2023&to=2025")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "ok"
    assert payload["filter"]["from"] == 2023
    assert payload["filter"]["to"] == 2025
    assert isinstance(payload["nodes"], list)


def test_graph_year_range_invalid_args(client):
    response = client.get("/api/graph/year-range?from=2026&to=2020")
    assert response.status_code == 400
