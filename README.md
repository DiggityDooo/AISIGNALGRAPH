# AISIGNALGRAPH

AISIGNALGRAPH is an intelligence graph platform that ingests AI news and history, stores structured stories/entities/links, and serves interactive graph experiences for exploration.

## What the application does

- Scrapes and extracts AI-related stories from RSS/news sources (`scraper/`).
- Seeds and maintains a SQLite knowledge graph (`data/ai_graph.db`).
- Serves API endpoints and pages through Flask (`webapp/`, `app.py`).
- Renders a modern graph UI in Next.js, exported into Flask static assets (`frontend-next/`).

## Primary use cases

- **Track AI ecosystem change**: labs, models, policy, infrastructure, and safety developments.
- **Explore relationships**: move from broad graph clusters to specific stories/entities.
- **Investigate timelines**: filter graph data by era and year range.
- **Operational monitoring**: check ingest/health/status endpoints for data freshness.

## Graph experiences

The `/graph` experience supports multiple modes:

1. **Lattice (default)**  
   Full-corpus exploratory view (Sigma/WebGL) with filtering, node selection, focus links, and optional 3D mode.

2. **Tree**  
   Progressive hierarchical reading mode (top-to-bottom), designed to start compact and expand by user interaction.

3. **Flow**  
   Progressive relationship reading mode (left-to-right), using the same progressive model as Tree with different orientation.

4. **Prototype route**  
   `/graph/prototype` keeps an older prototype runtime behind a feature flag (`GRAPH_PROTOTYPE_ENABLED`).

## High-level architecture

1. **Ingestion layer (`scraper/`)**
   - `daily_scrape.py`: end-to-end scrape orchestrator.
   - `extractor.py`: story extraction/classification.
   - `security/`: URL/content validation, sanitization, and rate limiting.
   - `storage.py`: persistence for scraped stories/state.

2. **Backend layer (`webapp/`)**
   - `__init__.py`: app factory, routes, security headers/CSRF/rate limits.
   - `graph_store.py`: core graph load/seed/query logic.
   - `routes/api.py`: API v2 endpoints (`/api/graph/era/*`, `/api/stories/search`, `/api/stats`, etc.).
   - `loader.py` + `db.py`: migration and startup ingest helpers.

3. **Frontend layer (`frontend-next/`)**
   - `src/app/`: pages (`/`, `/graph`, `/stories`, `/entities`).
   - `src/components/visualization/`: Lattice/Tree/Flow rendering components.
   - `src/hooks/`: graph filters/data/progressive graph hooks.
   - `src/lib/graphFlow/`: graph transforms, layout, seed/navigation behavior.

## Codebase breakdown

| Path | Purpose |
|---|---|
| `/home/runner/work/AISIGNALGRAPH/AISIGNALGRAPH/app.py` | Flask entrypoint |
| `/home/runner/work/AISIGNALGRAPH/AISIGNALGRAPH/webapp/` | Backend app, API, graph services |
| `/home/runner/work/AISIGNALGRAPH/AISIGNALGRAPH/scraper/` | Data ingestion + extraction pipeline |
| `/home/runner/work/AISIGNALGRAPH/AISIGNALGRAPH/frontend-next/` | Next.js graph UI |
| `/home/runner/work/AISIGNALGRAPH/AISIGNALGRAPH/tests/` | Backend + scraper test suite |
| `/home/runner/work/AISIGNALGRAPH/AISIGNALGRAPH/data/` | SQLite DB and seed data |
| `/home/runner/work/AISIGNALGRAPH/AISIGNALGRAPH/docs/` | Graph behavior references and agent notes |
| `/home/runner/work/AISIGNALGRAPH/AISIGNALGRAPH/Dockerfile` | Main app image build/deploy |
| `/home/runner/work/AISIGNALGRAPH/AISIGNALGRAPH/Dockerfile.scraper` | Cloud Run Job scraper image |

## API overview (selected)

- `GET /api/overview` — runtime stats + job state
- `GET /api/health` — service/db/source health report
- `GET /api/graph` — primary graph payload
- `GET /api/graph/era/<era_name>` — graph by era
- `GET /api/graph/year-range?from=YYYY&to=YYYY` — graph by year window
- `GET /api/stories` / `GET /api/entities` — list endpoints
- `GET /api/stories/search?q=...` — full text search
- `POST /api/rebuild` — trigger reseed/rebuild stream

## Local development

### Backend

```bash
cd /home/runner/work/AISIGNALGRAPH/AISIGNALGRAPH
python -m pip install -r requirements.txt
python app.py
```

### Frontend

```bash
cd /home/runner/work/AISIGNALGRAPH/AISIGNALGRAPH/frontend-next
npm install
npm run dev
```

To build static frontend output into Flask:

```bash
cd /home/runner/work/AISIGNALGRAPH/AISIGNALGRAPH/frontend-next
npm run build:hub
```

## Testing

### Python tests

```bash
cd /home/runner/work/AISIGNALGRAPH/AISIGNALGRAPH
pytest
```

### Frontend checks

```bash
cd /home/runner/work/AISIGNALGRAPH/AISIGNALGRAPH/frontend-next
npm run lint
npm test
```

## Deployment

- Main service: containerized Flask + built Next static assets (`Dockerfile`), deployed via Cloud Build/Cloud Run (`cloudbuild.yaml`).
- Scraper: separate Cloud Run Job image (`Dockerfile.scraper`) running `python -m scraper.daily_scrape`.

