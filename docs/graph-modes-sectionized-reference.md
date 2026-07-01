# AISIGNALGRAPH Graph Modes — Sectionized Reference

> For Claude/agents editing graph behavior in `/graph/flow`.
> Keep these modes separate. They are intentionally different.
>
> **Startup seeds / hub children:** see `docs/claude-graph-navigation-seeds-plan.md` — that doc explains why orphan stories (e.g. Junior Software Engineer) must not be first-level hub cards and how Timeline / Organizations / Themes sections should work.

---

## LATTICE Mode (SigmaLatticeGraph)

### Purpose
- Exploratory, full-corpus constellation view — every live node/edge at once,
  same engine `/graph` uses, embedded in React.
- Good for scanning global structure and jumping to interesting clusters.

### Runtime
- Page: `frontend-next/src/app/graph/page.tsx` — Lattice is the default view;
  legacy `graph.js` / `GraphRuntime` production path removed (prototype copy
  kept under `app/graph/prototype/`).
- HUD: `GraphHud` + `useGraphFilters` + `latticeFilters.ts` (search, lens,
  node-type filters, era/year timeline, detail pane).
- Component: `SigmaLatticeGraph` (2D) / `Lattice3DScene` (inline 3D toggle).
- Renderer: `sigma` (WebGL) over a `graphology` graph built from the filtered
  `/api/graph` payload — no cap, no progressive disclosure. SVG/D3-force
  (the old `ForceTree`) couldn't hold the full corpus at interactive
  framerate past a few hundred nodes; WebGL can.
- Layout: `graphology-layout-forceatlas2`, run once (bounded iterations) on
  mount, not a continuous per-frame simulation — the "run quick" lever is
  not re-laying-out every frame, not the renderer.
- Sizing/coloring: reused from `nodeSizing.ts` (`degreeBasedSize`/
  `computeDegrees`) and `nodeColors.ts` (`accentForType`/`nodeTypeOf`) — same
  helpers Tree/Flow use, so Lattice stays visually consistent with them.
- Interaction: click a node to highlight it + its direct neighbors (dims
  everything else) and open the HUD detail pane. Double-click uses Sigma's
  native zoom-toward-click. Inline **3D** toggle (`Lattice3DScene` /
  `GraphEngine`) replaces the old separate Graph mode. Deep links from Flow
  still use `buildLatticeFocusHref` (`?focus=…&mode=3d`).

### Expected first paint
- Shows the entire live corpus, not a curated subset — this mode is
  intentionally NOT progressive-disclosure like Tree/Flow.

### Guardrails
- Do not force Lattice constraints onto Tree/Flow, or vice versa.
- Do not give Lattice a seed-count/fan-out cap — full corpus is the point.
- Keep Lattice as the exploratory, full-graph mode; Tree/Flow are
  progressive card modes.

---

## TREE Mode (ProgressiveTreeGraph)

### Purpose
- Hierarchical reading mode.
- Should start compact and unfold level-by-level.

### Runtime
- Component: `ProgressiveTreeGraph`
- Hook: `useProgressiveGraph`
- Layout: `getLayoutedElements(..., "tree")` (`TB`, top-to-bottom)
- Interaction: double-tap node to expand/collapse via `onToggleExpand`
- Seed default from route: `initialSeedCount={3}`

### Expected first paint (strict)
- Must start small.
- Target: hub + 3 top branches (roughly 4-7 visible cards).
- No grandchildren until user expands a branch.

### Required state model
- `seedIds` should be `[SYNTHETIC_ROOT_ID]`.
- `expandedIds` should start hub-only.
- Visibility should come from progressive traversal (`computeVisibleIds`) and user expansion.

### "Too massive" failure
- If first paint shows long rows of many branches or grandchildren, defaults are wrong.
- Primary place to verify: `useProgressiveGraph.ts` initialization behavior.

---

## FLOW Mode (SignalCardGraph)

### Purpose
- Relationship reading mode in left-to-right direction.
- Should be compact like Tree, but oriented as a flow.

### Runtime
- Component: `SignalCardGraph`
- Hook: `useProgressiveGraph` (same as Tree)
- Layout: `getLayoutedElements(..., "flow")` (`LR`, left-to-right)
- Interaction: double-tap expand/collapse via `onToggleExpand`
- Seed default from route: `initialSeedCount={3}` (fan-out per section — see navigation seeds plan)

### Expected first paint (strict)
- Same navigation as Tree: hub + 3 **section** cards (Timeline, Organizations, Themes).
- Not orphan stories. Not 20+ card dump.
- Grow only as user expands.

### Status
- Navigation sections landed (`navigationSeeds.ts`) — hub children are
  Timeline/Organizations/Themes, not `pickSeedIds(index.rootIds)`. See
  `claude-graph-navigation-seeds-plan.md` for the full history/rationale.

---

## Shared Rules Across Modes

- Shared card shell components are fine (`CardGraphCanvas`, `DocumentCardNode`), but behavior per mode is different.
- Header counts:
  - `INDEXED` = full corpus
  - `VISIBLE` = current on-screen subset
- Do not equate "all indexed" with "show all now."

---

## Acceptance Checks (Mode-Specific)

### Lattice
- Exploratory cluster appears and remains navigable.
- Not required to look like Tree/Flow hierarchy.

### Tree
- First paint <= 7 visible cards.
- No grandchildren before user expansion.
- Double-tap expand/collapse is stable and reversible.

### Flow
- First paint should be compact (Tree-like density, LR orientation).
- Avoid first-paint wall of cards/edges.
- Progressive behavior should be explicit and intentional if implemented.

---

## Quick "Do / Do Not" Matrix

| Mode | Do | Do Not |
|---|---|---|
| LATTICE | Keep exploratory and broader | Force strict Tree startup limits |
| TREE | Start tiny, reveal progressively | Auto-expand multiple depth levels on load |
| FLOW | Keep LR and compact startup | Dump 20+ cards on first paint |

---

## File Map (for fast edits)

- `frontend-next/src/app/graph/page.tsx` -> route shell, mode switcher, HUD wiring
- `frontend-next/src/components/graph/GraphHud.tsx` -> Lattice HUD (filters, detail pane, 3D toggle)
- `frontend-next/src/components/visualization/Lattice3DScene.tsx` -> inline 3D lattice (`GraphEngine`)
- `frontend-next/src/components/visualization/SigmaLatticeGraph.tsx` -> Lattice mode (Sigma/WebGL, full corpus)
- `frontend-next/src/components/visualization/ProgressiveTreeGraph.tsx` -> Tree wiring
- `frontend-next/src/components/visualization/SignalCardGraph.tsx` -> Flow wiring
- `frontend-next/src/hooks/useProgressiveGraph.ts` -> Tree/Flow progressive state model (both modes share this hook)
- `frontend-next/src/lib/graphFlow/navigationSeeds.ts` -> Tree/Flow hub section picker (Timeline/Organizations/Themes)
- `frontend-next/src/lib/graphFlow/layoutUtils.ts` -> Tree vs Flow orientation (`TB` vs `LR`)
- `frontend-next/src/components/visualization/CardGraphCanvas.tsx` -> shared card canvas (Tree/Flow only)
- `frontend-next/src/lib/graphFlow/nodeSizing.ts` / `nodeColors.ts` -> sizing/coloring shared across all three modes

