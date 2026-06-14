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

export function getLayoutedElements<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
  mode: LayoutMode,
): { nodes: Node<T>[]; edges: Edge[] } {
  const { rankdir, nodesep, ranksep } = LAYOUT_CONFIG[mode];
  const width = DOCUMENT_CARD_WIDTH;
  const height = DOCUMENT_CARD_HEIGHT;

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir, nodesep, ranksep });

  for (const node of nodes) {
    graph.setNode(node.id, { width, height });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const layoutedNodes = nodes.map((node) => {
    const positioned = graph.node(node.id);
    return {
      ...node,
      style: { width, height },
      data: {
        ...node.data,
        layoutWidth: width,
        layoutHeight: height,
      },
      position: {
        x: positioned.x - width / 2,
        y: positioned.y - height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
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
