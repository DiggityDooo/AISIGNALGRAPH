"""REST API blueprint: graph data, era/year filters, FTS search, stats.

Registered with prefix /api. Route paths here must not collide with the
legacy /api/* endpoints defined directly on the app in webapp/__init__.py.
"""

import sqlite3
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request

api_bp = Blueprint("api_v2", __name__)

CACHE_HEADER = "public, max-age=3600"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(current_app.config["DATABASE_PATH"])
    conn.row_factory = sqlite3.Row
    return conn


def _json(payload, status: int = 200):
    response = jsonify(payload)
    response.status_code = status
    response.headers["Cache-Control"] = CACHE_HEADER
    return response


def _error(message: str, status: int):
    response = jsonify({"error": message})
    response.status_code = status
    return response


def _build_graph_payload(conn: sqlite3.Connection, where: str = "", params: tuple = ()) -> dict:
    """Build the nodes/edges/meta payload, optionally filtered by story rows."""
    story_filter = f"WHERE {where}" if where else ""

    story_rows = conn.execute(
        f"SELECT id, era, year FROM stories {story_filter}", params
    ).fetchall()
    story_ids = {row["id"] for row in story_rows}

    if not story_ids:
        return {
            "nodes": [],
            "edges": [],
            "meta": {
                "total_stories": 0,
                "total_nodes": 0,
                "total_edges": 0,
                "year_range": None,
                "last_updated": datetime.now(timezone.utc).isoformat(),
            },
        }

    placeholders = ",".join("?" for _ in story_ids)
    entity_rows = conn.execute(
        f"""
        SELECT e.id, e.name, e.entity_type, e.importance,
               e.first_seen_year, e.last_seen_year,
               COUNT(se.story_id) AS degree
        FROM entities e
        JOIN story_entities se ON se.entity_id = e.id
        WHERE se.story_id IN ({placeholders})
        GROUP BY e.id
        """,
        tuple(story_ids),
    ).fetchall()

    entity_ids = {row["id"] for row in entity_rows}

    def _era_for_year(year):
        if year is None:
            return "frontier"
        from scraper.sources import classify_era

        return classify_era(int(year))

    nodes = [
        {
            "id": row["id"],
            "label": row["name"],
            "type": row["entity_type"],
            "degree": row["degree"],
            "importance": (row["importance"] or 3) / 5.0,
            "first_year": row["first_seen_year"],
            "last_year": row["last_seen_year"],
            "era": _era_for_year(row["first_seen_year"]),
        }
        for row in entity_rows
    ]

    edge_rows = conn.execute(
        "SELECT source_id, target_id, relation, weight FROM entity_links"
    ).fetchall()
    edges = [
        {
            "source": row["source_id"],
            "target": row["target_id"],
            "relation": row["relation"],
            "weight": row["weight"],
        }
        for row in edge_rows
        if row["source_id"] in entity_ids and row["target_id"] in entity_ids
    ]

    years = [row["year"] for row in story_rows if row["year"] is not None]
    total_stories = conn.execute("SELECT COUNT(*) FROM stories").fetchone()[0]

    return {
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "total_stories": total_stories,
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "year_range": [min(years), max(years)] if years else None,
            "last_updated": datetime.now(timezone.utc).isoformat(),
        },
    }


@api_bp.get("/graph/era/<era_name>")
def graph_by_era(era_name: str):
    from scraper.sources import ERA_DATE_RANGES

    if era_name not in ERA_DATE_RANGES:
        return _error(f"unknown era '{era_name}'", 404)
    store = current_app.extensions.get("graph_store")
    if store is None:
        return _error("graph unavailable", 503)
    try:
        payload = store.get_graph_data_by_era(era_name)
    except ValueError as exc:
        return _error(str(exc), 404)
    except Exception:
        current_app.logger.exception("graph_by_era failed")
        return _error("database error", 500)
    return _json({**payload, "status": "ok", "filter": {"era": era_name}})


@api_bp.get("/graph/year-range")
def graph_by_year_range():
    try:
        year_from = int(request.args.get("from", "1956"))
        year_to = int(request.args.get("to", "2100"))
    except ValueError:
        return _error("'from' and 'to' must be integers", 400)
    if year_from > year_to:
        return _error("'from' must be <= 'to'", 400)
    store = current_app.extensions.get("graph_store")
    if store is None:
        return _error("graph unavailable", 503)
    try:
        payload = store.get_graph_data_by_year_range(year_from, year_to)
    except Exception:
        current_app.logger.exception("graph_by_year_range failed")
        return _error("database error", 500)
    return _json(
        {
            **payload,
            "status": "ok",
            "filter": {"from": year_from, "to": year_to},
        }
    )


@api_bp.get("/stories/search")
def stories_search():
    query = (request.args.get("q") or "").strip()
    if not query:
        return _error("missing query parameter 'q'", 400)
    try:
        limit = min(max(int(request.args.get("limit", "20")), 1), 100)
        offset = max(int(request.args.get("offset", "0")), 0)
    except ValueError:
        return _error("'limit' and 'offset' must be integers", 400)

    # FTS5 query syntax can raise on malformed input; quote each term.
    fts_query = " ".join(
        '"' + term.replace('"', "") + '"' for term in query.split()
    )

    try:
        with _connect() as conn:
            total = conn.execute(
                "SELECT COUNT(*) FROM stories_fts WHERE stories_fts MATCH ?",
                (fts_query,),
            ).fetchone()[0]
            rows = conn.execute(
                """
                SELECT s.id, s.title, s.summary, s.event_date AS date,
                       s.source_name, s.era, s.importance_score
                FROM stories_fts f
                JOIN stories s ON s.id = f.story_id
                WHERE stories_fts MATCH ?
                ORDER BY rank
                LIMIT ? OFFSET ?
                """,
                (fts_query, limit, offset),
            ).fetchall()
    except sqlite3.DatabaseError:
        current_app.logger.exception("stories_search failed")
        return _error("search unavailable", 500)

    return _json(
        {
            "results": [dict(row) for row in rows],
            "total": total,
            "query": query,
        }
    )


@api_bp.get("/stats")
def stats():
    try:
        with _connect() as conn:
            total_stories = conn.execute("SELECT COUNT(*) FROM stories").fetchone()[0]
            by_era = dict(
                conn.execute(
                    "SELECT era, COUNT(*) FROM stories WHERE era IS NOT NULL GROUP BY era"
                ).fetchall()
            )
            by_year = dict(
                conn.execute(
                    "SELECT CAST(year AS TEXT), COUNT(*) FROM stories "
                    "WHERE year IS NOT NULL GROUP BY year ORDER BY year"
                ).fetchall()
            )
            top_entities = [
                {"name": row["name"], "degree": row["degree"]}
                for row in conn.execute(
                    """
                    SELECT e.name, COUNT(se.story_id) AS degree
                    FROM entities e
                    JOIN story_entities se ON se.entity_id = e.id
                    GROUP BY e.id
                    ORDER BY degree DESC
                    LIMIT 20
                    """
                ).fetchall()
            ]
            scrape_row = conn.execute(
                "SELECT last_scrape_iso, status FROM scrape_meta ORDER BY id DESC LIMIT 1"
            ).fetchone()
    except sqlite3.DatabaseError:
        current_app.logger.exception("stats failed")
        return _error("database error", 500)

    return _json(
        {
            "total_stories": total_stories,
            "stories_by_era": by_era,
            "stories_by_year": by_year,
            "top_entities": top_entities,
            "last_scrape": scrape_row["last_scrape_iso"] if scrape_row else None,
            "scrape_status": scrape_row["status"] if scrape_row else "unknown",
        }
    )
