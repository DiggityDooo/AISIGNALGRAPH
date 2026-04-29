# AI Signal Graph // Parallel Collaboration Contract

This repo is being edited in parallel by Codex and Gemini. This file exists to reduce merge collisions and stop the graph architecture from drifting.

## Source Of Truth

- Graph data semantics live in `webapp/graph_store.py`.
- Graph interaction semantics live in `webapp/static/graph.js`.
- Human-readable architecture and evolution history live in `AISIGNALGRAPH_Technical_Documentation.md`.

If any of those three change in a meaningful way, the corresponding documentation should be updated in the same pass.

## Ownership Split

### Codex

- Backend graph schema and clustering
- `/api/graph` payload contract
- Dense expansion physics
- Integration verification
- Runtime correctness for 2D / 3D switching

### Gemini

- Copy refinement
- Visual polish
- HUD layout refinement
- Non-semantic presentation changes
- Design iteration that does not break graph data contracts

## Hard Rules

- Do not reintroduce a single-center blob layout.
- Do not invent frontend-only fake communities that conflict with backend cluster IDs.
- Do not create duplicate animation loops or duplicate pulse timers.
- Do not change 3D graph structure without preserving the current 2D/3D teardown lifecycle.
- Do not describe behavior in docs that is not actually implemented.

## Before Editing `graph.js`

1. Read the current file first.
2. Check for existing changes from the other agent.
3. Prefer localized edits over full rewrites.
4. Preserve:
   - raw graph vs display graph separation
   - backend `cluster_id` compatibility
   - single animation loop ownership
   - single pulse scheduler ownership

## Before Editing `graph_store.py`

1. Preserve persisted `cluster_id` / `cluster_role`.
2. Keep `/api/graph` fields backward-compatible unless the frontend is updated in the same pass.
3. Re-run rebuild validation after any graph semantic change.

## Required Validation After Semantic Changes

- `python -m compileall app.py webapp`
- `node --check webapp/static/graph.js`
- rebuild the graph data if backend graph logic changed
- verify `/api/graph` still returns valid communities and directed edge semantics

## Current Focus

The current high-priority tuning area is dense local expansion:

- when one selected node reveals `20-30+` visible entities
- top connected nodes should separate clearly
- smaller satellites should still follow strong hubs
- the result should remain readable and still feel like a neural network

## Gemini Handoff

If Gemini needs a short current-status brief with safe edit zones, see `GEMINI_HANDOFF.md`.
