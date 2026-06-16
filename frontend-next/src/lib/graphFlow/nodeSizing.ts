import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import type { CyclicEdge } from "@/lib/graphFlow/graphTransformTypes";

export interface DegreeInfo {
  in: number;
  out: number;
  total: number;
}

/**
 * Connection counts per node, deduped by source/target pair — mirrors the
 * degree counting already done ad hoc in flowElements.ts and graphTransform.ts.
 */
export function computeDegrees(payload: {
  nodes: GraphApiPayload["nodes"];
  edges: GraphApiPayload["edges"];
}): Map<string, DegreeInfo> {
  const degrees = new Map<string, DegreeInfo>();
  for (const node of payload.nodes) {
    if (node?.id) degrees.set(node.id, { in: 0, out: 0, total: 0 });
  }

  const seen = new Set<string>();
  for (const edge of payload.edges) {
    if (!degrees.has(edge.source) || !degrees.has(edge.target)) continue;
    const key = `${edge.source}\0${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    degrees.get(edge.source)!.out += 1;
    degrees.get(edge.source)!.total += 1;
    degrees.get(edge.target)!.in += 1;
    degrees.get(edge.target)!.total += 1;
  }

  return degrees;
}

/**
 * Degree-based size, same shape as graph.js's applyDegreeBasedNodeSizes:
 * clamp(min, max, base + sqrt(degree) * scale).
 */
export function degreeBasedSize(
  degree: number,
  options: { min: number; max: number; base?: number; scale?: number } = { min: 0, max: 1 },
): number {
  const { min, max, base = 1.2, scale = 0.85 } = options;
  const value = base + Math.sqrt(Math.max(0, degree)) * scale;
  return Math.max(min, Math.min(max, value));
}

/**
 * Connection count per node from a BFS tree's childrenById plus its cyclic
 * cross-links — together they reconstruct every original graph edge exactly
 * once (each edge is either a tree edge or a recorded cyclic edge), so this
 * is the true graph degree, not just tree out-degree.
 */
export function connectionCountsFromTree(
  childrenById: Map<string, string[]>,
  cyclicEdges: readonly CyclicEdge[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [parent, children] of childrenById) {
    for (const child of children) {
      bump(parent);
      bump(child);
    }
  }
  for (const { source, target } of cyclicEdges) {
    bump(source);
    bump(target);
  }
  return counts;
}
