import type {
  GraphApiNode,
  GraphApiPayload,
} from "@/components/graph-flow/fetchGraphApi";
import { nodeTypeOf } from "@/lib/graphFlow/nodeColors";

export interface GraphIndex {
  nodeById: Map<string, GraphApiNode>;
  childrenById: Map<string, string[]>;
  rootIds: string[];
}

/** Prefer story/entity roots with high importance and recent year. */
const SEED_TYPE_WEIGHT: Record<string, number> = {
  story: 1,
  entity: 0.84,
  topic: 0.74,
  community: 0.68,
  person: 0.62,
  product: 0.56,
  lab: 0.52,
  model: 0.5,
  risk: 0.42,
  year: 0.36,
};

function seedScore(id: string, index: GraphIndex): number {
  const node = index.nodeById.get(id);
  if (!node) return 0;
  const type = nodeTypeOf(node);
  const typeW = SEED_TYPE_WEIGHT[type] ?? 0.45;
  const imp = typeof node.importance === "number" ? node.importance : 0;
  const year = typeof node.year === "number" ? node.year : 0;
  const childCount = (index.childrenById.get(id) ?? []).length;
  const branchW = Math.min(childCount, 10) * 0.05;
  return typeW * 1000 + imp * 10 + year * 0.08 + branchW * 80;
}

function sortChildIds(
  ids: string[],
  nodeById: Map<string, GraphApiNode>,
): string[] {
  return [...ids].sort((a, b) => {
    const an = nodeById.get(a);
    const bn = nodeById.get(b);
    const ai = typeof an?.importance === "number" ? an.importance : 0;
    const bi = typeof bn?.importance === "number" ? bn.importance : 0;
    if (bi !== ai) return bi - ai;
    const ay = typeof an?.year === "number" ? an.year : 0;
    const by = typeof bn?.year === "number" ? bn.year : 0;
    return by - ay;
  });
}

/**
 * Builds adjacency from the flat API payload. Each node keeps at most one
 * parent (first edge wins) so expand/collapse stays tree-shaped.
 */
export function buildGraphIndex(payload: GraphApiPayload): GraphIndex {
  const nodeById = new Map<string, GraphApiNode>();
  for (const node of payload.nodes) {
    if (node?.id) nodeById.set(node.id, node);
  }

  const childrenById = new Map<string, string[]>();
  const parentById = new Map<string, string>();
  const inDegree = new Map<string, number>();

  for (const id of nodeById.keys()) {
    childrenById.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of payload.edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    if (parentById.has(edge.target)) continue;
    parentById.set(edge.target, edge.source);
    childrenById.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  for (const [id, kids] of childrenById) {
    childrenById.set(id, sortChildIds(kids, nodeById));
  }

  let rootIds = [...nodeById.keys()].filter((id) => (inDegree.get(id) ?? 0) === 0);
  if (rootIds.length === 0 && nodeById.size > 0) {
    let best: string | undefined;
    let bestScore = -Infinity;
    for (const [id, node] of nodeById) {
      const score = typeof node.importance === "number" ? node.importance : 0;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    if (best) rootIds = [best];
  }

  rootIds = sortChildIds(rootIds, nodeById);
  return { nodeById, childrenById, rootIds };
}

export function pickSeedIds(index: GraphIndex, count: number): string[] {
  const ranked = [...index.rootIds].sort((a, b) => seedScore(b, index) - seedScore(a, index));
  const limit = Math.max(1, Math.min(count, ranked.length));
  return ranked.slice(0, limit);
}

/**
 * Visible nodes = seeds plus descendants of every expanded id.
 */
export function computeVisibleIds(
  seedIds: string[],
  expandedIds: ReadonlySet<string>,
  childrenById: Map<string, string[]>,
): Set<string> {
  const visible = new Set<string>();
  const queue = [...seedIds];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visible.has(id)) continue;
    visible.add(id);
    if (!expandedIds.has(id)) continue;
    for (const childId of childrenById.get(id) ?? []) {
      if (!visible.has(childId)) queue.push(childId);
    }
  }

  return visible;
}

export function collectDescendants(
  rootId: string,
  childrenById: Map<string, string[]>,
): Set<string> {
  const out = new Set<string>();
  const stack = [...(childrenById.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(childrenById.get(id) ?? []));
  }
  return out;
}
