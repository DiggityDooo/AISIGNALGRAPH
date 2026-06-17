# AISIGNALGRAPH Graph Modes — Sectionized Reference

> For Claude/agents editing graph behavior in `/graph/flow`.
> Keep these modes separate. They are intentionally different.
>
> **Startup seeds / hub children:** see `docs/claude-graph-navigation-seeds-plan.md` — that doc explains why orphan stories (e.g. Junior Software Engineer) must not be first-level hub cards and how Timeline / Organizations / Themes sections should work.

---

## LATTICE Mode (ForceTree)

### Purpose
- Exploratory, high-level constellation view.
- Good for scanning global structure and jumping to interesting clusters.

### Runtime
- Component: `ForceTree`
- Layout: D3 force/radial style (not dagre card layout)
- Interaction: frontier click/expand behavior specific to ForceTree
- Seed default: `initialSeedCount={8}`

### Expected first paint
- Can show a broader cluster than Tree/Flow.
- This mode is allowed to feel "network-like" and less strictly hierarchical.

### Guardrails
- Do not force Lattice constraints onto Tree/Flow.
- Do not reuse Lattice seed defaults for Tree/Flow.
- Keep Lattice as the exploratory mode; Tree/Flow are progressive card modes.

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

### Gap to close
- Hub children still come from `pickSeedIds(index.rootIds)` until `navigationSeeds.ts` lands — see `claude-graph-navigation-seeds-plan.md`.

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

- `frontend-next/src/components/visualization/ForceTree.tsx` -> Lattice mode behavior
- `frontend-next/src/components/visualization/ProgressiveTreeGraph.tsx` -> Tree wiring
- `frontend-next/src/hooks/useProgressiveGraph.ts` -> Tree progressive state model
- `frontend-next/src/components/visualization/SignalCardGraph.tsx` -> Flow wiring
- `frontend-next/src/lib/graphFlow/flowElements.ts` -> Flow static selection logic
- `frontend-next/src/lib/graphFlow/layoutUtils.ts` -> Tree vs Flow orientation (`TB` vs `LR`)
- `frontend-next/src/components/visualization/CardGraphCanvas.tsx` -> shared card canvas

