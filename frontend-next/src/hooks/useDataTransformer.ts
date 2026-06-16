"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RawNodeDatum } from "react-d3-tree";
import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import { buildTreeFromPayload } from "@/lib/graphFlow/graphTransform";
import type { BuildTreeResult, CyclicEdge } from "@/lib/graphFlow/graphTransformTypes";

const WORKER_THRESHOLD = 80;

type GraphTransformWorker = Worker & {
  postMessage(message: unknown): void;
};

export interface DataTransformerResult {
  tree: RawNodeDatum;
  cyclicEdges: CyclicEdge[];
}

type WorkerTreeState = {
  input: DataTransformerInput;
  revision: string | null;
  result: DataTransformerResult;
};

function createTransformWorker(): GraphTransformWorker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("../lib/graphFlow/graphTransform.worker.ts", import.meta.url), {
      type: "module",
    }) as GraphTransformWorker;
  } catch {
    return null;
  }
}

function runWorkerBuildTree(
  worker: GraphTransformWorker,
  payload: { nodes: GraphApiPayload["nodes"]; edges: GraphApiPayload["edges"] },
  signal: AbortSignal,
): Promise<BuildTreeResult> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onMessageError);
      signal.removeEventListener("abort", onAbort);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type: string; requestId: string; result?: BuildTreeResult; message?: string };
      if (data.requestId !== requestId) return;
      cleanup();
      if (data.type === "error") reject(new Error(data.message ?? "worker error"));
      else resolve(data.result as BuildTreeResult);
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    };
    const onMessageError = () => {
      cleanup();
      reject(new Error("Graph transform worker returned an unreadable message"));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Graph transform cancelled", "AbortError"));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", onMessageError);
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      worker.postMessage({ type: "buildTree", requestId, payload });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export interface DataTransformerInput {
  nodes: GraphApiPayload["nodes"];
  edges: GraphApiPayload["edges"];
}

export function computePriorityScore(
  node: Partial<GraphApiPayload["nodes"][number]>,
  degree: number,
): number {
  const imp = typeof node.importance === "number" ? node.importance : 0;
  const year = typeof node.year === "number" ? node.year : 0;
  return imp * 10000 + year * 10 + degree;
}

/**
 * Memoized adapter with Web Worker offload for large graphs [SC-5].
 */
export function useDataTransformer(
  input: DataTransformerInput | null,
  revision: string | null,
): DataTransformerResult | null {
  const workerRef = useRef<GraphTransformWorker | null>(null);
  const [workerTree, setWorkerTree] = useState<WorkerTreeState | null>(null);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  const syncResult = useMemo(() => {
    if (!input) return null;
    if (input.nodes.length >= WORKER_THRESHOLD) return null;
    return buildTreeFromPayload(input);
  }, [input]);

  useEffect(() => {
    if (!input || input.nodes.length < WORKER_THRESHOLD) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    if (!workerRef.current) {
      workerRef.current = createTransformWorker();
    }
    const worker = workerRef.current;
    void (async () => {
      let result: BuildTreeResult;
      try {
        result = worker
          ? await runWorkerBuildTree(worker, input, controller.signal)
          : buildTreeFromPayload(input);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        if (!worker) {
          console.error("Failed to build graph tree", error);
          return;
        }
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        try {
          result = buildTreeFromPayload(input);
        } catch (fallbackError) {
          console.error("Failed to build graph tree", fallbackError);
          return;
        }
      }
      if (!cancelled) setWorkerTree({ input, revision, result });
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [input, revision]);

  if (syncResult) return syncResult;
  if (workerTree?.input === input && workerTree.revision === revision) {
    return workerTree.result;
  }
  return null;
}
