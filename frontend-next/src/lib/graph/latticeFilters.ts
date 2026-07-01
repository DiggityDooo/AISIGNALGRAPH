import type { GraphApiEdge, GraphApiNode, GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import type { GraphFilterState } from "@/lib/graph/types";
import { filterEdges, filterNodes } from "@/lib/graph/filters.js";

/** Apply HUD filter state to the flat API payload (same rules as legacy graph.js). */
export function filterGraphPayload(
  payload: GraphApiPayload,
  filters: Pick<
    GraphFilterState,
    "searchQuery" | "lens" | "activeYear" | "visibleNodeTypes"
  > & { selectedNodeId?: string | null },
): GraphApiPayload {
  const visibleNodes = filterNodes({
    nodes: payload.nodes,
    edges: payload.edges,
    query: filters.searchQuery,
    lens: filters.lens,
    activeYear: filters.activeYear,
    visibleNodeTypes: filters.visibleNodeTypes,
    selectedNodeId: filters.selectedNodeId ?? null,
    ftsStoryIds: new Set(),
  }) as GraphApiNode[];

  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = filterEdges(payload.edges, visibleIds) as GraphApiEdge[];

  return {
    ...payload,
    nodes: visibleNodes,
    edges: visibleEdges,
  };
}
