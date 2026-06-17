"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Edge, type Node } from "@xyflow/react";
import type { GraphApiNode, GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import type { DocumentCardData } from "@/components/visualization/flow/DocumentCardNode";
import {
  buildGraphIndex,
  collectDescendants,
  computeVisibleIds,
  hydrateGraphIndex,
  type GraphIndex,
} from "@/lib/graphFlow/graphIndex";
import type { GraphIndexSerializable } from "@/lib/graphFlow/graphTransformTypes";
import { accentForType, nodeTypeOf } from "@/lib/graphFlow/nodeColors";
import { connectionCountsFromTree, degreeBasedSize } from "@/lib/graphFlow/nodeSizing";
import { buildNavigationChildrenById, EMPTY_NAVIGATION_OVERLAY } from "@/lib/graphFlow/navigationSeeds";
import { createSignalEdge } from "@/lib/graphFlow/signalEdge";
import { DOCUMENT_CARD_HEIGHT, DOCUMENT_CARD_WIDTH } from "@/lib/graphFlow/layoutUtils";
import { SYNTHETIC_ROOT_ID, SYNTHETIC_ROOT_LABEL } from "@/lib/graphFlow/syntheticRoot";

const INDEX_WORKER_THRESHOLD = 80;

/** nodeById merged with a synthetic "AI Signal Graph" hub node and the navigation section cards. */
function buildEffectiveNodeById(
  index: GraphIndex,
  sectionNodes: ReadonlyMap<string, GraphApiNode>,
): Map<string, GraphApiNode> {
  const map = new Map(index.nodeById);
  if (!map.has(SYNTHETIC_ROOT_ID)) {
    map.set(SYNTHETIC_ROOT_ID, {
      id: SYNTHETIC_ROOT_ID,
      label: SYNTHETIC_ROOT_LABEL,
      node_type: "root",
      type: "root",
    });
  }
  for (const [id, node] of sectionNodes) {
    if (!map.has(id)) map.set(id, node);
  }
  return map;
}

type GraphTransformWorker = Worker;
type WorkerIndexState = {
  payload: GraphApiPayload;
  revision: string | null;
  index: GraphIndex;
};

function createTransformWorker(): GraphTransformWorker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("../lib/graphFlow/graphTransform.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return null;
  }
}

function runWorkerBuildIndex(
  worker: GraphTransformWorker,
  payload: GraphApiPayload,
  signal: AbortSignal,
): Promise<GraphIndexSerializable> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onMessageError);
      signal.removeEventListener("abort", onAbort);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type: string;
        requestId: string;
        result?: GraphIndexSerializable;
        message?: string;
      };
      if (data.requestId !== requestId) return;
      cleanup();
      if (data.type === "error") reject(new Error(data.message ?? "worker error"));
      else resolve(data.result as GraphIndexSerializable);
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
      worker.postMessage({ type: "buildIndex", requestId, payload });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export interface UseProgressiveGraphOptions {
  payload: GraphApiPayload | null;
  dataRevision: string | null;
  initialSeedCount?: number;
  onVisibleCountChange?: (visible: number) => void;
}

export function toggleExpanded(
  id: string,
  expanded: Set<string>,
  childrenById: Map<string, string[]>,
): Set<string> {
  const next = new Set(expanded);
  if (next.has(id)) {
    next.delete(id);
    for (const descendant of collectDescendants(id, childrenById)) {
      next.delete(descendant);
    }
  } else {
    next.add(id);
  }
  return next;
}

export function buildCardGraphElements(
  index: GraphIndex,
  seedIds: string[],
  expandedIds: Set<string>,
  childrenById: Map<string, string[]>,
  sectionNodes: ReadonlyMap<string, GraphApiNode>,
): { nodes: Node<DocumentCardData>[]; edges: Edge[] } {
  const nodeById = buildEffectiveNodeById(index, sectionNodes);
  const connectionCounts = connectionCountsFromTree(childrenById, index.cyclicEdges);

  const visibleIds = computeVisibleIds(seedIds, expandedIds, childrenById);
  const depthById = new Map<string, number>();
  const queue = seedIds.map((id) => ({ id, depth: 0 }));
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depthById.has(id)) continue;
    depthById.set(id, depth);
    if (!expandedIds.has(id)) continue;
    for (const childId of childrenById.get(id) ?? []) {
      if (!visibleIds.has(childId)) continue;
      queue.push({ id: childId, depth: depth + 1 });
    }
  }

  const nodes: Node<DocumentCardData>[] = [];
  const edges: Edge[] = [];
  const treeEdgeKeys = new Set<string>();

  for (const id of visibleIds) {
    const apiNode = nodeById.get(id);
    if (!apiNode) continue;
    const children = childrenById.get(id) ?? [];
    const nodeType = nodeTypeOf(apiNode);
    const accentColor = accentForType(nodeType);
    const importance =
      typeof apiNode.importance === "number" ? apiNode.importance : 0;
    const expanded = expandedIds.has(id);
    const depth = depthById.get(id) ?? 0;
    const isHub = id === SYNTHETIC_ROOT_ID;
    const scale = isHub
      ? 1.7
      : degreeBasedSize(connectionCounts.get(id) ?? 0, {
          min: 0.85,
          max: 1.45,
          base: 0.95,
          scale: 0.12,
        });

    nodes.push({
      id,
      type: "documentCard",
      position: { x: 0, y: 0 },
      data: {
        label: apiNode.label ?? id,
        nodeType,
        accentColor,
        hasChildren: children.length > 0,
        expanded,
        childCount: children.length,
        depth,
        nodeId: id,
        width: Math.round(DOCUMENT_CARD_WIDTH * scale),
        height: Math.round(DOCUMENT_CARD_HEIGHT * scale),
      },
    });

    if (!expanded) continue;
    for (const childId of children) {
      if (!visibleIds.has(childId)) continue;
      treeEdgeKeys.add(`${id}->${childId}`);
      edges.push(
        createSignalEdge({
          id: `e:${id}->${childId}`,
          source: id,
          target: childId,
          accentColor,
          importance,
          depth,
        }),
      );
    }
  }

  for (const { source, target } of index.cyclicEdges) {
    if (!visibleIds.has(source) || !visibleIds.has(target)) continue;
    const key = `${source}->${target}`;
    if (treeEdgeKeys.has(key)) continue;
    const sourceNode = nodeById.get(source);
    const imp = typeof sourceNode?.importance === "number" ? sourceNode.importance : 0;
    const depth = depthById.get(source) ?? 0;
    edges.push(
      createSignalEdge({
        id: `e:${source}->${target}:cyc`,
        source,
        target,
        accentColor: "#a78bfa",
        importance: imp,
        depth,
        isCyclic: true,
      }),
    );
  }

  return { nodes, edges };
}

export function useProgressiveGraph({
  payload,
  dataRevision,
  initialSeedCount = 3,
  onVisibleCountChange,
}: UseProgressiveGraphOptions) {
  const workerRef = useRef<GraphTransformWorker | null>(null);
  const [workerIndex, setWorkerIndex] = useState<WorkerIndexState | null>(null);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  const syncIndex = useMemo(() => {
    if (!payload) return null;
    if (payload.nodes.length >= INDEX_WORKER_THRESHOLD) return null;
    return buildGraphIndex(payload);
  }, [payload]);

  useEffect(() => {
    if (!payload || payload.nodes.length < INDEX_WORKER_THRESHOLD) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    if (!workerRef.current) workerRef.current = createTransformWorker();
    const worker = workerRef.current;

    void (async () => {
      let index: GraphIndex;
      try {
        index = worker
          ? hydrateGraphIndex(await runWorkerBuildIndex(worker, payload, controller.signal))
          : buildGraphIndex(payload);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        if (!worker) {
          console.error("Failed to build graph index", error);
          return;
        }
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        try {
          index = buildGraphIndex(payload);
        } catch (fallbackError) {
          console.error("Failed to build graph index", fallbackError);
          return;
        }
      }
      if (!cancelled) setWorkerIndex({ payload, revision: dataRevision, index });
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [payload, dataRevision]);

  const graphIndex =
    syncIndex ??
    (workerIndex?.payload === payload && workerIndex.revision === dataRevision
      ? workerIndex.index
      : null);

  // Always start from the single "AI Signal Graph" hub, matching Lattice
  // mode — initialSeedCount is the per-section fan-out cap (years/labs/
  // topics shown under Timeline/Organizations/Themes), not how many parallel
  // roots exist or which nodes start expanded. See navigationSeeds.ts.
  const seedIds = useMemo(
    () => (graphIndex ? [SYNTHETIC_ROOT_ID] : []),
    [graphIndex],
  );

  // Only the hub itself starts expanded. computeVisibleIds() reveals a
  // node's children whenever that node is in expandedIds with no cap of its
  // own, so expanding any node here would also reveal grandchildren on first
  // paint. The three navigation sections still become visible (as
  // collapsed "+N" cards) because buildEffectiveChildrenById() attaches them
  // as the hub's children — see navigationSeeds.ts.
  const defaultExpandedIds = useMemo(() => {
    if (!graphIndex) return new Set<string>();
    return new Set([SYNTHETIC_ROOT_ID]);
  }, [graphIndex]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const defaultsAppliedRef = useRef(false);

  useEffect(() => {
    if (!graphIndex || defaultsAppliedRef.current) return;
    defaultsAppliedRef.current = true;
    setExpandedIds(defaultExpandedIds);
  }, [graphIndex, defaultExpandedIds]);

  const layoutKey = useMemo(() => {
    const expanded = [...expandedIds].sort().join(",");
    return `${dataRevision ?? "none"}:${seedIds.join(",")}:${expanded}`;
  }, [dataRevision, seedIds, expandedIds]);

  const fitKey = useMemo(
    () => `${dataRevision ?? "none"}:${seedIds.join(",")}`,
    [dataRevision, seedIds],
  );

  // The hub's children are the three navigation sections (Timeline,
  // Organizations, Themes) — not `pickSeedIds(index.rootIds)`. In production
  // every in-degree-zero root is an orphan labor/job-market story (no
  // `event_date`, so no `year -> story` edge), not a meaningful top-level
  // navigation item. See docs/claude-graph-navigation-seeds-plan.md.
  //
  // Computed once per (graphIndex, payload, initialSeedCount) tuple rather
  // than inside buildCardGraphElements/onToggleExpand directly, since
  // deriving it re-ranks years/labs/topics and rebuilds the mention/timeline
  // edge reverse indexes — no need to redo that on every expand/collapse
  // toggle or render when none of those inputs changed.
  const navigationOverlay = useMemo(() => {
    if (!graphIndex || !payload) return EMPTY_NAVIGATION_OVERLAY;
    return buildNavigationChildrenById(payload, graphIndex.nodeById, graphIndex.childrenById, initialSeedCount);
  }, [graphIndex, payload, initialSeedCount]);

  const { nodes: rawNodes, edges: rawEdges } = useMemo(() => {
    if (!graphIndex || seedIds.length === 0) {
      return { nodes: [] as Node<DocumentCardData>[], edges: [] as Edge[] };
    }
    return buildCardGraphElements(
      graphIndex,
      seedIds,
      expandedIds,
      navigationOverlay.childrenById,
      navigationOverlay.sectionNodes,
    );
  }, [graphIndex, seedIds, expandedIds, navigationOverlay]);

  useEffect(() => {
    onVisibleCountChange?.(rawNodes.length);
  }, [rawNodes.length, onVisibleCountChange]);

  const onToggleExpand = useCallback(
    (nodeId: string) => {
      if (!graphIndex) return;
      const children = navigationOverlay.childrenById.get(nodeId) ?? [];
      if (children.length === 0) return;
      setExpandedIds((prev) => toggleExpanded(nodeId, prev, navigationOverlay.childrenById));
    },
    [graphIndex, navigationOverlay],
  );

  return {
    graphIndex,
    seedIds,
    expandedIds,
    layoutKey,
    fitKey,
    rawNodes,
    rawEdges,
    onToggleExpand,
  };
}
