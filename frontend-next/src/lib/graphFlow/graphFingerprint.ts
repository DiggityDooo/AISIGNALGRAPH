import type {
  GraphApiEdge,
  GraphApiNode,
  GraphApiPayload,
} from "@/components/graph-flow/fetchGraphApi";

/** Node fields that are layout-derived or volatile across polls. */
const IGNORED_NODE_KEYS = new Set([
  "x",
  "y",
  "fx",
  "fy",
  "vx",
  "vy",
  "position",
  "degree",
  "in_degree",
  "out_degree",
  "display_cluster_id",
  "display_cluster_label",
  "weight",
  "weight_norm",
]);

/** Edge fields beyond endpoints that do not affect Tree/Flow/Lattice topology. */
const IGNORED_EDGE_KEYS = new Set(["weight", "weight_norm", "id", "relation"]);

function hashVisit(
  value: unknown,
  write: (chunk: string) => void,
  options?: { ignoreKeys?: Set<string> },
): void {
  if (value === null) {
    write("null;");
    return;
  }
  if (Array.isArray(value)) {
    write(`[${value.length}:`);
    for (const item of value) hashVisit(item, write, options);
    write("];");
    return;
  }

  switch (typeof value) {
    case "boolean":
      write(value ? "b1;" : "b0;");
      return;
    case "number":
      write(`n${String(value)};`);
      return;
    case "string":
      write(`s${value.length}:${value};`);
      return;
    case "object": {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => !options?.ignoreKeys?.has(key))
        .sort();
      write(`{${keys.length}:`);
      for (const key of keys) {
        hashVisit(key, write, options);
        hashVisit(record[key], write, options);
      }
      write("};");
      return;
    }
    case "undefined":
      write("u;");
      return;
    default:
      write(`${typeof value}:${String(value)};`);
  }
}

function fingerprintFromVisit(visit: (write: (chunk: string) => void) => void): string {
  let primary = 0x811c9dc5;
  let secondary = 0x9e3779b9;

  const write = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      primary = Math.imul(primary ^ code, 0x01000193);
      secondary = Math.imul(secondary ^ code, 0x85ebca6b);
    }
  };

  visit(write);
  return `${(primary >>> 0).toString(16).padStart(8, "0")}${(secondary >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

function sortedNodes(nodes: GraphApiNode[]): GraphApiNode[] {
  return [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function sortedEdges(edges: GraphApiEdge[]): GraphApiEdge[] {
  return [...edges].sort((a, b) => {
    const left = `${a.source}\0${a.target}\0${a.flow_kind ?? ""}`;
    const right = `${b.source}\0${b.target}\0${b.flow_kind ?? ""}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

/**
 * Stable revision key for graph payloads. Node metadata matters because labels,
 * colors, and importance-driven animation all derive from it even when node
 * IDs and edge endpoints are unchanged. Ignores position-only and response
 * envelope fields that would cause false poll-driven revision bumps.
 */
export function graphPayloadFingerprint(payload: GraphApiPayload): string {
  const body = fingerprintFromVisit((write) => {
    write(`nodes:${payload.nodes.length};edges:${payload.edges.length};`);
    write("[nodes:");
    for (const node of sortedNodes(payload.nodes)) {
      hashVisit(node, write, { ignoreKeys: IGNORED_NODE_KEYS });
    }
    write("];edges:");
    for (const edge of sortedEdges(payload.edges)) {
      hashVisit(edge, write, { ignoreKeys: IGNORED_EDGE_KEYS });
    }
    write("];");
  });
  return `v3:${payload.nodes.length}:${payload.edges.length}:${body}`;
}

/**
 * Topology-only revision — changes when nodes or edges are added/removed, not
 * when labels/importance or other display metadata change.
 */
export function graphTopologyFingerprint(payload: GraphApiPayload): string {
  const body = fingerprintFromVisit((write) => {
    write(`nodes:${payload.nodes.length};edges:${payload.edges.length};`);
    for (const node of sortedNodes(payload.nodes)) {
      write(`n:${node.id};`);
    }
    for (const edge of sortedEdges(payload.edges)) {
      write(`e:${edge.source}->${edge.target}:${edge.flow_kind ?? "edge"};`);
    }
  });
  return `topo:${payload.nodes.length}:${payload.edges.length}:${body}`;
}
