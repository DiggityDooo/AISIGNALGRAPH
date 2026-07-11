import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import {
  graphPayloadFingerprint,
  graphTopologyFingerprint,
} from "./graphFingerprint";

export interface GraphRevisionResult {
  /** Full semantic revision; stable across polls when scraper data unchanged. */
  revision: string;
  /** Topology-only revision; stable when only labels/importance/etc. change. */
  topologyRevision: string;
  /** True when the semantic payload changed vs. the previous revision. */
  payloadChanged: boolean;
  /** True when node/edge topology changed vs. the previous topology revision. */
  topologyChanged: boolean;
}

export interface PreviousRevision {
  revision: string | null;
  topologyRevision: string | null;
}

/**
 * Pure comparator: given the previous revisions (or null on first load) and the
 * next payload, compute the revisions and whether either actually changed.
 * Keeps the "skip update if unchanged" decision beside the fingerprint logic
 * instead of embedded in a React hook.
 */
export function compareGraphRevision(
  previous: PreviousRevision | null,
  next: GraphApiPayload,
): GraphRevisionResult {
  const revision = graphPayloadFingerprint(next);
  const topologyRevision = graphTopologyFingerprint(next);
  return {
    revision,
    topologyRevision,
    payloadChanged: revision !== (previous?.revision ?? null),
    topologyChanged: topologyRevision !== (previous?.topologyRevision ?? null),
  };
}
