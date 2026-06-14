from __future__ import annotations

import os
from pathlib import Path


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Config:
    DEBUG = _bool_env("DEBUG")
    SECRET_KEY = os.getenv("FLASK_SECRET_KEY") or os.getenv("SECRET_KEY")
    AI_MASTER_DOC_PATH = Path(os.getenv("AI_MASTER_DOC_PATH", "data/ai_master.md"))
    DATABASE_PATH = Path(os.getenv("DATABASE_PATH", "data/ai_graph.db"))
    MAX_GRAPH_NODES = int(os.getenv("MAX_GRAPH_NODES", "10000"))
    SIGNAL_SPAWN_RATE = float(os.getenv("SIGNAL_SPAWN_RATE", "0.008"))
    API_GRAPH_RATE_LIMIT = int(os.getenv("API_GRAPH_RATE_LIMIT", "90"))
    API_REBUILD_RATE_LIMIT = int(os.getenv("API_REBUILD_RATE_LIMIT", "4"))
    RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
    HEALTH_CHECK_SAMPLE_LIMIT = int(os.getenv("HEALTH_CHECK_SAMPLE_LIMIT", "5"))
    GRAPH_PROTOTYPE_ENABLED = _bool_env("GRAPH_PROTOTYPE_ENABLED")
