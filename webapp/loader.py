"""JSON -> DB ingestion for scraped and seed stories.

Reads stories from GCS (STORIES_BUCKET) or local data/ files and inserts any
not yet present into the graph database, mapping the scraper story schema
onto the existing tables (stories, entities, story_entities, story_tags,
entity_links).
"""

import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from loguru import logger

from scraper.storage import StoryStorage

SEED_PATH = Path(__file__).parent.parent / "data" / "ai_history_seed.json"

# Scraper entity type -> existing group_name conventions.
_TYPE_TO_GROUP = {
    "lab": "Labs",
    "model": "Models",
    "person": "People",
    "product": "Consumer",
    "concept": "Capabilities",
    "policy": "Policy",
    "risk": "Risk",
    "dataset": "Measurement",
    "hardware": "Infrastructure",
    "event": "Strategy",
}

# Scraper entity type -> existing entity_type conventions.
_TYPE_TO_ENTITY_TYPE = {
    "lab": "company",
    "model": "model",
    "person": "person",
    "product": "topic",
    "concept": "topic",
    "policy": "topic",
    "risk": "topic",
    "dataset": "topic",
    "hardware": "topic",
    "event": "topic",
}

_SLUG_RE = re.compile(r"[^a-z0-9]+")

META_INGEST_AT = "ingest_last_at"
META_INGEST_INSERTED = "ingest_last_inserted"
META_INGEST_ERROR = "ingest_last_error"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(name: str) -> str:
    return _SLUG_RE.sub("-", name.lower()).strip("-") or "unknown"


def _importance_int(score: float) -> int:
    """Map 0.0-1.0 importance_score onto the existing 1-5 integer scale."""
    return max(1, min(5, round(score * 5)))


class DataLoader:
    def __init__(self, storage: StoryStorage | None = None, seed_path: Path = SEED_PATH):
        self.storage = storage if storage is not None else StoryStorage()
        self.seed_path = seed_path

    # -- public API ----------------------------------------------------------

    def load_seed(self, conn: sqlite3.Connection) -> int:
        """Load the historical seed corpus once. Idempotent."""
        row = conn.execute(
            "SELECT value FROM meta WHERE key = 'seed_loaded'"
        ).fetchone()
        if row and row[0] == "1":
            return 0

        stories = self._read_json_file(self.seed_path)
        if not stories:
            return 0

        inserted = self._insert_stories(conn, stories)
        if inserted >= 0:
            conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES ('seed_loaded', '1')"
            )
            conn.commit()
        return max(inserted, 0)

    def load_stories(self, conn: sqlite3.Connection) -> int:
        """Load scraped stories not yet in the DB (dedup by source_url/id)."""
        try:
            stories = self.storage.load_stories()
        except Exception as exc:
            logger.error("Loader: failed to read stories from storage: {}", exc)
            raise

        if not stories:
            logger.info("Loader: storage returned no stories.")
            self._record_ingest(conn, inserted=0)
            return 0

        logger.info("Loader: read {} stories from storage.", len(stories))
        inserted = self._insert_stories(conn, stories)
        if inserted < 0:
            logger.error(
                "Loader: failed to insert stories from storage ({} fetched).",
                len(stories),
            )
            self._record_ingest(conn, inserted=0, error="insert batch failed")
            return -1
        if inserted == 0:
            logger.info(
                "Loader: all {} fetched stories already present in database.",
                len(stories),
            )
        self._record_ingest(conn, inserted=inserted)
        return inserted

    # -- internals -----------------------------------------------------------

    @staticmethod
    def _record_ingest(
        conn: sqlite3.Connection, *, inserted: int, error: str | None = None
    ) -> None:
        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
            (META_INGEST_AT, _now_iso()),
        )
        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
            (META_INGEST_INSERTED, str(inserted)),
        )
        if error:
            conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                (META_INGEST_ERROR, error),
            )
        else:
            conn.execute("DELETE FROM meta WHERE key = ?", (META_INGEST_ERROR,))
        conn.commit()

    def _read_json_file(self, path: Path) -> list[dict]:
        import json

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            logger.warning("Loader: file not found: {}", path)
            return []
        except (OSError, ValueError) as exc:
            logger.error("Loader: cannot parse {}: {}", path, exc)
            return []
        return data if isinstance(data, list) else []

    def _insert_stories(self, conn: sqlite3.Connection, stories: list[dict]) -> int:
        existing_urls = {
            row[0]
            for row in conn.execute(
                "SELECT source_url FROM stories WHERE source_url IS NOT NULL"
            ).fetchall()
        }
        existing_ids = {
            row[0] for row in conn.execute("SELECT id FROM stories").fetchall()
        }

        inserted = 0
        try:
            conn.execute("BEGIN")
            for story in stories:
                story_id = (story.get("id") or "").strip()
                source_url = (story.get("source_url") or "").strip()
                title = (story.get("title") or "").strip()
                if not story_id or not title:
                    continue
                if story_id in existing_ids:
                    continue
                if source_url and source_url in existing_urls:
                    continue

                self._insert_one(conn, story)
                existing_ids.add(story_id)
                if source_url:
                    existing_urls.add(source_url)
                inserted += 1

            conn.commit()
        except sqlite3.DatabaseError as exc:
            conn.rollback()
            logger.error("Loader: insert batch failed (rolled back): {}", exc)
            return -1

        if inserted:
            logger.info("Loader: inserted {} new stories.", inserted)
        return inserted

    def _insert_one(self, conn: sqlite3.Connection, story: dict) -> None:
        date = (story.get("date") or "").strip() or "2026-01-01"
        year = None
        try:
            year = int(date[:4])
        except ValueError:
            pass

        score = float(story.get("importance_score", 0.5) or 0.5)
        score = max(0.0, min(1.0, score))

        conn.execute(
            """
            INSERT INTO stories
                (id, title, kind, status, event_date, summary, details, importance,
                 source_url, source_name, era, year, importance_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                story["id"],
                story["title"],
                "analysis",
                "active",
                date,
                story.get("summary", ""),
                story.get("summary", ""),
                _importance_int(score),
                story.get("source_url") or None,
                story.get("source_name") or None,
                story.get("era", "frontier"),
                year,
                score,
            ),
        )

        name_to_id: dict[str, str] = {}
        for entity in story.get("entities", []):
            name = (entity.get("name") or "").strip()
            if not name:
                continue
            raw_type = (entity.get("type") or "concept").strip().lower()
            entity_id = _slugify(name)
            name_to_id[name] = entity_id

            conn.execute(
                """
                INSERT OR IGNORE INTO entities
                    (id, name, entity_type, group_name, description, importance)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    entity_id,
                    name,
                    _TYPE_TO_ENTITY_TYPE.get(raw_type, "topic"),
                    _TYPE_TO_GROUP.get(raw_type, "Capabilities"),
                    "",
                    3,
                ),
            )
            conn.execute(
                "INSERT OR IGNORE INTO story_entities (story_id, entity_id) VALUES (?, ?)",
                (story["id"], entity_id),
            )
            if year is not None:
                conn.execute(
                    """
                    UPDATE entities SET
                        first_seen_year = CASE
                            WHEN first_seen_year IS NULL OR first_seen_year > ?
                            THEN ? ELSE first_seen_year END,
                        last_seen_year = CASE
                            WHEN last_seen_year IS NULL OR last_seen_year < ?
                            THEN ? ELSE last_seen_year END
                    WHERE id = ?
                    """,
                    (year, year, year, year, entity_id),
                )

        for keyword in story.get("keywords", []):
            tag = (keyword or "").strip().lower()
            if tag:
                conn.execute(
                    "INSERT OR IGNORE INTO story_tags (story_id, tag) VALUES (?, ?)",
                    (story["id"], tag),
                )

        for rel in story.get("relationships", []):
            source_name = (rel.get("source") or "").strip()
            target_name = (rel.get("target") or "").strip()
            relation = (rel.get("relation") or "related to").strip()
            source_id = name_to_id.get(source_name)
            target_id = name_to_id.get(target_name)
            if not source_id or not target_id or source_id == target_id:
                continue
            updated = conn.execute(
                """
                UPDATE entity_links SET weight = weight + 1
                WHERE source_id = ? AND target_id = ? AND relation = ?
                """,
                (source_id, target_id, relation),
            )
            if updated.rowcount == 0:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO entity_links
                        (source_id, target_id, relation, weight)
                    VALUES (?, ?, ?, 1)
                    """,
                    (source_id, target_id, relation),
                )


def get_ingest_status(
    conn: sqlite3.Connection, storage: StoryStorage | None = None
) -> dict[str, Any]:
    """Scraper↔app ingest diagnostics for /api/graph/ingest-status."""
    store = storage if storage is not None else StoryStorage()
    meta = {
        row[0]: row[1]
        for row in conn.execute(
            "SELECT key, value FROM meta WHERE key LIKE 'ingest_%'"
        ).fetchall()
    }
    stories_in_db = conn.execute("SELECT COUNT(*) FROM stories").fetchone()[0]
    source_stories = store.load_stories()
    scrape_state = store.load_state()
    last_inserted_raw = meta.get(META_INGEST_INSERTED)
    return {
        "last_ingest_at": meta.get(META_INGEST_AT),
        "last_ingest_inserted": int(last_inserted_raw) if last_inserted_raw else 0,
        "stories_in_db": stories_in_db,
        "stories_in_source": len(source_stories),
        "last_error": meta.get(META_INGEST_ERROR),
        "source_backend": "gcs" if store.bucket_name else "local",
        "scrape": {
            "last_scrape_at": scrape_state.get("last_scrape_iso"),
            "status": scrape_state.get("status"),
            "error": scrape_state.get("error"),
            "stories_total": scrape_state.get("stories_total"),
            "stories_added": scrape_state.get("stories_added"),
        },
    }
