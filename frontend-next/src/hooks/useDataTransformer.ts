"use client";

import { useMemo } from "react";
import type { RawNodeDatum } from "react-d3-tree";
import type {
  GraphApiEdge,
  GraphApiNode,
} from "@/components/graph-flow/fetchGraphApi";

export interface DataTransformerInput {
  nodes: GraphApiNode[];
  edges: GraphApiEdge[];
}

export function computePriorityScore(node: Partial<GraphApiNode>, degree: number): number {
  const imp = typeof node.importance === "number" ? node.importance : 0;
  const year = typeof node.year === "number" ? node.year : 0;
  return imp * 10000 + year * 10 + degree;
}

const SYNTHETIC_ROOT_NAME = "AISIGNALGRAPH";

/**
 * Builds the `attributes` map react-d3-tree allows (string | number | boolean
 * only). The original node `id` is retained as a stable key consumed by the
 * physics renderer (collapse tracking + force links); `label` is dropped since
 * it becomes the node `name`.
 */
function toAttributes(node: GraphApiNode): RawNodeDatum["attributes"] {
  const attributes: Record<string, string | number | boolean> = {
    id: node.id,
  };
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
  return attributes;
}

/**
 * Converts the flat `{ nodes, edges }` signal graph into the nested
 * `{ name, children }` structure required by `react-d3-tree`.
 *
 * The source graph is relational and may contain cycles and multiple roots,
 * so a single synthetic root anchors the hierarchy. A breadth-first traversal
 * from in-degree-0 roots assigns each node to exactly one parent (the edge that
 * first reaches it), breaking cycles and de-duplicating shared children.
 * Disconnected nodes attach directly under the synthetic root.
 *
 * The input objects are never mutated.
 */
function buildTree(input: DataTransformerInput): RawNodeDatum {
  const { nodes, edges } = input;

  const nodeById = new Map<string, GraphApiNode>();
  for (const node of nodes) {
    if (node && typeof node.id === "string") nodeById.set(node.id, node);
  }

  const childIds = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeById.keys()) {
    childIds.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    childIds.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const roots: string[] = [];
  for (const id of nodeById.keys()) {
    if ((inDegree.get(id) ?? 0) === 0) roots.push(id);
  }
  // Fully cyclic graph with no natural root: fall back to highest importance.
  if (roots.length === 0 && nodeById.size > 0) {
    let best: string | undefined;
    let bestScore = -Infinity;
    for (const [id, node] of nodeById) {
      const score = typeof node.importance === "number" ? node.importance : 0;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    if (best) roots.push(best);
  }

  const visited = new Set<string>();

  const buildNode = (id: string): RawNodeDatum => {
    visited.add(id);
    const node = nodeById.get(id)!;
    const childIdList = [...(childIds.get(id) ?? [])].sort((a, b) => {
      const ai = nodeById.get(a)?.importance;
      const bi = nodeById.get(b)?.importance;
      const an = typeof ai === "number" ? ai : 0;
      const bn = typeof bi === "number" ? bi : 0;
      if (bn !== an) return bn - an;
      const ay = nodeById.get(a)?.year;
      const by = nodeById.get(b)?.year;
      return (typeof by === "number" ? by : 0) - (typeof ay === "number" ? ay : 0);
    });
    const children: RawNodeDatum[] = [];
    for (const childId of childIdList) {
      if (!visited.has(childId)) children.push(buildNode(childId));
    }
    return {
      name: node.label ?? node.id,
      attributes: toAttributes(node),
      ...(children.length > 0 ? { children } : {}),
    };
  };

  const topLevel: RawNodeDatum[] = [];
  const sortedRoots = [...roots].sort((a, b) => {
    const ay = nodeById.get(a)?.year;
    const by = nodeById.get(b)?.year;
    return (typeof ay === "number" ? ay : 0) - (typeof by === "number" ? by : 0);
  });
  for (const rootId of sortedRoots) {
    if (!visited.has(rootId)) topLevel.push(buildNode(rootId));
  }
  // Any node left unvisited lives inside a cycle unreachable from a root; surface it.
  for (const id of nodeById.keys()) {
    if (!visited.has(id)) topLevel.push(buildNode(id));
  }

  return {
    name: SYNTHETIC_ROOT_NAME,
    attributes: { id: "__root__", type: "root", nodeCount: nodeById.size },
    children: topLevel,
  };
}

/**
 * Memoized adapter. Re-runs when node/edge content changes (revision), not on
 * identical poll responses from Cloud Run.
 */
export function useDataTransformer(
  input: DataTransformerInput | null,
  revision: string | null,
): RawNodeDatum | null {
  return useMemo(() => {
    if (!input) return null;
    return buildTree(input);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision captures payload identity
  }, [input, revision]);
}
