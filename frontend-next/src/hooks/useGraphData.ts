"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchGraphApi,
  type GraphApiPayload,
} from "@/components/graph-flow/fetchGraphApi";
import {
  graphPayloadFingerprint,
  graphTopologyFingerprint,
} from "@/lib/graphFlow/graphFingerprint";

export interface UseGraphDataOptions {
  /** Dataset name forwarded to `/api/graph?dataset=`. */
  dataset?: string;
  /**
   * Poll interval (ms) for picking up scraper/database updates without a full
   * page reload. Omit or set `0` to fetch once.
   */
  refreshMs?: number;
}

export interface UseGraphDataResult {
  payload: GraphApiPayload | null;
  /** Full semantic revision; stable across polls when scraper data unchanged. */
  revision: string | null;
  /** Topology-only revision; stable when only labels/importance/etc. change. */
  topologyRevision: string | null;
  loading: boolean;
  error: Error | null;
  /** Force a fresh fetch (e.g. Rebuild button). */
  reload: () => void;
}

/**
 * Fetches the flat graph payload from Flask / Cloud Run (`GET /api/graph`).
 * Poll updates only replace state when the fingerprint changes, so node
 * positions and expand/collapse are not reset by identical responses.
 */
export function useGraphData(
  options: UseGraphDataOptions = {},
): UseGraphDataResult {
  const { dataset, refreshMs = 0 } = options;
  const [payload, setPayload] = useState<GraphApiPayload | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [topologyRevision, setTopologyRevision] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const revisionRef = useRef<string | null>(null);
  const topologyRevisionRef = useRef<string | null>(null);

  const reload = useCallback(() => {
    revisionRef.current = null;
    topologyRevisionRef.current = null;
    setLoading(true);
    setReloadNonce((nonce) => nonce + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const next = await fetchGraphApi({ dataset, signal: controller.signal });
        if (cancelled) return;

        const fp = graphPayloadFingerprint(next);
        const topo = graphTopologyFingerprint(next);
        if (fp !== revisionRef.current) {
          revisionRef.current = fp;
          setPayload(next);
          setRevision(fp);
        }
        if (topo !== topologyRevisionRef.current) {
          topologyRevisionRef.current = topo;
          setTopologyRevision(topo);
        }
        setError(null);
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    let timer: ReturnType<typeof setInterval> | undefined;
    if (refreshMs > 0) {
      timer = setInterval(() => void load(), refreshMs);
    }

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [dataset, refreshMs, reloadNonce]);

  return { payload, revision, topologyRevision, loading, error, reload };
}
