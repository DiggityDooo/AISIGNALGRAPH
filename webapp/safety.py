"""Build the public safety desk from the same story nodes used by the graph."""

import re
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

if TYPE_CHECKING:
    from .graph_store import StoryRecord


_SAFETY_TOPIC = re.compile(
    r"\b(?:safety|alignment|deep[ -]?fakes?|voice clon(?:e|es|ing)|impersonation|"
    r"scams?|fraud(?:ulent)?|phishing|misuse|privacy|surveillance|deceptive|"
    r"disinformation|misinformation|data breach(?:es)?|harmful bias)\b", re.I,
)
_CASE_TERMS = re.compile(
    r"\b(?:lawsuits?|complaints?|indict(?:s|ed|ments?)|su(?:es|ed)|settle(?:s|d|ments?)|"
    r"(?:consent|final|proposed) orders?|enforcement action)\b", re.I,
)

_REGULATOR = re.compile(
    r"\b(?:FTC|SEC|DOJ|Federal Trade Commission|Securities and Exchange Commission|"
    r"Justice Department|European Commission|Competition and Markets Authority)\b", re.I,
)
_GUIDE_TITLE = re.compile(r"\b(?:how to (?:spot|avoid|protect|verify|recognize)|tips for avoiding)\b", re.I)


def source_link(value: str | None) -> str | None:
    if not value or "\\" in value or any(c.isspace() or ord(c) < 32 for c in value):
        return None
    try:
        parsed = urlsplit(value)
        if parsed.scheme in {"https", "http"} and parsed.hostname and parsed.username is None:
            return value
    except ValueError:
        pass
    return None


def safety_feed(stories: list["StoryRecord"]) -> list[dict]:
    from .graph_store import timeline_day_sort_key

    records = []
    for story in stories:
        text = " ".join([story.title, story.summary, *story.tags])
        topic_names = " ".join(e["name"] for e in story.entities if e["type"] in {"topic", "keyword"})
        url = story.source_url
        host = urlsplit(url).hostname if url else None
        consumer_alert = host in {"consumer.ftc.gov", "www.consumer.ftc.gov"} and "/consumer-alerts/" in url
        has_safety_topic = _SAFETY_TOPIC.search(text) or _SAFETY_TOPIC.search(topic_names)
        # In news coverage, both the authority and action must appear in the
        # headline. A related entity by itself says nothing about conduct.
        official_case = host in {"ftc.gov", "www.ftc.gov"} and _CASE_TERMS.search(text)
        reported_case = url and _REGULATOR.search(story.title) and _CASE_TERMS.search(story.title)
        if consumer_alert or (url and has_safety_topic and _GUIDE_TITLE.search(story.title)):
            section = "guidance"
        elif official_case or reported_case:
            section = "conduct"
        elif has_safety_topic:
            section = "awareness"
        else:
            continue
        records.append({
            "id": story.id,
            "title": story.title,
            "summary": story.summary,
            "date": story.event_date,
            "section": section,
            "source_url": url,
            "source_name": story.source_name or host,
            "entities": story.entities,
        })

    return sorted(records, key=lambda r: (timeline_day_sort_key(r["date"]), r["id"]), reverse=True)
