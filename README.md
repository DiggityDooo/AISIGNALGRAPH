# AI Signal Graph

This app is now a local AI knowledge graph, not a scraper UI.

It ignores the old markdown vault, old generated notes, and `scraper.db`.

The application will load its master document from the first valid source in this order:

1. `AI_MASTER_DOC_PATH`
2. `data/ai_master.md`
3. `data/AI_Master_Document_2020_2026.md`
4. the legacy local path used on the original development machine

The generated database lives at `data/ai_graph.db`.

## What it does

- Stores AI stories covering advancements, drama, cheats, policy, and infrastructure.
- Imports the master document into structured stories, entities, keyword hubs, and relationship edges.
- Maps those stories to labs, models, products, risks, people, years, and topic nodes.
- Renders the network as an interactive graph view inspired by Obsidian-style relationship maps with a more fluid force simulation.
- Supports story and entity exploration through server-rendered detail pages.

## Run it

```bash
./venv/bin/python -m pip install -r requirements.txt
export FLASK_SECRET_KEY="$(python - <<'EOF'
import secrets
print(secrets.token_hex(32))
EOF
)"
export AI_MASTER_DOC_PATH="/absolute/path/to/AI_Master_Document_2020_2026.md"
./venv/bin/python app.py
```

Open `http://127.0.0.1:5000`.

## Reset the dataset

Use the `Rebuild from master document` button in the UI, or remove `data/ai_graph.db` and restart the app.

## Import the jobs appendix

To refresh the jobs appendix inside `data/ai_master.md` from the external jobs masterdoc:

```bash
./.venv/bin/python scripts/import_jobs_masterdoc.py /home/seanb/Downloads/Pics/AI_Jobs_Masterdoc.md
```

## Security and reliability changes

- The secret key is no longer hardcoded.
- The master document path is configurable.
- Story markdown is sanitized before rendering.
- The reseed form now uses CSRF protection.
- Three.js is served locally from `webapp/static/vendor`, and the 3D graph now uses an in-app renderer instead of a CDN-dependent wrapper.
- The app returns dedicated `400`, `403`, `404`, `500`, and `503` pages.
