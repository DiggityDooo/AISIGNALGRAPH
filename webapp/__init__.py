import hmac
import json
import os
import re
import secrets
import threading
import time
from collections import defaultdict, deque
from functools import wraps
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, Response, abort, flash, jsonify, redirect, render_template, request, session, stream_with_context, url_for
from werkzeug.exceptions import HTTPException

from .config import Config
from .logging import setup_logging

from .graph_store import GraphStore, GraphStoreError, LEGACY_MASTER_DOCUMENT_PATH
from .jobs import DatabaseJobManager
from .types import GraphData, HealthReport, JobState

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,127}$")


def create_app() -> Flask:
    root_path = Path(__file__).resolve().parent.parent

    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config.from_object(Config)
    app.config["ROOT_PATH"] = root_path
    app.config["MAX_CONTENT_LENGTH"] = 1_000_000
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    if not app.config.get("SECRET_KEY"):
        app.config["SECRET_KEY"] = secrets.token_hex(32)

    setup_logging(root_path / "logs")

    source_path = _resolve_master_document_path(root_path, app.config.get("AI_MASTER_DOC_PATH"))
    db_path = _resolve_path_setting(root_path, app.config.get("DATABASE_PATH"), "data/ai_graph.db")
    app.config["AI_MASTER_DOC_PATH"] = str(source_path)
    app.config["DATABASE_PATH"] = str(db_path)
    if "FLASK_SECRET_KEY" not in os.environ:
        app.logger.warning("FLASK_SECRET_KEY is not set; using an ephemeral development secret.")

    graph_store = None
    job_manager = None
    startup_error = None
    try:
        graph_store = GraphStore(root_path, source_path=source_path, db_path=db_path)
        job_manager = DatabaseJobManager(graph_store)
    except Exception as exc:  # noqa: BLE001
        startup_error = "The AI graph could not be initialized. Check AI_MASTER_DOC_PATH, the seed file, and the database state."
        app.logger.exception("Failed to initialize AI Signal Graph services: %s", exc)

    app.extensions["graph_store"] = graph_store
    app.extensions["job_manager"] = job_manager
    app.extensions["startup_error"] = startup_error
    rate_limit_lock = threading.Lock()
    rate_limit_windows: dict[str, deque[float]] = defaultdict(deque)

    @app.context_processor
    def inject_globals():
        return {
            "job_state": job_manager.get_state() if job_manager is not None else _default_job_state(),
            "csrf_token": _get_csrf_token,
        }

    def consume_rate_limit(bucket: str, limit: int) -> int | None:
        if limit <= 0:
            return None
        window_seconds = int(app.config.get("RATE_LIMIT_WINDOW_SECONDS", 60))
        key = f"{bucket}:{request.remote_addr or 'anonymous'}"
        now = time.monotonic()
        with rate_limit_lock:
            entries = rate_limit_windows[key]
            while entries and now - entries[0] >= window_seconds:
                entries.popleft()
            if len(entries) >= limit:
                return max(1, int(window_seconds - (now - entries[0])))
            entries.append(now)
        return None

    def rate_limit(bucket: str, config_key: str):
        def decorator(fn):
            @wraps(fn)
            def wrapped(*args, **kwargs):
                retry_after = consume_rate_limit(bucket, int(app.config.get(config_key, 0)))
                if retry_after is None:
                    return fn(*args, **kwargs)
                return (
                    jsonify(
                        {
                            "status": "rate_limited",
                            "message": "Rate limit exceeded.",
                            "retry_after": retry_after,
                        }
                    ),
                    429,
                )

            return wrapped

        return decorator

    @app.before_request
    def protect_post_routes():
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            if request.path.startswith("/api/") and not _is_same_origin_request():
                abort(403)
            token = request.form.get("csrf_token", "") or request.headers.get("X-CSRF-Token", "")
            expected = session.get("_csrf_token", "")
            if not token or not expected or not hmac.compare_digest(token, expected):
                abort(400)

    @app.errorhandler(400)
    def bad_request(_exc):
        return render_template("400.html"), 400

    @app.errorhandler(403)
    def forbidden(_exc):
        return render_template("403.html"), 403

    @app.errorhandler(404)
    def not_found(_exc):
        return render_template("404.html"), 404

    @app.errorhandler(503)
    def unavailable(_exc):
        return render_template("503.html", message=startup_error or "The AI graph is temporarily unavailable."), 503

    @app.errorhandler(GraphStoreError)
    def handle_graph_store_error(exc):
        app.logger.exception("Graph store error: %s", exc)
        return render_template("500.html"), 500

    @app.errorhandler(Exception)
    def handle_exception(exc):
        if isinstance(exc, HTTPException):
            return exc
        app.logger.exception("Unhandled application error: %s", exc)
        return render_template("500.html"), 500

    def require_services() -> tuple[GraphStore, DatabaseJobManager]:
        if graph_store is None or job_manager is None:
            abort(503)
        return graph_store, job_manager

    @app.get("/")
    def home():
        return app.send_static_file("hub/index.html")

    @app.get("/hub")
    def intelligence_hub():
        return redirect(url_for("home"))

    @app.get("/v1")
    def legacy_home():
        overview = None
        if graph_store is not None:
            try:
                overview = graph_store.get_dashboard_data()
            except GraphStoreError:
                app.logger.exception("Failed to load overview data for home route.")
        return render_template("home.html", overview=overview)

    @app.get("/_next/<path:path>")
    def next_static(path):
        return app.send_static_file(f"hub/_next/{path}")

    @app.get("/graph")
    def dashboard():
        return app.send_static_file("hub/graph.html")

    @app.get("/v1/graph")
    def legacy_graph():
        store, _jobs = require_services()
        overview = store.get_dashboard_data()
        return render_template("dashboard.html", overview=overview, fullscreen_shell=True, body_class="body-graph-shell")

    @app.get("/api/stories/featured")
    def api_featured_stories():
        store, _jobs = require_services()
        # Get high importance stories as featured
        stories = store.list_stories(limit=10)
        featured = [s for s in stories if s["importance"] >= 4]
        if not featured:
            featured = stories[:3]
        return jsonify(featured)

    @app.get("/stories")
    def stories():
        return app.send_static_file("hub/stories.html")

    @app.get("/v1/stories")
    def legacy_stories():
        store, _jobs = require_services()
        q = _normalize_query_value(request.args.get("q", ""), max_length=160)
        kind = _normalize_query_value(request.args.get("kind", ""), max_length=64)
        tag = _normalize_query_value(request.args.get("tag", ""), max_length=64)
        status = _normalize_query_value(request.args.get("status", ""), max_length=32)

        filters = store.get_story_filters()
        _validate_choice(kind, filters["kinds"])
        _validate_choice(tag, filters["tags"])
        _validate_choice(status, filters["statuses"])

        results = store.list_stories(q=q, kind=kind or None, tag=tag or None, status=status or None)
        return render_template(
            "stories.html",
            stories=results,
            filters=filters,
            active={"q": q, "kind": kind, "tag": tag, "status": status},
        )

    @app.get("/entities")
    def entities():
        return app.send_static_file("hub/entities.html")

    @app.get("/v1/entities")
    def legacy_entities():
        store, _jobs = require_services()
        q = _normalize_query_value(request.args.get("q", ""), max_length=160)
        entity_type = _normalize_query_value(request.args.get("type", ""), max_length=32)

        filters = store.get_entity_filters()
        _validate_choice(entity_type, filters["types"])

        items = store.list_entities(q=q, entity_type=entity_type or None)
        return render_template(
            "entities.html",
            entities=items,
            filters=filters,
            active={"q": q, "type": entity_type},
        )

    @app.get("/stories/<story_id>")
    def story_detail(story_id: str):
        _validate_identifier(story_id)
        store, _jobs = require_services()
        story = store.get_story(story_id)
        if story is None:
            abort(404)
        return render_template("story_detail.html", story=story)

    @app.get("/api/graph")
    @rate_limit("api_graph", "API_GRAPH_RATE_LIMIT")
    def api_graph():
        store, _jobs = require_services()
        return jsonify(store.get_graph_data())

    @app.get("/api/health")
    def api_health():
        if startup_error:
            return jsonify({"status": "error", "message": startup_error}), 503
        store, jobs = require_services()
        report = store.get_health_report()
        return jsonify(
            {
                "status": "healthy",
                "database": str(db_path),
                "source": str(source_path),
                "stats": store.get_runtime_stats(),
                "job": jobs.get_state(),
                "report": report,
            }
        )

    @app.post("/api/rebuild")
    @rate_limit("api_rebuild", "API_REBUILD_RATE_LIMIT")
    def api_rebuild():
        store, jobs = require_services()

        @stream_with_context
        def stream():
            try:
                jobs.start_reseed()
            except RuntimeError as exc:
                yield f"data: {json.dumps({'status': 'busy', 'message': str(exc), 'job': jobs.get_state()})}\n\n"
                return
            except GraphStoreError as exc:
                yield f"data: {json.dumps({'status': 'error', 'message': str(exc)})}\n\n"
                return

            yield f"data: {json.dumps({'status': 'starting', 'job': jobs.get_state()})}\n\n"
            last_snapshot = None
            while True:
                snapshot = jobs.get_state()
                encoded = json.dumps({"status": snapshot["status"], "job": snapshot})
                if encoded != last_snapshot:
                    yield f"data: {encoded}\n\n"
                    last_snapshot = encoded
                if not snapshot.get("active"):
                    if snapshot.get("status") == "completed":
                        yield f"data: {json.dumps({'status': 'done', 'job': snapshot, 'stats': store.get_runtime_stats()})}\n\n"
                    elif snapshot.get("status") == "cancelled":
                        yield f"data: {json.dumps({'status': 'cancelled', 'job': snapshot, 'message': snapshot.get('error') or 'Rebuild cancelled.'})}\n\n"
                    else:
                        yield f"data: {json.dumps({'status': 'error', 'job': snapshot, 'message': snapshot.get('error') or 'Rebuild failed.'})}\n\n"
                    break
                time.sleep(0.35)

        return Response(stream(), mimetype="text/event-stream", headers={"Cache-Control": "no-store"})

    @app.post("/api/rebuild/cancel")
    def api_cancel_rebuild():
        _store, jobs = require_services()
        cancelled = jobs.cancel_job()
        return jsonify({"status": "cancelling" if cancelled else "idle", "job": jobs.get_state()}), 202 if cancelled else 409

    return app


def _default_job_state() -> JobState:
    return {
        "active": False,
        "job_type": None,
        "started_at": None,
        "finished_at": None,
        "status": "unavailable",
        "error": None,
        "cancel_requested": False,
    }


def _resolve_path_setting(root_path: Path, configured: Path | str | None, default_relative: str = "data/ai_master.md") -> Path:
    if configured:
        candidate = Path(configured).expanduser()
        if not candidate.is_absolute():
            candidate = root_path / candidate
        return candidate
    return root_path / default_relative


def _resolve_master_document_path(root_path: Path, configured: Path | str | None = None) -> Path:
    if configured:
        return _resolve_path_setting(root_path, configured, "data/ai_master.md")

    candidates = [
        root_path / "data" / "ai_master.md",
        root_path / "data" / "AI_Master_Document_2020_2026.md",
        LEGACY_MASTER_DOCUMENT_PATH,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return root_path / "data" / "ai_master.md"


def _normalize_query_value(value: str, max_length: int) -> str:
    normalized = " ".join(value.split())
    if len(normalized) > max_length:
        abort(400)
    return normalized


def _validate_choice(value: str, allowed: list[str]) -> None:
    if value and value not in allowed:
        abort(400)


def _validate_identifier(value: str) -> None:
    if not ID_RE.fullmatch(value):
        abort(404)


def _get_csrf_token() -> str:
    token = session.get("_csrf_token")
    if not token:
        token = secrets.token_hex(32)
        session["_csrf_token"] = token
    return token


def _is_same_origin_request() -> bool:
    referer = request.headers.get("Referer")
    if not referer:
        return False
    parsed_referer = urlparse(referer)
    parsed_host = urlparse(request.host_url)
    return parsed_referer.netloc == parsed_host.netloc
