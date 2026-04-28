from pathlib import Path

from flask import Flask, flash, jsonify, redirect, render_template, request, url_for

from .graph_store import GraphStore
from .jobs import DatabaseJobManager


def create_app() -> Flask:
    root_path = Path(__file__).resolve().parent.parent

    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config["SECRET_KEY"] = "local-dev-secret"
    app.config["ROOT_PATH"] = root_path

    graph_store = GraphStore(root_path)
    job_manager = DatabaseJobManager(graph_store)

    app.extensions["graph_store"] = graph_store
    app.extensions["job_manager"] = job_manager

    @app.context_processor
    def inject_globals():
        return {
            "job_state": job_manager.get_state(),
        }

    @app.get("/")
    @app.get("/graph")
    def dashboard():
        overview = graph_store.get_dashboard_data()
        return render_template("dashboard.html", overview=overview)

    @app.get("/stories")
    def stories():
        q = request.args.get("q", "").strip()
        kind = request.args.get("kind", "").strip()
        tag = request.args.get("tag", "").strip()
        status = request.args.get("status", "").strip()

        results = graph_store.list_stories(q=q, kind=kind or None, tag=tag or None, status=status or None)
        filters = graph_store.get_story_filters()
        return render_template(
            "stories.html",
            stories=results,
            filters=filters,
            active={"q": q, "kind": kind, "tag": tag, "status": status},
        )

    @app.get("/stories/<story_id>")
    def story_detail(story_id: str):
        story = graph_store.get_story(story_id)
        if story is None:
            return render_template("404.html"), 404
        return render_template("story_detail.html", story=story)

    @app.get("/entities")
    def entities():
        q = request.args.get("q", "").strip()
        entity_type = request.args.get("type", "").strip()
        items = graph_store.list_entities(q=q, entity_type=entity_type or None)
        return render_template(
            "entities.html",
            entities=items,
            filters=graph_store.get_entity_filters(),
            active={"q": q, "type": entity_type},
        )

    @app.get("/entities/<entity_id>")
    def entity_detail(entity_id: str):
        entity = graph_store.get_entity(entity_id)
        if entity is None:
            return render_template("404.html"), 404
        return render_template("entity_detail.html", entity=entity)

    @app.post("/actions/reseed")
    def reseed_database():
        try:
            job_manager.start_reseed()
            flash("Rebuilt the AI graph database from the local seed set.", "success")
        except RuntimeError as exc:
            flash(str(exc), "error")
        return redirect(url_for("dashboard"))

    @app.get("/api/overview")
    def api_overview():
        return jsonify(
            {
                "stats": graph_store.get_runtime_stats(),
                "job": job_manager.get_state(),
            }
        )

    @app.get("/api/graph")
    def api_graph():
        return jsonify(graph_store.get_graph_data())

    return app
