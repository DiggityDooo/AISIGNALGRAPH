# AI Signal Graph // Technical Documentation & Evolution Log

## 1. Project Overview

**AI Signal Graph** is a high-fidelity intelligence discovery platform for exploring relationships between AI stories, entities, infrastructure players, models, people, and risk signals. The system is designed to behave like a readable neural map rather than a flat force-graph blob.

### Core Architecture

- **Backend**: Python / Flask for ingestion, graph construction, clustering, SQLite persistence, and API delivery.
- **2D Visuals**: Custom D3.js with SVG + Canvas split rendering for interactive, high-node-count graph exploration.
- **3D Visuals**: Three.js + `3d-force-graph` for DAG-oriented hierarchical views.
- **Aesthetic**: "Intelligence Protocol" red-on-black interface with glass HUD panels, monospaced controls, and structured dashboard chrome.

### Current Graph Model

- **Persistence**: Graph data is stored in SQLite with `stories`, `entities`, relationship tables, and persisted `cluster_id` / `cluster_role` metadata.
- **Community Detection**: Spectral clustering runs server-side with `numpy` and `scikit-learn`, then writes deterministic community IDs back to SQLite during rebuilds.
- **API Contract**: `/api/graph` returns raw nodes, raw edges, a `communities` array, timeline metadata, directed flow semantics, and derived degree fields.
- **Display Strategy**: The frontend consumes the raw graph and derives multiple display graphs depending on lens and expansion state.

---

## 2. Recent Architectural Evolution

The platform has moved from a prototype-style force layout into a structured intelligence graph with explicit clustering, directed flow, and lens-aware display logic.

### Phase 1: Premium Interface Redesign

**Problem**: The original look leaned too heavily on generic neon-tech styling and did not read like a disciplined intelligence product.

**Implemented**:

- Unified the interface around a red-scale palette centered on `#ff304c`.
- Standardized HUD composition, glass panels, and tighter screen use for the graph surface.
- Shifted graph controls, badges, and headings to more operational dashboard language.

### Phase 2: Backend Community Intelligence

**Problem**: The graph was frontend-heavy and lacked a reliable structural model for grouping related areas of the network.

**Implemented**:

- Added backend spectral clustering over non-year nodes using weighted `mentions`, `context`, and `co-mentioned` edges.
- Persisted `cluster_id` and `cluster_role` directly on `stories` and `entities`.
- Extended `/api/graph` with:
  - `cluster_id`
  - `cluster_role`
  - `layer_index`
  - `month_index`
  - `in_degree` / `out_degree`
  - `directed`
  - `flow_kind`
  - `weight_norm`
  - top-level `communities`
- Added real `timeline` edges so `year -> story` is explicit in both 2D and 3D modes.

### Phase 3: Community-Aware Display Graphs

**Problem**: A raw-node-only graph quickly became unreadable at scale, especially when zoomed out.

**Implemented**:

- Split the frontend into two conceptual layers:
  - **Raw graph** from `/api/graph`
  - **Display graph** derived from the active lens and current expansion state
- Added aggregated **community supernodes** for zoomed-out readability.
- Added expansion behavior where specific communities can open while the rest remain collapsed.
- Introduced lens-aware graph modes:
  - `global`
  - `local`
  - `chronological`
  - `signal`
  - `orphans`
  - `clusters`

### Phase 4: Directed Neural-Flow Behavior

**Problem**: The graph needed to read like signal propagation, not just connected circles.

**Implemented**:

- Restricted normal pulse propagation to directed flow edges by default.
- Added attention buildup on nodes and communities to create regional activation.
- Preserved support edges as secondary structure rather than the dominant visual backbone.
- Added `SUPPORT PATHS` behavior for local investigation of second-hop support neighborhoods.

### Phase 5: Dense Expansion Stabilization

**Problem**: Clicking into a node or community with `20-30+` visible entities created clutter, overlap, and lag spikes.

**Current Direction**:

- Large visible expansions are now ranked by connection count inside their local community slice.
- The most-connected nodes are treated as **primary anchors**.
- The next layer becomes **secondary orbit nodes**.
- Smaller nodes follow the nearest strong local leader rather than collapsing into one shared center.
- Cross-community spacing is moderated so clusters stay distinct without flying too far apart.
- Dense expansions still preserve a neural-network feel by keeping satellites visually tethered to stronger hubs.

This is the area most likely to keep evolving as Gemini and Codex continue tuning node spacing and local expansion behavior.

### Phase 6: 3D DAG Rebuild

**Problem**: Earlier 3D views read more like a novelty sphere than a meaningful analytical structure.

**Implemented**:

- Rebuilt 3D around the same raw/display graph metadata as 2D.
- Uses:
  - `dagMode('td')` for chronological views
  - `dagMode('radialout')` for non-chronological views
- Keeps 3D focused on directed DAG edges and avoids forcing undirected support links into the hierarchy.
- Stops 2D simulation and animation loops before mounting 3D to avoid duplicate runtime work.

### Phase 7: Runtime and QoL

**Problem**: Force simulations, pulse loops, and repeated mode switches can silently create performance problems.

**Implemented**:

- Added explicit ownership of:
  - one animation loop
  - one pulse interval
  - one active D3 simulation
- Added keyboard shortcuts:
  - `Space`: Pause / resume
  - `F`: Fit graph
  - `Esc`: Clear selection
- Added mobile HUD toggles for filters and dossier panels.

---

## 3. System Notes for Ongoing Maintenance

### Backend Truth

- `webapp/graph_store.py` is the source of truth for clustering, graph payload shape, and timeline/community semantics.
- If clustering logic changes, `/api/graph` and frontend display assumptions must be updated together.
- Year nodes are timeline anchors, not community members.

### Frontend Truth

- `webapp/static/graph.js` owns display-graph derivation, lens behavior, pulse routing, and 2D/3D lifecycle switching.
- The frontend should not invent community structure on its own; it should consume backend community metadata.
- Any "de-blobbing" work must preserve:
  - community readability
  - directed flow legibility
  - stable local expansion behavior

### Current Known Tension

The most fragile part of the system is **dense local expansion**. There is an inherent tradeoff between:

- stronger separation for high-degree nodes
- keeping satellites visually close enough to feel connected
- avoiding lag from over-aggressive force parameters

Any future tuning should be measured specifically against the "click one dense node and inspect 20-30 entities" case.

---

## 4. Parallel Collaboration Protocol (Codex + Gemini)

Codex cannot directly communicate with Gemini inside the model runtime, so coordination needs to happen through the repo and explicit file ownership.

The repo-level operational version of this protocol lives in `COLLABORATION.md`.

### Shared Rules

- Treat this document as the human-readable system contract.
- Do not describe behavior here that is not actually implemented.
- If one agent changes graph semantics, the same agent should update this document in the same pass.
- Avoid silent reintroduction of outdated concepts such as:
  - single-center blob layouts
  - frontend-only fake clustering
  - disconnected 3D behavior that ignores the 2D graph contract

### Suggested Work Split

- **Codex-owned zones**:
  - backend graph semantics
  - API payload structure
  - dense expansion physics tuning
  - integration verification
- **Gemini-owned zones**:
  - copy polish
  - presentation refinements
  - visual tuning that does not alter graph data semantics
  - UI layout adjustments around the graph shell

### Merge Safety

- Before editing `webapp/static/graph.js`, inspect the current file instead of assuming previous behavior.
- Prefer additive or localized edits over full rewrites unless the architecture truly changed.
- If both agents touch `graph.js`, the final merge should preserve:
  - backend community model compatibility
  - single animation loop ownership
  - single pulse scheduler ownership
  - 2D/3D mode teardown correctness

---

## 5. Next Steps

- **Dense Expansion Tuning**: Keep improving the "clicked node with many children" behavior so primary hubs separate clearly while satellites remain attached and readable.
- **Web Worker Offload**: Move more layout or preprocessing work off the main thread for larger graphs.
- **Dossier Depth**: Expand the right-hand inspector for deeper recursive entity navigation.
- **Verification Discipline**: Continue checking both SQLite truth and `/api/graph` output whenever graph semantics change.
