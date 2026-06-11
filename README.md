# AISIGNALGRAPH

The intelligence hub for mapping Artificial Intelligence evolution (2020-present).

AISIGNALGRAPH is a high-performance knowledge graph and intelligence hub that transforms raw AI data into an interactive, navigable ecosystem of stories, entities, and relationships.

## 🚀 Key Features

- **Dimensional Intelligence Hub:** Navigate the AI landscape in both **2D (Sigma.js)** and **3D (Three.js)** modes.
- **Neural 3D Engine:** Immersive, interactive 3D visualization with raycasted node selection, camera "fly-to" logic, and dynamic neighborhood highlighting.
- **Deep Context Mapping:** Connects AI stories (advancements, policy, infrastructure) to labs, models, products, risks, and key figures.
- **Zero-Lag Interface:** Optimized GPU-accelerated interactions with seamless transition between visualization modes.
- **Structured Data Ingestion:** Automatically imports intelligence from a master markdown document into a relational graph database.

## 📁 Data Sources

The application loads its master intelligence from the first valid source in this order:
1. `AI_MASTER_DOC_PATH`
2. `data/ai_master.md`
3. `data/AI_Master_Document_2020_2026.md`

The generated graph database lives at `data/ai_graph.db`.

Non-essential files (screenshots, handoff docs, large reference clones) are stored outside the repo in [`December-2023-stash`](../December-2023-stash/) — see [STASH.md](STASH.md).

## 🛠️ Getting Started

### Prerequisites
- Python 3.x
- Flask

### Installation & Execution
```bash
./venv/bin/python -m pip install -r requirements.txt
export FLASK_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
export AI_MASTER_DOC_PATH="/absolute/path/to/ai_master.md"
./venv/bin/python app.py
```

Open `http://127.0.0.1:5000` to access the hub.

### Home hero (Spline)

The landing page uses a Spline **viewer** scene (liquidring) as a viewport-fixed background via `<spline-viewer>` (CSS void poster until the scene loads). Configure `webapp/static/spline-scene.json` when running Flask (served at `/static/spline-scene.json`; restart Flask after edits). For `next dev`, mirror the same file in `frontend-next/public/spline-scene.json`:

- `viewerUrl` — **required for 3D** — Spline Viewer export (`https://prod.spline.design/.../scene.splinecode`)
- `sceneUrl` — optional public link (`my.spline.design`); used only to derive `viewerUrl` when Viewer export is missing

The viewer is portaled to `document.body` with `position: fixed` and `events-target="local"` so the ring stays put while the page scrolls. Flask CSP must allow `'unsafe-eval'` in `script-src` for the Spline runtime.

Or use `NEXT_PUBLIC_SPLINE_SCENE_URL` in `frontend-next/.env.local`, then rebuild:

```bash
cd frontend-next
npm run build:hub
```

### Frontend dev (`next dev`)

The Next.js app lives in `frontend-next/`. List pages (`/stories`, `/entities`) and the graph call `/api/*`; in dev, `next.config.ts` rewrites those requests to Flask on **`http://localhost:8080`**. Start the backend before `next dev`, or Stories/Entities will show the API-unavailable empty state.

```bash
# Terminal 1 — API + SQLite graph
./venv/bin/python app.py          # listens on :8080

# Terminal 2 — Next.js UI
cd frontend-next
npm install
npm run dev                       # http://localhost:3000
```

**Scroll:** site-wide smooth scroll uses [Lenis](https://github.com/darkroomengineering/lenis) (`ReactLenis` root + `lenis/dist/lenis.css`). The graph page sets `data-lenis-prevent` so wheel events stay on the canvas. Compact list-page heroes use `pointer-events-auto` so wheel scroll reaches Lenis.

**List pages:** Stories and Entities show skeleton loaders, retry on API failure, and paginated “load more” (48 items per batch). Back-to-top uses Lenis `scrollTo(0)` when available.

**Graph performance:** the Sigma animation loop pauses when idle or the tab is hidden; window resize is throttled; signal-canvas work is skipped when `maxSignals` is 0.

Production still ships via `npm run build:hub` into `webapp/static/hub/` (static export served by Flask).

## 🤖 Daily Scraper (Cloud Run Job + GCS)

Serverless ingestion pipeline in `scraper/`:

| Layer | Module | Role |
|-------|--------|------|
| Security | `scraper/security/` | HTTPS-only allowlist, blocklist, rate limits, bleach sanitizer |
| Extract | `scraper/extractor.py` | **Google Gemini** (`gemini-3.1-flash-lite`, JSON-mode, 12 RPM cap) |
| Store | `scraper/storage.py` | `ai_stories.json` + `scrape_state.json` → **GCS** or local `data/` |
| Run | `scraper/daily_scrape.py` | RSS orchestrator (Cloud Run Job entrypoint) |
| Seed | `scraper/historical_ingest.py` | 1956–2010 corpus + optional Wayback backfill |
| Load | `webapp/loader.py` | GCS/local JSON → SQLite on app startup |
| Schema | `webapp/migrations/` | Auto-applied via `webapp/db.py` |

**Production flow:** Cloud Scheduler → Cloud Run Job (`Dockerfile.scraper`) → GCS bucket → Flask reads bucket at boot.

**Schedule (production):** four short runs per day — **02:00, 08:00, 14:00, and 20:00 UTC** (`0 2,8,14,20 * * *`). Each execution is capped at **15 minutes**; Gemini extractions are rate-limited to **12 requests/minute** (free-tier headroom). A stale-run lock skips overlapping triggers if a prior run started within the last 30 minutes.

**Deploy (one-shot):**

```bash
# Prereq: gcloud auth + gemini-api-key in Secret Manager (see Secrets below)
bash deploy_scraper.sh
```

**Local dev:**

```bash
cp .env.example .env          # never commit .env
# Edit .env — set GEMINI_API_KEY (leave STORIES_BUCKET empty for local files)
pip install -r requirements-scraper.txt
python -m scraper.daily_scrape
python -m scraper.historical_ingest   # optional; SKIP_WAYBACK=1 for seed only
```

**New API endpoints:** `/api/graph/era/<era>`, `/api/graph/year-range?from=&to=`,
`/api/stories/search?q=` (FTS5), `/api/stats`.

Full v2 spec: [AISIGNALGRAPH_Fable_Prompt.md](AISIGNALGRAPH_Fable_Prompt.md).

## 🔄 Dataset Management

- **Rebuild:** Use the `REBUILD` button in the UI to re-ingest data from the master document.
- **Reset:** Manually delete `data/ai_graph.db` and restart to wipe the state.
- **Jobs Import:** Sync external labor market data using:
  ```bash
  ./.venv/bin/python scripts/import_jobs_masterdoc.py /path/to/jobs_masterdoc.md
  ```

## 🛡️ Security & Integrity

- **Environment-Safe:** Configurable document paths and dynamic secret keys.
- **Sanitized UI:** All markdown and HTML content is sanitized before rendering.
- **Robustness:** Custom error handling for 40x and 50x states.
- **Performance:** Native WebGL-accelerated rendering for high-density networks.

### Secrets & credentials (do not commit)

| Secret | Local | Production |
|--------|-------|--------------|
| `GEMINI_API_KEY` | `.env` (gitignored) | GCP Secret Manager `gemini-api-key` → job env |
| `FLASK_SECRET_KEY` | `.env` | Cloud Run secret `flask-secret-key` |
| `STORIES_BUCKET` | unset = `data/` files | `PROJECT-aisignal-stories` GCS bucket |

**Gitignored:** `.env`, `.env.*`, `data/ai_stories.json`, `data/scrape_state.json` (local scrape output).

**Safe to commit:** `.env.example` (placeholders only), `deploy_scraper.sh` (references secret *names*, not values).

Create Gemini secret once:

```bash
echo -n "YOUR_KEY" | gcloud secrets create gemini-api-key --data-file=-
```

Never put real API keys in source, README, or git history.
