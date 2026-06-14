import type {
  GraphApiNode,
  GraphApiPayload,
} from "@/components/graph-flow/fetchGraphApi";
import {
  buildGraphIndexFromPayload,
  pickSeedIdsFromMaps,
} from "@/lib/graphFlow/graphTransform";
import type { CyclicEdge, GraphIndexSerializable } from "@/lib/graphFlow/graphTransformTypes";

export type { CyclicEdge };

export interface GraphIndex {
  nodeById: Map<string, GraphApiNode>;
  childrenById: Map<string, string[]>;
  rootIds: string[];
  cyclicEdges: CyclicEdge[];
}

export function hydrateGraphIndex(serialized: GraphIndexSerializable): GraphIndex {
  return {
    nodeById: new Map(Object.entries(serialized.nodeById)),
    childrenById: new Map(Object.entries(serialized.childrenById)),
    rootIds: serialized.rootIds,
    cyclicEdges: serialized.cyclicEdges,
  };
}

export function buildGraphIndex(payload: GraphApiPayload): GraphIndex {
  return hydrateGraphIndex(buildGraphIndexFromPayload(payload));
}

export function pickSeedIds(index: GraphIndex, count: number): string[] {
  return pickSeedIdsFromMaps(
    index.rootIds,
    index.nodeById,
    index.childrenById,
    count,
  );
}

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
