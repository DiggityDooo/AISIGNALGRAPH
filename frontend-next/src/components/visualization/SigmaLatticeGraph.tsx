"use client";

import { useEffect, useRef, useState } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import type { GraphApiNode, GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import { accentForType, nodeTypeOf } from "@/lib/graphFlow/nodeColors";
import { degreeBasedSize } from "@/lib/graphFlow/nodeSizing";
import { buildLatticeFocusHref } from "@/lib/graphFlow/latticeBridge";

export interface SigmaLatticeGraphProps {
  payload: GraphApiPayload | null;
  dataRevision?: string | null;
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

const LAYOUT_ITERATIONS = 120;

type SavedPositions = Map<string, { x: number; y: number }>;

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

export default function SigmaLatticeGraph({
  payload,
  dataRevision,
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
  /** Callback kept in a ref so its identity isn't an effect dependency —
   * otherwise a new closure from the parent would tear down and rebuild the
   * entire Sigma/WebGL instance + layout. */
  const onVisibleCountChangeRef = useRef(onVisibleCountChange);
  const [focusedNode, setFocusedNode] = useState<GraphApiNode | null>(null);
  const [building, setBuilding] = useState(true);

  useEffect(() => {
    onVisibleCountChangeRef.current = onVisibleCountChange;
  }, [onVisibleCountChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !payload || payload.nodes.length === 0) return;

    const { graph, newNodeCount } = buildGraph(payload, positionsRef.current);
    let animationFrameId: number | null = null;

    const renderer = new Sigma(graph, container, {
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

    // Run progressive ForceAtlas2 layout over multiple animation frames
    // so the main thread remains fully interactive and responsive.
    if (newNodeCount > 0) {
      setBuilding(true);
      const settings = {
        ...forceAtlas2.inferSettings(graph),
        barnesHutOptimize: true,
        gravity: 0.03,
        scalingRatio: 100,
        strongGravityMode: false,
        outboundAttractionDistribution: true,
        linLogMode: true,
        adjustSizes: true,
        slowDown: 2,
      };

      let currentIteration = 0;
      const CHUNK_SIZE = 10;

      const runLayoutStep = () => {
        if (currentIteration >= LAYOUT_ITERATIONS) {
          setBuilding(false);
          // Persist the resolved positions for the next rebuild.
          const nextPositions: SavedPositions = new Map();
          graph.forEachNode((nodeId, attrs) => {
            nextPositions.set(nodeId, { x: attrs.x as number, y: attrs.y as number });
          });
          positionsRef.current = nextPositions;
          return;
        }

        forceAtlas2.assign(graph, { iterations: CHUNK_SIZE, settings });
        renderer.refresh();
        currentIteration += CHUNK_SIZE;
        animationFrameId = requestAnimationFrame(runLayoutStep);
      };

      animationFrameId = requestAnimationFrame(runLayoutStep);
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

    // Click focuses a node's neighborhood and centers camera on selection
    renderer.on("clickNode", ({ node }) => {
      focusRef.current = { id: node, neighbors: new Set(graph.neighbors(node)) };
      const nodeAttrs = graph.getNodeAttributes(node) as GraphApiNode & { x: number; y: number };
      setFocusedNode(nodeAttrs);
      renderer.refresh();

      // Smoothly zoom in and center the viewport on the selected node
      renderer.getCamera().animate(
        { x: nodeAttrs.x, y: nodeAttrs.y, ratio: 0.2 },
        { duration: 500 }
      );
    });

    renderer.on("clickStage", () => {
      focusRef.current = { id: null, neighbors: new Set() };
      setFocusedNode(null);
      renderer.refresh();
    });

    onVisibleCountChangeRef.current?.(graph.order);

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      renderer.kill();
      focusRef.current = { id: null, neighbors: new Set() };
      setFocusedNode(null);
    };
  }, [payload, dataRevision]);

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
