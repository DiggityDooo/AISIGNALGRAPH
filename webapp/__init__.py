import hmac
import json
import os
import re
import secrets
import time
from pathlib import Path

from flask import Flask, Response, abort, flash, jsonify, redirect, render_template, request, session, stream_with_context, url_for
from werkzeug.exceptions import HTTPException

from .graph_store import GraphStore, GraphStoreError, LEGACY_MASTER_DOCUMENT_PATH
from .jobs import DatabaseJobManager

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,127}$")


def create_app() -> Flask:
    root_path = Path(__file__).resolve().parent.parent

    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config["ROOT_PATH"] = root_path
    app.config["MAX_CONTENT_LENGTH"] = 1_000_000
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SECRET_KEY"] = os.getenv("FLASK_SECRET_KEY") or secrets.token_hex(32)

    source_path = _resolve_master_document_path(root_path)
    app.config["AI_MASTER_DOC_PATH"] = str(source_path)
    if "FLASK_SECRET_KEY" not in os.environ:
        app.logger.warning("FLASK_SECRET_KEY is not set; using an ephemeral development secret.")

    graph_store = None
    job_manager = None
    startup_error = None
    try:
        graph_store = GraphStore(root_path, source_path=source_path)
        job_manager = DatabaseJobManager(graph_store)
    except Exception as exc:  # noqa: BLE001
        startup_error = "The AI graph could not be initialized. Check AI_MASTER_DOC_PATH, the seed file, and the database state."
        app.logger.exception("Failed to initialize AI Signal Graph services: %s", exc)

    app.extensions["graph_store"] = graph_store
    app.extensions["job_manager"] = job_manager
    app.extensions["startup_error"] = startup_error

    @app.context_processor
    def inject_globals():
        return {
            "job_state": job_manager.get_state() if job_manager is not None else _default_job_state(),
            "csrf_token": _get_csrf_token,
        }

    @app.before_request
    def protect_post_routes():
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
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
        overview = None
        if graph_store is not None:
            try:
                overview = graph_store.get_dashboard_data()
            except GraphStoreError:
                app.logger.exception("Failed to load overview data for home route.")
        return render_template("home.html", overview=overview)

    @app.get("/graph")
    def dashboard():
        store, _jobs = require_services()
        overview = store.get_dashboard_data()
        return render_template("dashboard.html", overview=overview, fullscreen_shell=True, body_class="body-graph-shell")

    @app.get("/stories")
    def stories():
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

    @app.get("/stories/<story_id>")
    def story_detail(story_id: str):
        _validate_identifier(story_id)
        store, _jobs = require_services()
        story = store.get_story(story_id)
        if story is None:
            abort(404)
        return render_template("story_detail.html", story=story)

    @app.get("/entities")
    def entities():
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

    @app.get("/entities/<entity_id>")
    def entity_detail(entity_id: str):
        _validate_identifier(entity_id)
        store, _jobs = require_services()
        entity = store.get_entity(entity_id)
        if entity is None:
            abort(404)
        return render_template("entity_detail.html", entity=entity)

    @app.post("/actions/reseed")
    def reseed_database():
        _store, jobs = require_services()
        try:
            jobs.start_reseed()
            flash("Rebuilt the AI graph database from the configured source document.", "success")
        except RuntimeError as exc:
            flash(str(exc), "error")
        except GraphStoreError as exc:
            app.logger.exception("Graph reseed failed: %s", exc)
            flash("Failed to rebuild the AI graph database.", "error")
        return redirect(url_for("dashboard"))

    @app.get("/api/overview")
    def api_overview():
        store, jobs = require_services()
        return jsonify(
            {
                "stats": store.get_runtime_stats(),
                "job": jobs.get_state(),
            }
        )

    @app.get("/api/graph")
    def api_graph():
        store, _jobs = require_services()
        return jsonify(store.get_graph_data())

    @app.get("/api/story/<story_id>")
    def api_story(story_id: str):
        _validate_identifier(story_id)
        store, _jobs = require_services()
        story = store.get_story(story_id)
        if story is None:
            abort(404)
        return jsonify(
            {
                "id": story.id,
                "title": story.title,
                "kind": story.kind,
                "status": story.status,
                "event_date": story.event_date,
                "year": story.event_date[:4] if story.event_date else "",
                "summary": story.summary,
                "content_html": story.details_html,
                "tags": story.tags,
                "entities": story.entities,
                "related_stories": story.related_stories,
                "route": url_for("story_detail", story_id=story.id),
            }
        )

    @app.post("/api/rebuild")
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
                    else:
                        yield f"data: {json.dumps({'status': 'error', 'job': snapshot, 'message': snapshot.get('error') or 'Rebuild failed.'})}\n\n"
                    break
                time.sleep(0.35)

        return Response(stream(), mimetype="text/event-stream")

    return app


def _default_job_state() -> dict[str, str | bool | None]:
    return {
        "active": False,
        "job_type": None,
        "started_at": None,
        "finished_at": None,
        "status": "unavailable",
        "error": None,
    }


def _resolve_master_document_path(root_path: Path) -> Path:
    configured = os.getenv("AI_MASTER_DOC_PATH")
    if configured:
        return Path(configured).expanduser()

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
    if token is None:
        token = secrets.token_urlsafe(32)
        session["_csrf_token"] = token
    return token
