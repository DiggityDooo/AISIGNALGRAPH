import type { GraphApiEdge, GraphApiNode, GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import type { GraphFilterState, GraphLens } from "@/lib/graph/types";
import { filterEdges, filterNodes } from "@/lib/graph/filters.js";

/** Single source of truth for which fields define the visible subgraph / renderer identity. */
export function filterKey(input: {
  searchQuery: string;
  lens: GraphLens;
  activeYear: number;
  activeEra?: string;
  visibleNodeTypes: ReadonlySet<string>;
  selectedNodeId?: string | null;
}): string {
  const selectedNodeId = input.lens === "local" ? (input.selectedNodeId ?? null) : null;
  return JSON.stringify({
    searchQuery: input.searchQuery.trim().toLowerCase(),
    activeEra: input.activeEra || "",
    lens: input.lens,
    activeYear: input.activeYear,
    visibleNodeTypes: [...input.visibleNodeTypes].sort(),
    selectedNodeId,
  });
}

/** Apply HUD filter state to the flat API payload (same rules as legacy graph.js). */
export function filterGraphPayload(
  payload: GraphApiPayload,
  filters: Pick<
    GraphFilterState,
    "searchQuery" | "lens" | "activeYear" | "visibleNodeTypes"
  > & { activeEra?: string; selectedNodeId?: string | null; ftsStoryIds?: Set<string> },
): GraphApiPayload {
  let nodes = payload.nodes;
  if (filters.activeEra) {
    const stories = new Set(nodes.filter(node => node.era === filters.activeEra).map(node => node.id));
    const related = new Set(stories);
    for (const { source, target } of payload.edges) {
      if (stories.has(source) && !target.startsWith("story:")) related.add(target);
      if (stories.has(target) && !source.startsWith("story:")) related.add(source);
    }
    nodes = nodes.filter(node => related.has(node.id));
  }

  const ftsStoryIds = filters.ftsStoryIds ?? new Set();
  const visibleNodes = filterNodes({
    nodes,
    edges: payload.edges,
    query: filters.searchQuery,
    lens: filters.lens,
    activeYear: filters.activeYear,
    visibleNodeTypes: filters.visibleNodeTypes,
    selectedNodeId: filters.selectedNodeId ?? null,
    ftsStoryIds,
  }) as GraphApiNode[];

  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = filterEdges(payload.edges, visibleIds) as GraphApiEdge[];

  return {
    ...payload,
    nodes: visibleNodes,
    edges: visibleEdges,
  };
}
