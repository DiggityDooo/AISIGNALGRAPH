"use client";

import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import type { GraphApiNode, GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import { accentForType, nodeTypeOf } from "@/lib/graphFlow/nodeColors";
import { degreeBasedSize } from "@/lib/graphFlow/nodeSizing";
import type { GraphQualityProfile } from "@/lib/graph/mobileProfile";
import { bindWebglContextLossHandler } from "@/lib/graph/webglGuard";
import type { GraphNodeSummary } from "@/lib/graph/types";
import {
  applyLayoutPositions,
  latticeLayoutSettings,
  PROGRESSIVE_CHUNK_SIZE,
  serializeGraphForLayout,
  type LatticeLayoutPositions,
} from "@/lib/graphFlow/latticeLayout";
import { createLayoutClient, type LayoutClient } from "@/lib/graphFlow/latticeLayoutClient";

function toNodeSummary(node: GraphApiNode, graph: Graph): GraphNodeSummary {
  const neighbors = graph.neighbors(node.id).map((neighborId) => {
    const attrs = graph.getNodeAttributes(neighborId) as GraphApiNode;
    return { id: neighborId, label: attrs.label ?? neighborId };
  });
  return {
    id: node.id,
    label: node.label ?? node.id,
    type: nodeTypeOf(node),
    summary: typeof node.summary === "string" ? node.summary : undefined,
    description: node.description,
    community_name:
      typeof node.community_name === "string" ? node.community_name : undefined,
    route: node.route,
    neighbors,
  };
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

const LATTICE_POSITIONS_KEY = "aisignalgraph-lattice-positions-v1";

const FOCUS_RATIO_MIN = 0.5;
const FOCUS_RATIO_MAX = 1.2;
const FOCUS_RATIO_PADDING = 1.3;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** FNV-1a hash for deterministic per-node pseudo-random values. */
function hashString(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic fallback position in the initial scatter range. */
function deterministicPosition(id: string): { x: number; y: number } {
  const h = hashString(id);
  const rand = (salt: number): number => {
    let x = (h ^ salt) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 2246822519);
    x = Math.imul(x ^ (x >>> 13), 3266489917);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };
  return { x: rand(1) * 100, y: rand(2) * 100 };
}

/**
 * Replace any non-finite node position with the last saved position, or a
 * deterministic fallback. Guards against ForceAtlas2 divergence leaking NaN
 * into live graph attributes (which the camera focus path reads directly).
 */
function sanitizeGraphPositions(graph: Graph, saved: SavedPositions): void {
  graph.forEachNode((nodeId, attrs) => {
    const x = Number(attrs.x);
    const y = Number(attrs.y);
    if (Number.isFinite(x) && Number.isFinite(y)) return;
    const fallback = saved.get(nodeId) ?? deterministicPosition(nodeId);
    graph.setNodeAttribute(nodeId, "x", fallback.x);
    graph.setNodeAttribute(nodeId, "y", fallback.y);
  });
}

function loadLatticePositions(): SavedPositions {
  try {
    const raw = localStorage.getItem(LATTICE_POSITIONS_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>;
    const map = new Map<string, { x: number; y: number }>();
    for (const [id, pos] of Object.entries(parsed)) {
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        map.set(id, { x: pos.x, y: pos.y });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveLatticePositions(positions: SavedPositions): void {
  try {
    const obj: Record<string, { x: number; y: number }> = {};
    positions.forEach((pos, id) => {
      obj[id] = pos;
    });
    localStorage.setItem(LATTICE_POSITIONS_KEY, JSON.stringify(obj));
  } catch {
    // Storage may be unavailable or full — non-fatal.
  }
}

function getGraphExtent(graph: Graph): { width: number; height: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  graph.forEachNode((_nodeId, attrs) => {
    const x = Number(attrs.x);
    const y = Number(attrs.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  if (!Number.isFinite(minX)) return { width: 0, height: 0 };
  return {
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

/**
 * Compute a Sigma camera ratio that frames the clicked node plus its
 * neighbors. The ratio is clamped so the camera never zooms past the node
 * (too far in) or out to the full graph (too far out).
 */
function computeFocusRatio(graph: Graph, nodeId: string): number {
  const nodeAttrs = graph.getNodeAttributes(nodeId) as GraphApiNode & {
    x: number;
    y: number;
  };
  const nodeX = Number(nodeAttrs.x);
  const nodeY = Number(nodeAttrs.y);
  if (!Number.isFinite(nodeX) || !Number.isFinite(nodeY)) {
    return FOCUS_RATIO_MIN;
  }

  let minX = nodeX;
  let maxX = nodeX;
  let minY = nodeY;
  let maxY = nodeY;
  for (const neighborId of graph.neighbors(nodeId)) {
    const attrs = graph.getNodeAttributes(neighborId) as GraphApiNode & {
      x: number;
      y: number;
    };
    const x = Number(attrs.x);
    const y = Number(attrs.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const bboxSpan = Math.max(maxX - minX, maxY - minY, 1);
  const extent = getGraphExtent(graph);
  const graphSpan = Math.max(extent.width, extent.height);
  if (graphSpan <= 0) return FOCUS_RATIO_MIN;

  const rawRatio = (bboxSpan * FOCUS_RATIO_PADDING) / graphSpan;
  return Math.min(FOCUS_RATIO_MAX, Math.max(FOCUS_RATIO_MIN, rawRatio));
}

function runProgressiveLayout(
  graph: Graph,
  renderer: Sigma,
  maxIterations: number,
  savedPositions: SavedPositions,
  onComplete: (positions: SavedPositions) => void,
): () => void {
  const settings = latticeLayoutSettings(graph);
  let currentIteration = 0;
  let animationFrameId: number | null = null;

  const runLayoutStep = () => {
    if (currentIteration >= maxIterations) {
      // Sanitize before reading: a diverged ForceAtlas2 run can leave NaN
      // in live attributes.
      sanitizeGraphPositions(graph, savedPositions);
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

function mountSigmaRenderer(
  graph: Graph,
  container: HTMLDivElement,
  quality: GraphQualityProfile,
): Sigma {
  return new Sigma(graph, container, {
    renderLabels: quality.renderLabels,
    labelSize: VISUALS.labelSize,
    labelColor: { color: VISUALS.labelColor },
    defaultNodeColor: VISUALS.defaultNodeColor,
    defaultEdgeColor: VISUALS.edgeColor,
    labelGridCellSize: VISUALS.labelGridCellSize,
    labelDensity: quality.labelDensity,
    labelRenderedSizeThreshold: quality.labelRenderedSizeThreshold,
    minEdgeThickness: VISUALS.minEdgeThickness,
  });
}

export interface LatticeRendererOptions {
  quality: GraphQualityProfile;
  onNodeSelect?: (node: GraphNodeSummary | null) => void;
  onStatsChange?: (stats: { nodes: number; edges: number }) => void;
  onVisibleCountChange?: (visible: number) => void;
  onBuildingChange: (building: boolean) => void;
  /** Called on WebGL context loss. The React adapter owns the retry counter
   * (rebuild once, then declare the device out of GPU memory). */
  onContextLoss: () => void;
}

/**
 * Deep Sigma/WebGL engine for the lattice graph. Owns the graphology graph,
 * the Sigma renderer, layout client, position persistence and all interaction
 * wiring. The React component is a thin adapter that constructs this once per
 * mount and forwards imperative + metadata calls to it.
 */
export class LatticeRenderer {
  private readonly container: HTMLDivElement;
  private readonly options: LatticeRendererOptions;

  private graph: Graph | null = null;
  private renderer: Sigma | null = null;
  private positions: SavedPositions = loadLatticePositions();
  private focus: { id: string | null; neighbors: Set<string> } = {
    id: null,
    neighbors: new Set(),
  };
  private mountedTopology: string | null = null;
  private layoutClient: LayoutClient | null = null;
  private layoutWorkerFailed = false;

  private controller: AbortController | null = null;
  private cancelProgressive: (() => void) | null = null;
  private cancelled = false;

  /** Mirrors the `building` callback synchronously so imperative handlers can
   * guard against animating the camera before the layout has settled. */
  private building = true;

  /** Idle float animation state: base positions plus per-node drift params. */
  private floatFrameId: number | null = null;
  private floatBase: Map<
    string,
    { x: number; y: number; phaseX: number; phaseY: number; speed: number }
  > | null = null;
  private floatTick = 0;
  private floatStart = 0;

  constructor(container: HTMLDivElement, options: LatticeRendererOptions) {
    this.container = container;
    this.options = options;
  }

  private setBuilding(value: boolean): void {
    this.building = value;
    this.options.onBuildingChange(value);
  }

  private mergeAndSavePositions(next: LatticeLayoutPositions | SavedPositions): void {
    const entries =
      next instanceof Map ? next.entries() : Object.entries(next);
    for (const [id, pos] of entries) {
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        this.positions.set(id, { x: pos.x, y: pos.y });
      }
    }
    saveLatticePositions(this.positions);
  }

  private applyFocus(nodeId: string): void {
    const graph = this.graph;
    const renderer = this.renderer;
    if (!graph || !renderer || !graph.hasNode(nodeId)) return;
    this.focus = { id: nodeId, neighbors: new Set(graph.neighbors(nodeId)) };
    const nodeAttrs = graph.getNodeAttributes(nodeId) as GraphApiNode & { x: number; y: number };
    this.options.onNodeSelect?.(toNodeSummary(nodeAttrs, graph));
    renderer.refresh();
    const ratio = computeFocusRatio(graph, nodeId);
    const duration = this.options.quality.isLowTier || prefersReducedMotion() ? 0 : 500;
    if (!this.building) {
      // Guard the animate call itself: a NaN position here zooms the camera
      // into empty space with no way back.
      const x = Number(nodeAttrs.x);
      const y = Number(nodeAttrs.y);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(ratio)) {
        renderer.getCamera().animate({ x, y, ratio }, { duration });
      }
    }
  }

  private disposeLayoutClient(): void {
    this.layoutClient?.dispose();
    this.layoutClient = null;
  }

  /**
   * Gentle idle drift: cheap sine/cosine offsets around the laid-out base
   * positions, throttled to ~30fps with a single refresh per tick. Skipped
   * for reduced-motion users, low-tier devices, and large graphs.
   */
  private startFloat(): void {
    this.stopFloat();
    const graph = this.graph;
    const renderer = this.renderer;
    if (!graph || !renderer || this.building) return;
    if (prefersReducedMotion() || this.options.quality.isLowTier) return;
    if (graph.order === 0 || graph.order > 3000) return;

    const extent = getGraphExtent(graph);
    const amp = Math.min(8, Math.max(0.5, 0.004 * Math.max(extent.width, extent.height)));

    const base = new Map<string, { x: number; y: number; phaseX: number; phaseY: number; speed: number }>();
    graph.forEachNode((nodeId, attrs) => {
      const x = Number(attrs.x);
      const y = Number(attrs.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const h = hashString(nodeId);
      base.set(nodeId, {
        x,
        y,
        phaseX: (h % 628) / 100,
        phaseY: ((h >>> 8) % 628) / 100,
        speed: 0.4 + (((h >>> 16) % 100) / 100) * 0.6,
      });
    });
    if (base.size === 0) return;

    this.floatBase = base;
    this.floatTick = 0;
    this.floatStart = performance.now();

    const tick = () => {
      if (this.floatFrameId === null) return;
      this.floatFrameId = requestAnimationFrame(tick);
      this.floatTick += 1;
      if (this.floatTick % 2 !== 0) return; // ~30fps throttle
      const g = this.graph;
      const r = this.renderer;
      const b = this.floatBase;
      if (!g || !r || !b) return;
      const t = (performance.now() - this.floatStart) / 1000;
      for (const [nodeId, n] of b) {
        g.setNodeAttribute(nodeId, "x", n.x + amp * Math.sin(t * n.speed + n.phaseX));
        g.setNodeAttribute(nodeId, "y", n.y + amp * Math.cos(t * n.speed * 0.87 + n.phaseY));
      }
      r.refresh();
    };
    this.floatFrameId = requestAnimationFrame(tick);
  }

  /**
   * Cancel the float loop. With `restore` (dispose), write the base
   * positions back into the graph attributes and refresh once so nothing is
   * left mid-drift.
   */
  private stopFloat(restore = false): void {
    if (this.floatFrameId !== null) {
      cancelAnimationFrame(this.floatFrameId);
      this.floatFrameId = null;
    }
    if (restore && this.floatBase && this.graph) {
      const graph = this.graph;
      this.floatBase.forEach((n, nodeId) => {
        if (graph.hasNode(nodeId)) {
          graph.setNodeAttribute(nodeId, "x", n.x);
          graph.setNodeAttribute(nodeId, "y", n.y);
        }
      });
      this.renderer?.refresh();
    }
    this.floatBase = null;
    this.floatTick = 0;
  }

  /** Build graph from payload, run layout (worker or progressive fallback),
   * mount Sigma, wire reducers + click handlers, report stats. Honors an
   * internal AbortController for cancellation. */
  async update(
    payload: GraphApiPayload,
    topologyRevision: string | null,
  ): Promise<void> {
    this.cancelled = true;
    this.controller?.abort();
    this.cancelProgressive?.();
    this.cancelProgressive = null;
    this.stopFloat(); // graph is discarded below; no restore needed
    this.cancelled = false;

    const controller = new AbortController();
    this.controller = controller;
    const signal = controller.signal;

    this.mountedTopology = topologyRevision;

    const { graph, newNodeCount } = buildGraph(payload, this.positions);
    this.graph = graph;

    let useProgressiveFallback = false;

    if (newNodeCount > 0) {
      this.setBuilding(true);

      if (!this.layoutClient && !this.layoutWorkerFailed) {
        this.layoutClient = createLayoutClient();
      }
      const client = this.layoutClient;

      try {
        const positions = client
          ? await client.run(
              serializeGraphForLayout(graph),
              signal,
              this.options.quality.layoutIterations,
            )
          : await Promise.reject(new Error("layout worker unavailable"));
        if (this.cancelled || signal.aborted) return;
        applyLayoutPositions(graph, positions);
        sanitizeGraphPositions(graph, this.positions);
        this.mergeAndSavePositions(positions);
      } catch (error) {
        if (this.cancelled || signal.aborted) return;
        this.disposeLayoutClient();
        this.layoutWorkerFailed = true;
        useProgressiveFallback = true;
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("[lattice] layout failed; falling back to progressive", error);
        }
      }
    }

    if (this.cancelled) return;

    const renderer = mountSigmaRenderer(graph, this.container, this.options.quality);
    this.renderer = renderer;

    bindWebglContextLossHandler(this.container, () => {
      if (this.cancelled) return;
      this.options.onContextLoss();
    });

    if (newNodeCount > 0 && useProgressiveFallback) {
      this.cancelProgressive = runProgressiveLayout(
        graph,
        renderer,
        this.options.quality.layoutIterations,
        this.positions,
        (nextPositions) => {
          if (this.cancelled) return;
          this.mergeAndSavePositions(nextPositions);
          this.setBuilding(false);
          this.startFloat();
        },
      );
    } else {
      this.setBuilding(false);
      this.startFloat();
    }

    renderer.setSetting("nodeReducer", (nodeId, data) => {
      const focus = this.focus;
      if (!focus.id) return data;
      if (nodeId === focus.id || focus.neighbors.has(nodeId)) {
        return { ...data, zIndex: 999, highlighted: nodeId === focus.id };
      }
      return { ...data, label: "", color: VISUALS.unfocusedNodeColor };
    });

    renderer.setSetting("edgeReducer", (edgeId, data) => {
      const focus = this.focus;
      if (!focus.id) return data;
      if (graph.hasExtremity(edgeId, focus.id)) {
        return { ...data, color: VISUALS.focusedEdgeColor, size: VISUALS.focusedEdgeSize, zIndex: 998 };
      }
      return { ...data, hidden: true };
    });

    renderer.on("clickNode", ({ node }) => {
      this.applyFocus(node);
    });

    renderer.on("clickStage", () => {
      this.focus = { id: null, neighbors: new Set() };
      this.options.onNodeSelect?.(null);
      renderer.refresh();
    });

    this.options.onVisibleCountChange?.(graph.order);
    this.options.onStatsChange?.({
      nodes: graph.order,
      edges: graph.size,
    });
  }

  /** Metadata-only patch (labels/colors/sizes) when topology unchanged. No remount. */
  applyMetadata(payload: GraphApiPayload, topologyRevision: string | null): void {
    const graph = this.graph;
    const renderer = this.renderer;
    if (!graph || !renderer) return;
    if (this.mountedTopology !== topologyRevision) return;

    applyNodeMetadata(graph, payload);
    renderer.refresh();
  }

  focusNode(id: string): void {
    this.applyFocus(id);
  }

  fit(): void {
    this.renderer?.getCamera().animatedReset({
      duration: this.options.quality.isLowTier || prefersReducedMotion() ? 0 : 500,
    });
  }

  dispose(): void {
    this.cancelled = true;
    this.controller?.abort();
    this.cancelProgressive?.();
    this.cancelProgressive = null;
    this.disposeLayoutClient();
    this.layoutWorkerFailed = false;
    this.stopFloat(true);
    this.renderer?.kill();
    this.renderer = null;
    this.graph = null;
    this.mountedTopology = null;
    this.focus = { id: null, neighbors: new Set() };
  }
}
