# Agent Prompt: Fix Graph Hub Children (Navigation Seeds)

Copy this prompt when asking Claude/Cursor to implement Tree & Flow startup on `/graph/flow`.

---

## Mission

Fix **what appears under the hub** on first paint. Tree and Flow already expand progressively — the bug is **seed selection**, not layout or expand/collapse.

The graph must **not** open with unrelated story cards like **Junior Software Engineer**, **Hinton paper**, or **Dartmouth** as sibling hub children. It must open with **three section lenses** backed by **live `/api/graph` data**:

```
AI Signal Graph
├── Timeline        (+7)  → year nodes: 2026, 2025, 2024, …
├── Organizations   (+N)  → lab nodes: OpenAI, Anthropic, Google DeepMind, …
└── Themes          (+N)  → topic nodes: Reasoning Models, AI Agents, Chip Wars, …
```

- First paint: hub + 3 section cards only (`VISIBLE ≤ 7`)
- Sections collapsed with `+N`; expand on double-tap
- All leaf nodes under sections must exist in the live API payload (synthetic allowed: `__root__`, `section:*` only)

---

## Root Cause (read before coding)

`useProgressiveGraph.ts` → `buildEffectiveChildrenById()` calls `pickSeedIds(index, rootCap)`, which ranks `index.rootIds` (in-degree-zero nodes). In production those roots are **orphan labor/job stories** with no `year → story` edge — not years, labs, or topics.

**Do not** tune `seedScore` weights to fix this. **Do not** hardcode story titles. Build a **navigation overlay** that ignores `index.rootIds` for hub children.

Full analysis: `docs/claude-graph-navigation-seeds-plan.md`

---

## Read First (in order)

| # | File | Why |
|---|------|-----|
| 1 | `docs/claude-graph-navigation-seeds-plan.md` | Phases, acceptance criteria, anti-patterns |
| 2 | `docs/graph-modes-sectionized-reference.md` | Lattice vs Tree vs Flow — do not mix behaviors |
| 3 | `frontend-next/src/hooks/useProgressiveGraph.ts` | Hub children, `expandedIds`, `buildCardGraphElements` |
| 4 | `frontend-next/src/lib/graphFlow/graphTransform.ts` | `buildGraphIndexFromPayload`, `pickSeedIdsFromMaps`, `seedScore` |
| 5 | `frontend-next/src/lib/graphFlow/graphIndex.ts` | `computeVisibleIds`, `pickSeedIds` |
| 6 | `frontend-next/src/lib/graphFlow/syntheticRoot.ts` | `SYNTHETIC_ROOT_ID`, hub label |
| 7 | `webapp/graph_store.py` | `_build_graph_data` — `year → story`, `story → entity` edge model |
| 8 | `frontend-next/src/components/visualization/SignalCardGraph.tsx` | Flow wiring (uses same hook as Tree) |
| 9 | `frontend-next/src/components/visualization/ProgressiveTreeGraph.tsx` | Tree wiring |
| 10 | `frontend-next/src/components/visualization/flow/DocumentCardNode.tsx` | `+N` badge, `progressive` flag |

---

## Implement Here

### Create

| File | Purpose |
|------|---------|
| `frontend-next/src/lib/graphFlow/navigationSeeds.ts` | `pickYearSeeds`, `pickLabSeeds`, `pickTopicSeeds`, `buildNavigationChildrenById` |
| `frontend-next/src/lib/graphFlow/navigationSeeds.test.mjs` | Hub children are sections; no labor story IDs; Timeline expands to years only |

### Modify

| File | Change |
|------|--------|
| `frontend-next/src/hooks/useProgressiveGraph.ts` | Replace `pickSeedIds` for hub in `buildEffectiveChildrenById`; add synthetic section nodes in `buildEffectiveNodeById` |
| `frontend-next/src/lib/graphFlow/syntheticRoot.ts` | Add `section:timeline`, `section:organizations`, `section:themes` constants |
| `frontend-next/src/lib/graphFlow/nodeColors.ts` | Optional `section` accent if needed |

### Wire (verify only — likely no change)

| File | Role |
|------|------|
| `frontend-next/src/app/graph/flow/page.tsx` | `initialSeedCount={3}` for Tree/Flow; Lattice stays `8` |
| `frontend-next/src/components/visualization/CardGraphCanvas.tsx` | Double-tap → `onToggleExpand` |
| `frontend-next/src/lib/graphFlow/layoutUtils.ts` | Tree=`TB`, Flow=`LR` — orientation only |

### Optional later (Phase 5 — ask before touching)

| File | Change |
|------|--------|
| `webapp/graph_store.py` | Stop `story → entity:year-*` mention edges; optional `navigation` block on API |

---

## Do Not Touch

- `ForceTree.tsx` / Lattice mode — different interaction model (`buildPriorityCollapsed`)
- `seedScore` / `pickSeedIds` for Lattice unless explicitly scoped
- Hardcoded node labels (Dartmouth, Hinton, Junior Software Engineer)
- `flowElements.ts` — removed; Flow uses `useProgressiveGraph`
- Auth, deploy, CI without explicit approval

---

## Tools & Commands

### Inspect live graph topology (Python)

```bash
cd "/home/seanb/Documents/December 2023"
python3 -c "
from pathlib import Path
from webapp.graph_store import GraphStore
gs = GraphStore(Path('.'))
data = gs.get_graph_data()
nodes = data['nodes']
edges = data['edges']
indeg = {}
for e in edges:
    indeg[e['target']] = indeg.get(e['target'], 0) + 1
roots = [n for n in nodes if indeg.get(n['id'], 0) == 0]
print('roots', len(roots), 'types', {t: sum(1 for n in roots if n.get('type')==t) for t in set(n.get('type') for n in roots)})
years = [n['label'] for n in nodes if n.get('type')=='year']
print('years', sorted(years))
"
```

### Run frontend unit tests

```bash
cd "/home/seanb/Documents/December 2023/frontend-next"
node --import tsx --test src/lib/graphFlow/navigationSeeds.test.mjs
node --import tsx --test src/lib/graphFlow/graphIndex.test.mjs
```

### Typecheck / lint (after changes)

```bash
cd "/home/seanb/Documents/December 2023/frontend-next"
npm run lint
npx tsc --noEmit
```

### Manual UI verify (ask before starting dev server)

1. Open `/graph/flow`
2. **Flow** tab: hub + Timeline / Organizations / Themes — no story cards at top level
3. Double-tap **Timeline** → year nodes (`2026`, `2025`, …)
4. Double-tap a year → stories for that year (capped if needed)
5. Header `VISIBLE` ≤ 7 on first paint
6. **Tree** tab: same navigation, vertical layout

---

## Selection Rules (navigationSeeds.ts)

| Section | Filter | Sort | Exclude |
|---------|--------|------|---------|
| Timeline | `type === "year"` | label desc (2026 first) | — |
| Organizations | `type === "lab"` | `importance` desc | `person`, job keywords |
| Themes | `type === "topic"` | `importance` desc | Labor/job-role keywords |

`initialSeedCount` = max items shown when a **section** is first expanded (fan-out cap), not “pick N orphan stories.”

---

## Acceptance Checklist

- [ ] Hub children = `section:timeline`, `section:organizations`, `section:themes`
- [ ] Junior Software Engineer not visible until user drills deep
- [ ] Expanding Timeline yields only `year` nodes from payload
- [ ] Expanding a year yields `story` nodes via existing `year → story` edges
- [ ] Tree and Flow identical navigation; only layout differs
- [ ] `navigationSeeds.test.mjs` passes
- [ ] `graphIndex.test.mjs` still passes

---

## Reference Docs

- `docs/claude-graph-navigation-seeds-plan.md` — full implementation plan
- `docs/graph-modes-sectionized-reference.md` — per-mode guardrails
- `docs/flow-tree-progressive-reference.md` — progressive disclosure (superseded for seed selection)

`frontend-next/CLAUDE.md` already `@`-imports the plan and sectionized reference.
