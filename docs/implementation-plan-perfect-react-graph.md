# Implementation Plan: Perfect React Graph

> **Notion:** Share any page with integration **CursorLocalMCP**, then import this doc.

## Routes

- **`/graph`** — stable production graph (public)
- **`/graph/prototype`** — React HUD prototype (**404 unless `GRAPH_PROTOTYPE_ENABLED=true`**)

## Phase 3 — Performance engine ✅

- [x] `SpatialIndex` octree + `FrustumCuller`
- [x] `NodeRenderer` InstancedMesh per type
- [x] `EdgeRenderer` batched LineSegments
- [x] `LODManager` distance-based scale
- [x] `LabelAtlas` canvas atlas + sprites
- [x] `LayoutWorker` off-thread force layout + localStorage cache
- [x] `GraphEngine` orchestrator wired in `build3DScene` (legacy fallback retained)

## Phase 4 — Backend APIs ✅

- [x] FTS `/api/stories/search` augments graph search
- [x] Rebuild → `POST /api/rebuild` (SSE) + reload
- [x] `GET /api/graph/era/<era>` — GraphStore legacy shape
- [x] `GET /api/graph/year-range?from=&to=` — GraphStore legacy shape
- [x] Client `resolveGraphFetch` + era dropdown in HUD

## Phase 5 — Test + polish ✅

- [x] Playwright `graph-interactions.spec.ts`
- [x] Keyboard: `/` `F` `3` `E` JSON · `Shift+E` PNG
- [x] Unit tests `src/lib/graph/filters.test.mjs`
- [x] `Scene.tsx` lint fix

## Phase 6 — Optional (not started)

- Breadcrumbs, graph diff, full R3F rewrite, WebGPU
