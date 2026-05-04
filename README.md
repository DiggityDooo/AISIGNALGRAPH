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
