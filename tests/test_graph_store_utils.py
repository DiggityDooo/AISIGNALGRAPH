"""Unit tests for pure utility functions in webapp/graph_store.py."""

from __future__ import annotations

import pytest

from webapp.graph_store import (
    _community_type_hint,
    clean_md,
    cluster_role_for_entity_type,
    graph_edge_type,
    graph_node_type,
    month_index_from_key,
    month_range,
    render_markdown_safe,
    short_excerpt,
    slugify,
    timeline_day_sort_key,
    timeline_month_key,
    timeline_month_sort_key,
    title_from_text,
)


# ---------------------------------------------------------------------------
# slugify
# ---------------------------------------------------------------------------

class TestSlugify:
    def test_basic_lowercase(self):
        assert slugify("Hello World") == "hello-world"

    def test_special_chars_become_hyphens(self):
        assert slugify("AI & Machine Learning!") == "ai-machine-learning"

    def test_strips_markdown_formatting(self):
        assert slugify("**bold** and `code`") == "bold-and-code"

    def test_leading_trailing_hyphens_stripped(self):
        result = slugify("  !Hello World!  ")
        assert not result.startswith("-")
        assert not result.endswith("-")

    def test_empty_string_returns_item(self):
        assert slugify("") == "item"

    def test_only_special_chars_returns_item(self):
        assert slugify("!!!") == "item"

    def test_numbers_preserved(self):
        assert slugify("GPT-4") == "gpt-4"

    def test_multiple_hyphens_collapsed(self):
        result = slugify("one   two---three")
        assert "--" not in result


# ---------------------------------------------------------------------------
# clean_md
# ---------------------------------------------------------------------------

class TestCleanMd:
    def test_strips_bold(self):
        assert clean_md("**important**") == "important"

    def test_strips_inline_code(self):
        assert clean_md("`code_block`") == "code_block"

    def test_strips_links(self):
        assert clean_md("[text](https://example.com)") == "text"

    def test_unescape_markdown_escapes(self):
        result = clean_md("\\*escaped\\*")
        assert "*" in result

    def test_collapses_whitespace(self):
        assert clean_md("  multiple   spaces  ") == "multiple spaces"

    def test_plain_text_unchanged(self):
        assert clean_md("plain text here") == "plain text here"

    def test_empty_string(self):
        assert clean_md("") == ""


# ---------------------------------------------------------------------------
# title_from_text
# ---------------------------------------------------------------------------

class TestTitleFromText:
    def test_short_text_unchanged(self):
        assert title_from_text("Short title") == "Short title"

    def test_truncates_at_14_words(self):
        long_text = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen"
        result = title_from_text(long_text)
        assert len(result.split()) <= 14

    def test_splits_on_period(self):
        result = title_from_text("First sentence. Second sentence.")
        assert result == "First sentence"

    def test_splits_on_colon(self):
        result = title_from_text("Title: subtitle here")
        assert result == "Title"

    def test_empty_uses_fallback(self):
        assert title_from_text("", fallback="Fallback") == "Fallback"

    def test_removes_trailing_comma_after_truncation(self):
        # 15+ words — truncation at 14 → rstrip(",") applied
        long = "one, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve, thirteen, fourteen, fifteen,"
        result = title_from_text(long)
        assert not result.endswith(",")

    def test_markdown_cleaned_before_split(self):
        result = title_from_text("**Bold title**: some subtitle")
        assert result == "Bold title"


# ---------------------------------------------------------------------------
# short_excerpt
# ---------------------------------------------------------------------------

class TestShortExcerpt:
    def test_short_text_unchanged(self):
        assert short_excerpt("Short text", limit=180) == "Short text"

    def test_long_text_truncated_with_ellipsis(self):
        long = "x" * 200
        result = short_excerpt(long, limit=180)
        assert result.endswith("...")
        # short_excerpt cuts at limit-1 then appends "...", so max is limit+2
        assert len(result) <= 182

    def test_respects_custom_limit(self):
        long = "word " * 100
        result = short_excerpt(long, limit=50)
        # max length is limit-1+3 = limit+2
        assert len(result) <= 52

    def test_collapses_whitespace(self):
        result = short_excerpt("  too   many   spaces  ")
        assert "  " not in result


# ---------------------------------------------------------------------------
# render_markdown_safe
# ---------------------------------------------------------------------------

class TestRenderMarkdownSafe:
    def test_basic_bold_rendered(self):
        result = render_markdown_safe("**bold text**")
        assert "<strong>" in result or "<b>" in result

    def test_script_tags_stripped(self):
        result = render_markdown_safe("<script>alert(1)</script>")
        assert "<script>" not in result

    def test_link_rendered(self):
        result = render_markdown_safe("[click here](https://example.com)")
        assert "<a " in result
        assert "https://example.com" in result

    def test_javascript_href_stripped(self):
        result = render_markdown_safe("[click](javascript:alert(1))")
        assert "javascript:" not in result

    def test_heading_rendered(self):
        result = render_markdown_safe("# Title")
        assert "<h1>" in result


# ---------------------------------------------------------------------------
# timeline_month_key
# ---------------------------------------------------------------------------

class TestTimelineMonthKey:
    def test_iso_date_yyyy_mm_dd(self):
        assert timeline_month_key("2023-03-15") == "2023-03"

    def test_iso_date_yyyy_mm(self):
        assert timeline_month_key("2023-03") == "2023-03"

    def test_iso_date_yyyy_only(self):
        assert timeline_month_key("2023") == "2023-01"

    def test_none_returns_none(self):
        assert timeline_month_key(None) is None

    def test_reference_returns_none(self):
        assert timeline_month_key("reference") is None

    def test_text_with_year(self):
        result = timeline_month_key("Released in 2024")
        assert result == "2024-01"

    def test_empty_string_returns_none(self):
        assert timeline_month_key("") is None


# ---------------------------------------------------------------------------
# timeline_month_sort_key
# ---------------------------------------------------------------------------

class TestTimelineMonthSortKey:
    def test_sorts_chronologically(self):
        months = ["2024-03", "2023-01", "2024-01", "2022-12"]
        sorted_months = sorted(months, key=timeline_month_sort_key)
        assert sorted_months == ["2022-12", "2023-01", "2024-01", "2024-03"]

    def test_none_sorts_last(self):
        months = ["2023-01", None, "2025-06"]
        sorted_months = sorted(months, key=timeline_month_sort_key)
        assert sorted_months[-1] is None

    def test_same_year_different_months(self):
        assert timeline_month_sort_key("2023-01") < timeline_month_sort_key("2023-12")


# ---------------------------------------------------------------------------
# month_range
# ---------------------------------------------------------------------------

class TestMonthRange:
    def test_single_month(self):
        assert month_range("2023-01", "2023-01") == ["2023-01"]

    def test_spans_multiple_months(self):
        result = month_range("2023-11", "2024-02")
        assert result == ["2023-11", "2023-12", "2024-01", "2024-02"]

    def test_full_year(self):
        result = month_range("2023-01", "2023-12")
        assert len(result) == 12
        assert result[0] == "2023-01"
        assert result[-1] == "2023-12"


# ---------------------------------------------------------------------------
# month_index_from_key
# ---------------------------------------------------------------------------

class TestMonthIndexFromKey:
    def test_none_returns_none(self):
        assert month_index_from_key(None) is None

    def test_returns_year_times_12_plus_month(self):
        assert month_index_from_key("2023-01") == 2023 * 12 + 1

    def test_december(self):
        assert month_index_from_key("2023-12") == 2023 * 12 + 12

    def test_ordering_is_chronological(self):
        assert month_index_from_key("2023-06") < month_index_from_key("2024-01")


# ---------------------------------------------------------------------------
# timeline_day_sort_key
# ---------------------------------------------------------------------------

class TestTimelineDaySortKey:
    def test_full_date(self):
        assert timeline_day_sort_key("2023-03-15") == (2023, 3, 15)

    def test_year_month_only(self):
        assert timeline_day_sort_key("2023-03") == (2023, 3, 1)

    def test_year_only(self):
        assert timeline_day_sort_key("2023") == (2023, 1, 1)

    def test_none_returns_zero_tuple(self):
        assert timeline_day_sort_key(None) == (0, 0, 0)

    def test_reference_returns_zero_tuple(self):
        assert timeline_day_sort_key("reference") == (0, 0, 0)

    def test_text_with_year(self):
        result = timeline_day_sort_key("Released in 2024")
        assert result == (2024, 1, 1)


# ---------------------------------------------------------------------------
# cluster_role_for_entity_type
# ---------------------------------------------------------------------------

class TestClusterRoleForEntityType:
    def test_year_returns_timeline(self):
        assert cluster_role_for_entity_type("year") == "timeline"

    def test_company_returns_entity(self):
        assert cluster_role_for_entity_type("company") == "entity"

    def test_model_returns_entity(self):
        assert cluster_role_for_entity_type("model") == "entity"

    def test_keyword_returns_entity(self):
        assert cluster_role_for_entity_type("keyword") == "entity"


# ---------------------------------------------------------------------------
# graph_node_type
# ---------------------------------------------------------------------------

class TestGraphNodeType:
    def test_story_type(self):
        assert graph_node_type("story", "Stories") == "story"

    def test_model_type(self):
        assert graph_node_type("model", "Models") == "model"

    def test_person_type(self):
        assert graph_node_type("person", "People") == "person"

    def test_year_type(self):
        assert graph_node_type("year", "Years") == "year"

    def test_risk_type(self):
        assert graph_node_type("risk", "Risk") == "risk"

    def test_keyword_returns_topic(self):
        assert graph_node_type("keyword", "Capabilities") == "topic"

    def test_topic_returns_topic(self):
        assert graph_node_type("topic", "Science") == "topic"

    def test_policy_group_returns_risk(self):
        assert graph_node_type("company", "Policy") == "risk"

    def test_consumer_group_returns_product(self):
        assert graph_node_type("company", "Consumer") == "product"

    def test_media_group_returns_product(self):
        assert graph_node_type("company", "Media") == "product"

    def test_labs_group_returns_lab(self):
        assert graph_node_type("company", "Labs") == "lab"

    def test_infrastructure_group_returns_lab(self):
        assert graph_node_type("company", "Infrastructure") == "lab"


# ---------------------------------------------------------------------------
# graph_edge_type
# ---------------------------------------------------------------------------

class TestGraphEdgeType:
    def test_story_source_uses_target_type(self):
        assert graph_edge_type("story", "entity", "mention") == "story_to_entity"

    def test_year_to_story(self):
        assert graph_edge_type("year", "story", "timeline") == "year_to_story"

    def test_context_relation(self):
        # "story" source always returns story_to_<target>; "context" fallback only for non-story sources
        assert graph_edge_type("entity", "entity", "context") == "story_context"

    def test_generic_entity_to_entity(self):
        assert graph_edge_type("lab", "model", "released") == "lab_to_model"


# ---------------------------------------------------------------------------
# _community_type_hint
# ---------------------------------------------------------------------------

class TestCommunityTypeHint:
    def test_model_hint(self):
        assert _community_type_hint(["model"]) == "Models"

    def test_lab_hint(self):
        assert _community_type_hint(["lab"]) == "Labs"

    def test_returns_first_matched_type(self):
        # Iterates in order — first match wins
        assert _community_type_hint(["topic", "model"]) == "Topics"
        assert _community_type_hint(["model", "topic"]) == "Models"

    def test_person_hint(self):
        assert _community_type_hint(["person"]) == "People"

    def test_unknown_returns_none(self):
        assert _community_type_hint(["unknown"]) is None

    def test_empty_list_returns_none(self):
        assert _community_type_hint([]) is None
