import type { RawNodeDatum } from "react-d3-tree";
import type {
  GraphApiEdge,
  GraphApiNode,
} from "@/components/graph-flow/fetchGraphApi";
import { connectionCountsFromTree } from "@/lib/graphFlow/nodeSizing";
import { SYNTHETIC_ROOT_ID, SYNTHETIC_ROOT_LABEL } from "@/lib/graphFlow/syntheticRoot";
import type { BuildTreeResult, CyclicEdge, GraphIndexSerializable } from "./graphTransformTypes";
import { nodeTypeOf } from "./nodeColors";

function toAttributes(
  node: GraphApiNode,
  degree?: number,
): RawNodeDatum["attributes"] {
  const attributes: Record<string, string | number | boolean> = { id: node.id };
  for (const [key, value] of Object.entries(node)) {
    if (key === "id" || key === "label") continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      attributes[key] = value;
    }
  }
  if (typeof degree === "number") attributes.degree = degree;
  return attributes;
}

/**
 * Mild type nudge only — importance and connectivity (below) are the
 * primary signal, matching the seeding philosophy used by Force/Flow modes
 * and the degree-based sizing on /graph. Keep the spread small so a highly
 * important or well-connected node of any type can outrank a low-signal
 * "headline" node. Keys match the real `type` values the API emits
 * (graph_node_type() in webapp/graph_store.py) — companies land in "lab" or
 * "product" depending on their group, and dates are "year" nodes.
 */
const SEED_TYPE_WEIGHT: Record<string, number> = {
  story: 1,
  topic: 0.95,
  product: 0.93,
  lab: 0.92,
  model: 0.9,
  person: 0.88,
  year: 0.86,
  risk: 0.84,
};

function seedScore(
  id: string,
  nodeById: ReadonlyMap<string, GraphApiNode>,
  childrenById: ReadonlyMap<string, string[]>,
): number {
  const node = nodeById.get(id);
  if (!node) return 0;
  const type = nodeTypeOf(node);
  const typeW = SEED_TYPE_WEIGHT[type] ?? 0.75;
  const imp = typeof node.importance === "number" ? node.importance : 0;
  const year = typeof node.year === "number" ? node.year : 0;
  const childCount = (childrenById.get(id) ?? []).length;
  const branchW = Math.min(childCount, 10) * 0.05;
  return typeW * 10 + imp * 10 + year * 0.08 + branchW * 80;
}

function sortChildIds(ids: string[], nodeById: Map<string, GraphApiNode>): string[] {
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

export function buildGraphIndexFromPayload(payload: {
  nodes: GraphApiNode[];
  edges: GraphApiEdge[];
}): GraphIndexSerializable {
  const nodeById = new Map<string, GraphApiNode>();
  for (const node of payload.nodes) {
    if (node?.id) nodeById.set(node.id, node);
  }

  const childrenById = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const outgoingById = new Map<string, string[]>();
  const cyclicEdges: CyclicEdge[] = [];

  for (const id of nodeById.keys()) {
    childrenById.set(id, []);
    inDegree.set(id, 0);
    outgoingById.set(id, []);
  }

  const seenEdges = new Set<string>();
  for (const edge of payload.edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    const edgeKey = `${edge.source}\0${edge.target}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);
    outgoingById.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  for (const [id, targets] of outgoingById) {
    outgoingById.set(id, sortChildIds(targets, nodeById));
  }

  const rootIds = sortChildIds(
    [...nodeById.keys()].filter((id) => (inDegree.get(id) ?? 0) === 0),
    nodeById,
  );
  const discovered = new Set(rootIds);
  const queue = [...rootIds];

  const traverseQueuedNodes = () => {
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const source = queue[cursor];
      for (const target of outgoingById.get(source) ?? []) {
        if (discovered.has(target)) {
          cyclicEdges.push({ source, target });
          continue;
        }
        discovered.add(target);
        childrenById.get(source)!.push(target);
        queue.push(target);
      }
    }
  };

  traverseQueuedNodes();

  // Components without an in-degree-zero node are cyclic. Seed each remaining
  // component from its highest-priority node and keep back/cross edges separate.
  const rankedIds = sortChildIds([...nodeById.keys()], nodeById);
  for (const id of rankedIds) {
    if (discovered.has(id)) continue;
    rootIds.push(id);
    discovered.add(id);
    queue.length = 0;
    queue.push(id);
    traverseQueuedNodes();
  }

  const nodeByIdRecord = Object.fromEntries(nodeById);
  const childrenRecord = Object.fromEntries(childrenById);

  return { nodeById: nodeByIdRecord, childrenById: childrenRecord, rootIds, cyclicEdges };
}

export function buildTreeFromPayload(input: {
  nodes: GraphApiNode[];
  edges: GraphApiEdge[];
}): BuildTreeResult {
  const index = buildGraphIndexFromPayload(input);
  const childrenMap = new Map(Object.entries(index.childrenById));
  const connectionCounts = connectionCountsFromTree(childrenMap, index.cyclicEdges);
  const datumById = new Map<string, RawNodeDatum>();

  for (const [id, node] of Object.entries(index.nodeById)) {
    datumById.set(id, {
      name: node.label ?? node.id,
      attributes: toAttributes(node, connectionCounts.get(id) ?? 0),
    });
  }

  for (const [id, childIds] of Object.entries(index.childrenById)) {
    if (childIds.length === 0) continue;
    const datum = datumById.get(id);
    if (datum) {
      datum.children = childIds.flatMap((childId) => {
        const child = datumById.get(childId);
        return child ? [child] : [];
      });
    }
  }

  return {
    tree: {
      name: SYNTHETIC_ROOT_LABEL,
      attributes: { id: SYNTHETIC_ROOT_ID, type: "root", nodeCount: datumById.size },
      children: index.rootIds.flatMap((id) => {
        const datum = datumById.get(id);
        return datum ? [datum] : [];
      }),
    },
    cyclicEdges: index.cyclicEdges,
  };
}

export function pickSeedIdsFromSerializable(
  index: GraphIndexSerializable,
  count: number,
): string[] {
  const nodeById = new Map(Object.entries(index.nodeById));
  const childrenById = new Map(Object.entries(index.childrenById));
  return pickSeedIdsFromMaps(index.rootIds, nodeById, childrenById, count);
}

export function pickSeedIdsFromMaps(
  rootIds: readonly string[],
  nodeById: ReadonlyMap<string, GraphApiNode>,
  childrenById: ReadonlyMap<string, string[]>,
  count: number,
): string[] {
  const ranked = [...rootIds].sort(
    (a, b) =>
      seedScore(b, nodeById, childrenById) - seedScore(a, nodeById, childrenById),
  );
  const limit = Math.max(1, Math.min(count, ranked.length));
  return ranked.slice(0, limit);
}
