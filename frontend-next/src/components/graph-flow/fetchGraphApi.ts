/**
 * Typed client for the existing `GET /api/graph` endpoint.
 *
 * This is a read-only adapter boundary: it returns the raw, flat payload
 * exactly as served by the Flask `GraphStore` (the scraper's source of truth)
 * without mutating its schema or content. Shape transformation into the
 * hierarchical structure required by `react-d3-tree` happens downstream in
 * `buildGraphIndexFromPayload` (graphTransform.ts), used by Tree/Flow's
 * `useProgressiveGraph`. Lattice consumes this flat payload directly into a
 * `graphology` graph (SigmaLatticeGraph.tsx) — no hierarchy transform needed.
 */

export interface GraphApiNode {
  id: string;
  label?: string;
  node_type?: string;
  type?: string;
  route?: string;
  description?: string;
  importance?: number;
  timeline_month?: string;
  year?: number;
  category?: string;
  // The compact endpoint strips empty values; unknown extras may appear.
  [key: string]: unknown;
}

export interface GraphApiEdge {
  source: string;
  target: string;
  flow_kind?: string;
  [key: string]: unknown;
}

export interface GraphApiCommunity {
  id: string;
  label?: string;
  node_ids?: string[];
  [key: string]: unknown;
}

export interface GraphApiPayload {
  nodes: GraphApiNode[];
  edges: GraphApiEdge[];
  communities?: GraphApiCommunity[];
  timeline?: { months?: string[]; start?: string; end?: string };
  status?: "ok" | "degraded";
  message?: string;
}

/**
 * API base for graph fetches.
 * - Production (Flask hub static export): leave unset → same-origin `/api/graph`.
 * - Cloud Run / split deploy: set `NEXT_PUBLIC_API_BASE` at build time.
 */
function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return "";
}

export async function fetchGraphApi(
  options: { dataset?: string; signal?: AbortSignal } = {},
): Promise<GraphApiPayload> {
  const { dataset, signal } = options;
  const params = new URLSearchParams();
  if (dataset) params.set("dataset", dataset);
  const query = params.toString() ? `?${params.toString()}` : "";

  const response = await fetch(`${resolveApiBase()}/api/graph${query}`, {
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`/api/graph returned ${response.status}`);
  }

  const data = (await response.json()) as Partial<GraphApiPayload>;
  return {
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    edges: Array.isArray(data.edges) ? data.edges : [],
    communities: Array.isArray(data.communities) ? data.communities : [],
    timeline: data.timeline,
    status: data.status,
    message: data.message,
  };
}
