"use client";

import { useEffect, useRef, useState } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import type { GraphApiNode, GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import { accentForType, nodeTypeOf } from "@/lib/graphFlow/nodeColors";
import { degreeBasedSize } from "@/lib/graphFlow/nodeSizing";
import { buildLatticeFocusHref } from "@/lib/graphFlow/latticeBridge";
import {
  applyLayoutPositions,
  LAYOUT_ITERATIONS,
  latticeLayoutSettings,
  PROGRESSIVE_CHUNK_SIZE,
  serializeGraphForLayout,
  type LatticeLayoutPositions,
} from "@/lib/graphFlow/latticeLayout";

export interface SigmaLatticeGraphProps {
  payload: GraphApiPayload | null;
  dataRevision?: string | null;
  topologyRevision?: string | null;
  onVisibleCountChange?: (visible: number) => void;
}

/**
 * Mirrors /graph's graph.js visual constants (OBSIDIAN_GRAPH) so Lattice
 * keeps the same look — kept local instead of imported since graph.js's
 * constant isn't exported and isn't safe to import (module-level globals,
 * see buildGraph() below). Node *colors* deliberately come from nodeColors.ts
 * instead (accentForType), shared with Tree/Flow, so the three /graph/flow
 * modes match each other rather than matching /graph's separate palette.
 */
const VISUALS = {
  defaultNodeColor: "#8a8a8a",
  edgeColor: "rgba(140, 140, 140, 0.18)",
  edgeSize: 0.35,
  labelColor: "#dcddde",
  labelSize: 10,
  labelDensity: 0.08,
  labelGridCellSize: 120,
  labelRenderedSizeThreshold: 10,
  minEdgeThickness: 0.4,
  unfocusedNodeColor: "rgba(150, 150, 150, 0.35)",
  focusedEdgeColor: "rgba(180, 180, 180, 0.45)",
  focusedEdgeSize: 1.2,
} as const;

type SavedPositions = Map<string, { x: number; y: number }>;
type LayoutWorker = Worker;

function createLayoutWorker(): LayoutWorker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("../../lib/graphFlow/latticeLayout.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return null;
  }
}

function runWorkerLayout(
  worker: LayoutWorker,
  input: ReturnType<typeof serializeGraphForLayout>,
  signal: AbortSignal,
): Promise<LatticeLayoutPositions> {
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
        positions?: LatticeLayoutPositions;
        message?: string;
      };
      if (data.requestId !== requestId) return;
      cleanup();
      if (data.type === "error") reject(new Error(data.message ?? "layout worker error"));
      else resolve(data.positions as LatticeLayoutPositions);
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    };
    const onMessageError = () => {
      cleanup();
      reject(new Error("Lattice layout worker returned an unreadable message"));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Lattice layout cancelled", "AbortError"));
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
      worker.postMessage({ type: "layout", requestId, input });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function runProgressiveLayout(
  graph: Graph,
  renderer: Sigma,
  onComplete: (positions: SavedPositions) => void,
): () => void {
  const settings = latticeLayoutSettings(graph);
  let currentIteration = 0;
  let animationFrameId: number | null = null;

  const runLayoutStep = () => {
    if (currentIteration >= LAYOUT_ITERATIONS) {
      const nextPositions: SavedPositions = new Map();
      graph.forEachNode((nodeId, attrs) => {
        nextPositions.set(nodeId, { x: attrs.x as number, y: attrs.y as number });
      });
      onComplete(nextPositions);
      return;
    }

    forceAtlas2.assign(graph, { iterations: PROGRESSIVE_CHUNK_SIZE, settings });
    renderer.refresh();
    currentIteration += PROGRESSIVE_CHUNK_SIZE;
    animationFrameId = requestAnimationFrame(runLayoutStep);
  };

  animationFrameId = requestAnimationFrame(runLayoutStep);

  return () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
  };
}

/**
 * Builds a fresh graphology Graph from the full payload — every node/edge,
 * no cap. Node colors reuse nodeColors.ts (shared with Tree/Flow); node size
 * is set in a second pass from graphology's own `graph.degree()`, the single
 * source of truth (matches graph.js's applyDegreeBasedNodeSizes — avoids the
 * size/edge-count mismatch you'd get sizing from a separately-deduped degree
 * map that ignores flow_kind multi-edges).
 *
 * Existing node positions are seeded from `savedPositions` so a poll-driven
 * rebuild doesn't randomly reshuffle the whole lattice; `newNodeCount` lets
 * the caller skip re-layout entirely when topology is unchanged.
 */
function buildGraph(
  payload: GraphApiPayload,
  savedPositions: SavedPositions,
): { graph: Graph; newNodeCount: number } {
  const graph = new Graph({ multi: true });
  let newNodeCount = 0;

  for (const node of payload.nodes) {
    if (!node.id || graph.hasNode(node.id)) continue;
    const saved = savedPositions.get(node.id);
    if (!saved) newNodeCount += 1;
    graph.addNode(node.id, {
      ...node,
      label: node.label ?? node.id,
      size: 2,
      color: accentForType(nodeTypeOf(node)),
      x: saved ? saved.x : Math.random() * 100,
      y: saved ? saved.y : Math.random() * 100,
      type: "circle",
    });
  }

  for (const edge of payload.edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    const key = `${edge.source}->${edge.target}:${edge.flow_kind ?? "edge"}`;
    if (graph.hasEdge(key)) continue;
    graph.addEdgeWithKey(key, edge.source, edge.target, {
      color: VISUALS.edgeColor,
      size: VISUALS.edgeSize,
      type: "line",
    });
  }

  // Degree-based sizing from the true graph degree, after all edges exist.
  graph.forEachNode((nodeId) => {
    graph.setNodeAttribute(nodeId, "size", degreeBasedSize(graph.degree(nodeId), { min: 2, max: 8 }));
  });

  return { graph, newNodeCount };
}

function applyNodeMetadata(graph: Graph, payload: GraphApiPayload): void {
  for (const node of payload.nodes) {
    if (!node.id || !graph.hasNode(node.id)) continue;
    graph.mergeNodeAttributes(node.id, {
      ...node,
      label: node.label ?? node.id,
      color: accentForType(nodeTypeOf(node)),
      size: degreeBasedSize(graph.degree(node.id), { min: 2, max: 8 }),
    });
  }
}

function mountSigmaRenderer(graph: Graph, container: HTMLDivElement): Sigma {
  return new Sigma(graph, container, {
    renderLabels: true,
    labelSize: VISUALS.labelSize,
    labelColor: { color: VISUALS.labelColor },
    defaultNodeColor: VISUALS.defaultNodeColor,
    defaultEdgeColor: VISUALS.edgeColor,
    labelGridCellSize: VISUALS.labelGridCellSize,
    labelDensity: VISUALS.labelDensity,
    labelRenderedSizeThreshold: VISUALS.labelRenderedSizeThreshold,
    minEdgeThickness: VISUALS.minEdgeThickness,
  });
}

export default function SigmaLatticeGraph({
  payload,
  dataRevision,
  topologyRevision,
  onVisibleCountChange,
}: SigmaLatticeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  /** Reducer closures read this synchronously — a ref avoids re-registering
   * the reducers (and re-running Sigma's render pass setup) on every click. */
  const focusRef = useRef<{ id: string | null; neighbors: Set<string> }>({
    id: null,
    neighbors: new Set(),
  });
  /** Node positions persisted across rebuilds so a poll-driven data refresh
   * doesn't reshuffle the whole lattice. */
  const positionsRef = useRef<SavedPositions>(new Map());
  const rendererRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const mountedTopologyRef = useRef<string | null>(null);
  const layoutWorkerRef = useRef<LayoutWorker | null>(null);
  const layoutWorkerFailedRef = useRef(false);
  /** Callback kept in a ref so its identity isn't an effect dependency —
   * otherwise a new closure from the parent would tear down and rebuild the
   * entire Sigma/WebGL instance + layout. */
  const onVisibleCountChangeRef = useRef(onVisibleCountChange);
  const [focusedNode, setFocusedNode] = useState<GraphApiNode | null>(null);
  const [building, setBuilding] = useState(true);

  useEffect(() => {
    onVisibleCountChangeRef.current = onVisibleCountChange;
  }, [onVisibleCountChange]);

  useEffect(
    () => () => {
      layoutWorkerRef.current?.terminate();
      layoutWorkerRef.current = null;
      layoutWorkerFailedRef.current = false;
    },
    [],
  );

  // Metadata-only poll updates: patch labels/colors/sizes without remounting Sigma
  // or re-running ForceAtlas2 when topology is unchanged.
  useEffect(() => {
    const graph = graphRef.current;
    const renderer = rendererRef.current;
    if (!graph || !renderer || !payload) return;
    if (mountedTopologyRef.current !== (topologyRevision ?? null)) return;

    applyNodeMetadata(graph, payload);
    renderer.refresh();
  }, [payload, dataRevision, topologyRevision]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !payload || payload.nodes.length === 0) return;

    let cancelled = false;
    let cancelProgressiveLayout: (() => void) | null = null;
    const controller = new AbortController();

    void (async () => {
      const topologyKey = topologyRevision ?? null;
      mountedTopologyRef.current = topologyKey;

      const { graph, newNodeCount } = buildGraph(payload, positionsRef.current);
      graphRef.current = graph;

      let useProgressiveFallback = false;

      if (newNodeCount > 0) {
        setBuilding(true);

        if (!layoutWorkerRef.current && !layoutWorkerFailedRef.current) {
          layoutWorkerRef.current = createLayoutWorker();
        }
        const worker = layoutWorkerRef.current;

        try {
          const positions = worker
            ? await runWorkerLayout(worker, serializeGraphForLayout(graph), controller.signal)
            : await Promise.reject(new Error("layout worker unavailable"));
          if (cancelled || controller.signal.aborted) return;
          applyLayoutPositions(graph, positions);
          positionsRef.current = new Map(Object.entries(positions));
        } catch {
          if (cancelled || controller.signal.aborted) return;
          if (worker) {
            worker.terminate();
            if (layoutWorkerRef.current === worker) layoutWorkerRef.current = null;
            layoutWorkerFailedRef.current = true;
          }
          useProgressiveFallback = true;
        }
      }

      if (cancelled) return;

      const renderer = mountSigmaRenderer(graph, container);
      rendererRef.current = renderer;

      if (newNodeCount > 0 && useProgressiveFallback) {
        cancelProgressiveLayout = runProgressiveLayout(graph, renderer, (nextPositions) => {
          if (cancelled) return;
          positionsRef.current = nextPositions;
          setBuilding(false);
        });
      } else {
        setBuilding(false);
      }

      renderer.setSetting("nodeReducer", (nodeId, data) => {
        const focus = focusRef.current;
        if (!focus.id) return data;
        if (nodeId === focus.id || focus.neighbors.has(nodeId)) {
          return { ...data, zIndex: 999, highlighted: nodeId === focus.id };
        }
        return { ...data, label: "", color: VISUALS.unfocusedNodeColor };
      });

      renderer.setSetting("edgeReducer", (edgeId, data) => {
        const focus = focusRef.current;
        if (!focus.id) return data;
        if (graph.hasExtremity(edgeId, focus.id)) {
          return { ...data, color: VISUALS.focusedEdgeColor, size: VISUALS.focusedEdgeSize, zIndex: 998 };
        }
        return { ...data, hidden: true };
      });

      renderer.on("clickNode", ({ node }) => {
        focusRef.current = { id: node, neighbors: new Set(graph.neighbors(node)) };
        const nodeAttrs = graph.getNodeAttributes(node) as GraphApiNode & { x: number; y: number };
        setFocusedNode(nodeAttrs);
        renderer.refresh();

        renderer.getCamera().animate(
          { x: nodeAttrs.x, y: nodeAttrs.y, ratio: 0.2 },
          { duration: 500 },
        );
      });

      renderer.on("clickStage", () => {
        focusRef.current = { id: null, neighbors: new Set() };
        setFocusedNode(null);
        renderer.refresh();
      });

      onVisibleCountChangeRef.current?.(graph.order);
    })();

    return () => {
      cancelled = true;
      controller.abort();
      cancelProgressiveLayout?.();
      rendererRef.current?.kill();
      rendererRef.current = null;
      graphRef.current = null;
      mountedTopologyRef.current = null;
      focusRef.current = { id: null, neighbors: new Set() };
      setFocusedNode(null);
    };
  }, [topologyRevision]);

  if (!payload || payload.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[#050202]">
        <p className="font-mono text-xs uppercase tracking-widest text-white/35">
          No signal lattice indexed
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-[#050202]">
      <div ref={containerRef} className="h-full w-full" />
      {building && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="font-mono text-sm uppercase tracking-widest text-primary animate-pulse">
            Assembling lattice…
          </p>
        </div>
      )}
      {focusedNode && (
        <div className="absolute bottom-4 left-4 glass-panel flex items-center gap-3 rounded border border-white/10 bg-black/60 px-3 py-2">
          <p className="font-mono text-[11px] text-white/85">{focusedNode.label ?? focusedNode.id}</p>
          <a
            href={buildLatticeFocusHref(focusedNode.id)}
            className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-cyan-300/90 hover:bg-cyan-500/20"
          >
            View in 3D
          </a>
        </div>
      )}
    </div>
  );
}
