import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";

/**
 * Cheap revision key for graph payloads. Used to skip re-transform / re-layout
 * when the Cloud Run scraper poll returns identical data.
 */
export function graphPayloadFingerprint(payload: GraphApiPayload): string {
  const nodeIds = payload.nodes.map((n) => n.id).join("\0");
  const edgeKeys = payload.edges
    .map((e) => `${e.source}\t${e.target}\t${e.flow_kind ?? ""}`)
    .join("\0");
  return `${payload.nodes.length}|${payload.edges.length}|${nodeIds}|${edgeKeys}|${payload.status ?? ""}`;
}
