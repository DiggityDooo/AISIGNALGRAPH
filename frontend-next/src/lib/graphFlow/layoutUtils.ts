import dagre from "@dagrejs/dagre";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import type { Edge, Node } from "@xyflow/react";
import { graphPayloadFingerprint } from "@/lib/graphFlow/graphFingerprint";
import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";

export const DOCUMENT_CARD_WIDTH = 280;
export const DOCUMENT_CARD_HEIGHT = 100;

export type LayoutMode = "flow" | "tree";

const LAYOUT_CONFIG: Record<
  LayoutMode,
  { rankdir: "LR" | "TB"; nodesep: number; ranksep: number }
> = {
  flow: { rankdir: "LR", nodesep: 80, ranksep: 150 },
  tree: { rankdir: "TB", nodesep: 50, ranksep: 100 },
};

const layoutCache = new Map<string, { nodes: Node<Record<string, unknown>>[]; edges: Edge[] }>();
const MAX_LAYOUT_CACHE_ENTRIES = 64;
let lastFingerprint = "";

function layoutCacheKey(
  nodes: Node<Record<string, unknown>>[],
  edges: Edge[],
  mode: LayoutMode,
  fingerprint?: string,
): string {
  const fp = fingerprint ?? "";
  const nodeKey = nodes.map((n) => n.id).sort().join(",");
  const edgeKey = edges
    .map((edge) => `${edge.id}:${edge.source}->${edge.target}`)
    .sort()
    .join(",");
  return `${fp}|${mode}|${nodeKey}|${edgeKey}`;
}

export function clearLayoutCache(fingerprint?: string): void {
  if (fingerprint === undefined) {
    layoutCache.clear();
    lastFingerprint = "";
  } else if (fingerprint !== lastFingerprint) {
    layoutCache.clear();
    lastFingerprint = fingerprint;
  }
}

export function getLayoutedElements<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
  mode: LayoutMode,
  options?: { fingerprint?: string; payload?: GraphApiPayload | null },
): { nodes: Node<T>[]; edges: Edge[] } {
  const fingerprint =
    options?.fingerprint ??
    (options?.payload ? graphPayloadFingerprint(options.payload) : "");

  if (fingerprint) clearLayoutCache(fingerprint);

  const cacheKey = layoutCacheKey(
    nodes as Node<Record<string, unknown>>[],
    edges,
    mode,
    fingerprint,
  );
  const cached = layoutCache.get(cacheKey);
  if (cached) {
    layoutCache.delete(cacheKey);
    layoutCache.set(cacheKey, cached);
    const positionedById = new Map(
      cached.nodes.map((node) => [node.id, { position: node.position, style: node.style }]),
    );
    return {
      nodes: nodes.map((node) => {
        const positioned = positionedById.get(node.id);
        if (!positioned) return node;
        return {
          ...node,
          style: positioned.style,
          position: positioned.position,
        };
      }) as Node<T>[],
      edges,
    };
  }

  const { rankdir, nodesep, ranksep } = LAYOUT_CONFIG[mode];

  const sizeOf = (node: Node<T>): { width: number; height: number } => {
    const data = node.data as { width?: unknown; height?: unknown } | undefined;
    const width = typeof data?.width === "number" ? data.width : DOCUMENT_CARD_WIDTH;
    const height = typeof data?.height === "number" ? data.height : DOCUMENT_CARD_HEIGHT;
    return { width, height };
  };

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir, nodesep, ranksep });

  for (const node of nodes) {
    graph.setNode(node.id, sizeOf(node));
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const layoutedNodes = nodes.map((node) => {
    const positioned = graph.node(node.id);
    const { width, height } = sizeOf(node);
    const cx = typeof positioned?.x === "number" ? positioned.x : 0;
    const cy = typeof positioned?.y === "number" ? positioned.y : 0;
    return {
      ...node,
      style: { width, height },
      position: {
        x: cx - width / 2,
        y: cy - height / 2,
      },
    };
  });

  const result = { nodes: layoutedNodes, edges };
  layoutCache.set(cacheKey, {
    nodes: layoutedNodes as Node<Record<string, unknown>>[],
    edges,
  });
  if (layoutCache.size > MAX_LAYOUT_CACHE_ENTRIES) {
    const oldestKey = layoutCache.keys().next().value;
    if (oldestKey !== undefined) layoutCache.delete(oldestKey);
  }
  return result;
}

export interface ForceLayoutOptions<N extends SimulationNodeDatum> {
  chargeStrength?: number;
  collidePadding?: number;
  collideRadius?: (d: N) => number;
  linkDistance?: number;
  linkStrength?: number;
  anchorStrength?: number;
  centerStrength?: number;
  warmupTicks?: number;
  cx?: number;
  cy?: number;
  getAnchorX?: (d: N) => number;
  getAnchorY?: (d: N) => number;
  velocityDecay?: number;
}

export function runForceLayout<
  N extends SimulationNodeDatum & { anchorX?: number; anchorY?: number },
>(
  nodes: N[],
  links: { source: N; target: N }[],
  options: ForceLayoutOptions<N> = {},
): Simulation<N, undefined> {
  const {
    chargeStrength = -800,
    collidePadding = 12,
    collideRadius,
    linkDistance = 140,
    linkStrength = 0.2,
    anchorStrength = 0.045,
    centerStrength = 0.04,
    warmupTicks = 0,
    cx = 0,
    cy = 0,
    getAnchorX = (d) => d.anchorX ?? 0,
    getAnchorY = (d) => d.anchorY ?? 0,
    velocityDecay = 0.22,
  } = options;

  const sim = forceSimulation(nodes)
    .velocityDecay(velocityDecay)
    .force(
      "link",
      forceLink<N, { source: N; target: N }>(links)
        .distance(linkDistance)
        .strength(linkStrength),
    )
    .force("charge", forceManyBody<N>().strength(chargeStrength).distanceMax(600))
    .force(
      "collide",
      forceCollide<N>((d) => {
        const base = collideRadius ? collideRadius(d) : 18;
        return base + collidePadding;
      }),
    )
    .force("center", forceCenter(cx, cy).strength(centerStrength))
    .force("x", forceX<N>(getAnchorX).strength(anchorStrength))
    .force("y", forceY<N>(getAnchorY).strength(anchorStrength));

  sim.stop();
  for (let i = 0; i < warmupTicks; i++) {
    sim.tick();
  }

  return sim;
}
