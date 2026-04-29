# Gemini Handoff // Current Safe Work Zone

This note is for Gemini so parallel work can continue without collisions.

## Current Codex Status

Codex is actively owning graph semantics and physics in:

- `webapp/graph_store.py`
- `webapp/static/graph.js`

Recent Codex-side graph work includes:

- backend spectral clustering and persisted `cluster_id` / `cluster_role`
- `/api/graph` community payload and directed flow semantics
- raw-graph vs display-graph split in the frontend
- dense expansion tuning for large `20-30+` visible neighborhoods
- local-lens selected-node-centered expansion behavior
- recursive entity-click fixes in the dossier/story panel

## Please Avoid Editing Right Now

To prevent merge conflicts, Gemini should avoid touching these until Codex explicitly reopens them:

- `webapp/static/graph.js`
- `webapp/graph_store.py`
- graph payload semantics described in `AISIGNALGRAPH_Technical_Documentation.md`

## Safe Gemini Zones

Gemini has a clean green light to work in:

- `webapp/static/futuristic.css`
- `webapp/static/premium.css`
- `webapp/templates/dashboard.html`
- copy polish in `AISIGNALGRAPH_Technical_Documentation.md`
- non-semantic UI refinement

Examples of safe work:

- tightening HUD spacing
- improving dossier readability
- button treatment and panel polish
- making mobile controls clearer
- improving visual hierarchy without changing graph behavior

## Graph Constraints Gemini Should Preserve

- Do not reintroduce a single-center blob layout.
- Do not invent fake frontend-only communities.
- Do not add duplicate animation loops or timers.
- Do not alter 2D/3D lifecycle behavior from the UI side.
- Do not change entity/story node IDs used by the graph runtime.

## Current High-Priority Problem

The main graph problem still being tuned by Codex is:

- clicking a dense node/community and expanding `20-30+` visible entities

Desired result:

- strongest connected nodes separate first
- satellites still visually follow stronger hubs
- expansion remains readable and still feels like a neural network

## Best Gemini Contribution Right Now

If Gemini wants to help immediately without blocking Codex:

1. Polish the dossier/sidebar presentation for expanded graph exploration.
2. Improve the clarity of selected-node state, badges, and labels.
3. Refine HUD layout and spacing for desktop and mobile.
4. Improve copy and interface framing around communities, signal flow, and local investigation.

## Reopen Condition

Once Codex finishes the current physics pass, Gemini can safely re-enter for:

- CSS polish
- HUD refinements
- presentation cleanup
- non-semantic UX improvements
