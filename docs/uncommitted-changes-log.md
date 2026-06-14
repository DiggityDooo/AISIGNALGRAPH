# Uncommitted Changes Log

> Generated: **2026-06-14T21:28:34Z**  
> Branch: **main**  
> HEAD: **6aaefdd** - *Address graph code review: merge Flow/Tree, fix lint, dead code, layout guards.*

## Summary

The worktree contains the graph-flow implementation for contract success criteria
SC-1 through SC-6, its tests, a rebuilt static hub, and unrelated pre-existing
changes. Current porcelain status contains 63 modified/added tracked entries,
41 deleted tracked entries (mostly replaced content-hashed hub chunks), and 67
untracked files.

## Implemented

### Graph flow

- Added glass document-card styling with type-specific accent glow.
- Added animated signal edges with importance-based speed and distinct cyclic
  edge rendering.
- Replaced recursive graph conversion with an iterative acyclic spanning forest.
  Multi-parent, back, and cross edges are retained as cyclic edges.
- Added progressive disclosure for the flow and tree layouts.
- Added content-aware graph fingerprints and a bounded layout cache whose keys
  include edge endpoints.

Primary files:

- `frontend-next/src/components/visualization/SignalCardGraph.tsx`
- `frontend-next/src/components/visualization/flow/DocumentCardNode.tsx`
- `frontend-next/src/components/visualization/flow/SignalEdge.tsx`
- `frontend-next/src/hooks/useProgressiveGraph.ts`
- `frontend-next/src/lib/graphFlow/graphTransform.ts`
- `frontend-next/src/lib/graphFlow/graphFingerprint.ts`
- `frontend-next/src/lib/graphFlow/layoutUtils.ts`
- `frontend-next/src/lib/graphFlow/nodeColors.ts`

### Worker path

- Graph transforms move to a module worker for payloads with at least 80 nodes.
- Worker responses are matched to the exact payload and revision.
- Abort, load-error, unreadable-message, post-message failure, unmount cleanup,
  worker termination, and synchronous fallback paths are handled.
- The worker and graph conversion are iterative, including a 12,000-node depth
  regression test.

Primary files:

- `frontend-next/src/hooks/useDataTransformer.ts`
- `frontend-next/src/hooks/useProgressiveGraph.ts`
- `frontend-next/src/lib/graphFlow/graphTransform.worker.ts`
- `frontend-next/src/lib/graphFlow/graphTransformTypes.ts`

### Lattice focus

- Flow nodes link to `/graph?focus=<node>&mode=3d`.
- The graph reads URL focus state after scene creation, enters 3D mode, selects
  the requested node, updates the detail panel, and animates the camera.
- The Three.js module is retained in graph state so fly-to animation can run.

Primary files:

- `frontend-next/src/lib/graphFlow/latticeBridge.ts`
- `frontend-next/src/components/visualization/flow/DocumentCardNode.tsx`
- `frontend-next/src/app/graph/graph.js`

### Build and test hygiene

- Restored strict TypeScript and production build checks.
- Added missing browser globals and JSX declarations.
- Moved Playwright reports and results under ignored `.playwright/` paths.
- Removed zero-byte graph-flow placeholders.
- Rebuilt `webapp/static/hub/` with content-hashed production assets.

## Success Criteria

| ID | Requirement | Status |
| --- | --- | --- |
| SC-1 | Glass nodes and type glow | Done |
| SC-2 | Animated signal edges | Done |
| SC-3 | Cyclic edge detection and rendering | Done |
| SC-4 | View in Lattice 3D fly-to | Done |
| SC-5 | Worker graph transforms for large payloads | Done |
| SC-6 | Fingerprinted Dagre layout memoization | Done |

## Verification

All final checks passed on June 14, 2026:

- `npm run lint`
- `npx tsc --noEmit --pretty false`
- `npx --yes tsx --test src/lib/graphFlow/*.test.mjs` - 18 tests passed
- `NEXT_PUBLIC_GRAPH_FLOW=1 npm run build:hub`
- Focused Chromium E2E against Next dev - 1 test passed
- Focused Chromium E2E against Flask-served static export - 1 test passed
- Exported `/graph/flow`, graph API, and compiled worker assets returned HTTP 200
- `git diff --check`

The focused E2E verifies flow-node navigation, encoded URL focus state, 3D mode,
a nonblank Three.js canvas, selected-node detail content, and no page or console
errors.

## Worktree Caveats

These changes were already present or are outside the graph-flow fix scope and
were not reverted:

- `data/ai_graph.db` is modified.
- `ReactTree/react-d3-tree` has submodule-local changes.
- Two tracked planning documents are deleted.
- `.cursor/`, `.cursor-progress.json`, `contract.json`, and demo artifacts are
  untracked.
- `webapp/static/hub/` contains the expected old-hash deletions and new-hash
  additions from the static export rebuild.
