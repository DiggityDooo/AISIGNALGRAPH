# AISIGNALGRAPH

An interactive AI knowledge-graph web app: a Flask backend (`app.py` → `webapp/`) serving a REST API + UI over a pre-seeded SQLite graph DB, an optional Next.js "hub" frontend (`frontend-next/`), and an optional Gemini-powered scraper (`scraper/`). See `README.md` for full architecture.

## Cursor Cloud specific instructions

The startup update script provisions a Python virtualenv at `/workspace/venv` (gitignored) and installs `frontend-next` npm deps. Standard run/lint/test/build commands live in `README.md` and `frontend-next/package.json`; notes below are only the non-obvious caveats.

### Backend (Flask) — core service, required
- Run with the venv: `./venv/bin/python app.py`. It serves on **port 8080** (the README's mention of `5000` is stale; `app.py`/`.env.example` use 8080).
- DB migrations and seed loading happen automatically on startup; `data/ai_graph.db` is committed and pre-seeded, so the graph has data immediately — no scraper run or external services needed.
- No secrets are required to run the web app. `FLASK_SECRET_KEY` auto-generates (logs a warning if unset); set it only for stable sessions.

### Frontend (Next.js) — optional, dev only
- `cd frontend-next && npm run dev` serves on **port 3000** and proxies `/api/*` → Flask `http://127.0.0.1:8080`, so the Flask backend must be running for the dev UI's data to load. In production the frontend is pre-built into `webapp/static/hub` and served by Flask.
- This is a Next.js canary (`16.3.0-canary.16`); see `frontend-next/AGENTS.md`.
- `npm run lint` currently reports pre-existing errors in `src/components/webgl/Scene.tsx` (`react-hooks/immutability`). The Next build ignores lint/TS errors (`ignoreDuringBuilds`/`ignoreBuildErrors`), so these do not block `npm run build`.

### Tests
- `./venv/bin/python -m pytest` (run from repo root). The extractor/security tests import scraper-only deps (`google-genai`, `tldextract`), so both `requirements.txt` and `requirements-scraper.txt` must be installed — the update script installs both.
- Frontend E2E (`npm run test:e2e`) uses Playwright whose `webServer` is hardcoded to `../venv/bin/python ../app.py`, which is why the venv lives at `/workspace/venv`. Use `PLAYWRIGHT_SKIP_SERVER=1` if Flask is already running.

### Scraper — optional
- Requires a real `GEMINI_API_KEY` and network access; leave `STORIES_BUCKET` empty to write to local `data/` instead of GCS. Not needed for the core app.
