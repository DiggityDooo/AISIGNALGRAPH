"""Tests for scraper/sources.py — era classification and RSS source registry."""

from __future__ import annotations

import pytest

from scraper.sources import ERA_DATE_RANGES, RSS_SOURCES, classify_era


# ---------------------------------------------------------------------------
# classify_era
# ---------------------------------------------------------------------------

class TestClassifyEra:
    # Modern AI eras (what the dataset focuses on)
    def test_2020_is_transformer_or_frontier(self):
        era = classify_era(2020)
        assert era in ERA_DATE_RANGES

    def test_2022_is_frontier(self):
        assert classify_era(2022) == "frontier"

    def test_2023_is_frontier(self):
        assert classify_era(2023) == "frontier"

    def test_2024_is_agentic(self):
        assert classify_era(2024) == "agentic"

    def test_2025_is_agentic(self):
        assert classify_era(2025) == "agentic"

    def test_2026_is_agentic(self):
        assert classify_era(2026) == "agentic"

    # Historical eras
    def test_1960_founding(self):
        assert classify_era(1960) == "founding"

    def test_1980_connectionist(self):
        era = classify_era(1980)
        # 1980 falls in connectionist (1980-1986)
        assert era == "connectionist"

    def test_2010_deep_learning(self):
        era = classify_era(2010)
        assert era == "deep_learning"

    def test_2018_transformer(self):
        assert classify_era(2018) == "transformer"

    # Boundary behavior
    def test_far_future_is_agentic(self):
        assert classify_era(2099) == "agentic"

    def test_very_old_year_handled(self):
        era = classify_era(1956)
        assert era in ERA_DATE_RANGES

    def test_overlapping_years_prefer_later_era(self):
        # 2022 appears in both transformer (2017-2022) and frontier (2022-2024)
        # Later era (frontier) should win
        assert classify_era(2022) == "frontier"

    def test_2024_appears_in_both_eras(self):
        # 2024 appears in both frontier (2022-2024) and agentic (2024-2026)
        # Later era (agentic) should win
        assert classify_era(2024) == "agentic"

    def test_all_return_values_are_valid_eras(self):
        test_years = range(1956, 2027)
        for year in test_years:
            era = classify_era(year)
            assert era in ERA_DATE_RANGES, f"Year {year} returned invalid era: {era}"


# ---------------------------------------------------------------------------
# ERA_DATE_RANGES structure
# ---------------------------------------------------------------------------

class TestEraDateRanges:
    def test_is_dict(self):
        assert isinstance(ERA_DATE_RANGES, dict)

    def test_has_expected_eras(self):
        expected_eras = {"founding", "frontier", "agentic", "transformer", "deep_learning"}
        assert expected_eras.issubset(set(ERA_DATE_RANGES.keys()))

    def test_each_era_has_two_element_tuple(self):
        for era, date_range in ERA_DATE_RANGES.items():
            assert len(date_range) == 2, f"Era {era} should have (start, end) tuple"

    def test_start_before_end(self):
        for era, (start, end) in ERA_DATE_RANGES.items():
            assert start <= end, f"Era {era}: start {start} > end {end}"

    def test_years_are_integers(self):
        for era, (start, end) in ERA_DATE_RANGES.items():
            assert isinstance(start, int), f"Era {era} start is not int"
            assert isinstance(end, int), f"Era {era} end is not int"

    def test_ranges_progress_historically(self):
        sorted_eras = sorted(ERA_DATE_RANGES.items(), key=lambda x: x[1][0])
        starts = [start for _, (start, _) in sorted_eras]
        assert starts == sorted(starts)

    def test_frontier_covers_chatgpt_launch(self):
        start, end = ERA_DATE_RANGES["frontier"]
        assert start <= 2022 <= end

    def test_agentic_covers_current_period(self):
        start, end = ERA_DATE_RANGES["agentic"]
        assert start <= 2025 <= end


# ---------------------------------------------------------------------------
# RSS_SOURCES structure
# ---------------------------------------------------------------------------

class TestRssSources:
    def test_is_list(self):
        assert isinstance(RSS_SOURCES, list)

    def test_has_sources(self):
        assert len(RSS_SOURCES) > 0

    def test_each_source_has_name_and_rss(self):
        for source in RSS_SOURCES:
            assert "name" in source, f"Source missing 'name': {source}"
            assert "rss" in source, f"Source missing 'rss': {source}"

    def test_rss_urls_are_https(self):
        for source in RSS_SOURCES:
            rss_url = source["rss"]
            assert rss_url.startswith("https://"), \
                f"Source '{source['name']}' uses non-HTTPS URL: {rss_url}"

    def test_source_names_are_unique(self):
        names = [s["name"] for s in RSS_SOURCES]
        assert len(names) == len(set(names)), "Duplicate source names found"

    def test_rss_urls_are_unique(self):
        urls = [s["rss"] for s in RSS_SOURCES]
        assert len(urls) == len(set(urls)), "Duplicate RSS URLs found"

    def test_known_sources_present(self):
        names = {s["name"] for s in RSS_SOURCES}
        expected = {"OpenAI Blog", "Anthropic News", "Google DeepMind"}
        for name in expected:
            assert name in names, f"Expected source '{name}' not found"

    def test_each_source_has_rate_field(self):
        for source in RSS_SOURCES:
            assert "rate" in source, f"Source '{source['name']}' missing 'rate' field"

    def test_names_are_non_empty_strings(self):
        for source in RSS_SOURCES:
            assert isinstance(source["name"], str) and source["name"].strip()

    def test_rss_urls_are_non_empty_strings(self):
        for source in RSS_SOURCES:
            assert isinstance(source["rss"], str) and source["rss"].strip()
