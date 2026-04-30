from __future__ import annotations

from typing import Any, Literal, TypedDict

class StoryNode(TypedDict, total=False):
    id: str
    title: str
    kind: str
    summary: str
    details_html: str


class TimelineMetadata(TypedDict):
    months: list[str]
    start: str
    end: str


class GraphData(TypedDict, total=False):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    communities: list[dict[str, Any]]
    timeline: TimelineMetadata
    status: Literal["ok", "degraded"]
    message: str
    health: dict[str, Any]


class JobState(TypedDict):
    active: bool
    job_type: str | None
    started_at: str | None
    finished_at: str | None
    status: Literal["idle", "running", "completed", "failed", "cancelled", "cancelling", "unavailable"]
    error: str | None
    cancel_requested: bool


class HealthReport(TypedDict, total=False):
    status: Literal["healthy", "degraded", "unhealthy"]
    source_path: str
    source_exists: bool
    seed_path: str
    seed_exists: bool
    database_path: str
    database_exists: bool
    schema_version: str | None
    source_signature: str | None
    stories: int
    entities: int
    communities: int
    warnings: list[str]
    errors: list[str]
