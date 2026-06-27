import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { ForceAtlas2Settings } from "graphology-layout-forceatlas2";

export const LAYOUT_ITERATIONS = 120;

export const PROGRESSIVE_CHUNK_SIZE = 10;

export type LatticeLayoutNode = {
  id: string;
  x: number;
  y: number;
  size: number;
};

export type LatticeLayoutEdge = {
  source: string;
  target: string;
};

export type LatticeLayoutInput = {
  nodes: LatticeLayoutNode[];
  edges: LatticeLayoutEdge[];
};

export type LatticeLayoutPositions = Record<string, { x: number; y: number }>;

export function latticeLayoutSettings(graph: Graph): ForceAtlas2Settings {
  return {
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
}

export function serializeGraphForLayout(graph: Graph): LatticeLayoutInput {
  const nodes: LatticeLayoutNode[] = [];
  graph.forEachNode((id, attrs) => {
    nodes.push({
      id,
      x: attrs.x as number,
      y: attrs.y as number,
      size: attrs.size as number,
    });
  });

  const edges: LatticeLayoutEdge[] = [];
  graph.forEachEdge((_edge, _attrs, source, target) => {
    edges.push({ source, target });
  });

  return { nodes, edges };
}

export function applyLayoutPositions(graph: Graph, positions: LatticeLayoutPositions): void {
  for (const [id, pos] of Object.entries(positions)) {
    if (!graph.hasNode(id)) continue;
    graph.setNodeAttribute(id, "x", pos.x);
    graph.setNodeAttribute(id, "y", pos.y);
  }
}

export function collectGraphPositions(graph: Graph): LatticeLayoutPositions {
  const positions: LatticeLayoutPositions = {};
  graph.forEachNode((nodeId, attrs) => {
    positions[nodeId] = { x: attrs.x as number, y: attrs.y as number };
  });
  return positions;
}

export function buildGraphFromLayoutInput(input: LatticeLayoutInput): Graph {
  const graph = new Graph({ multi: true });

  for (const node of input.nodes) {
    if (graph.hasNode(node.id)) continue;
    graph.addNode(node.id, {
      x: node.x,
      y: node.y,
      size: node.size,
    });
  }

  for (const edge of input.edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    const key = `${edge.source}->${edge.target}`;
    if (graph.hasEdge(key)) continue;
    graph.addEdgeWithKey(key, edge.source, edge.target);
  }

  return graph;
}

export function runForceAtlas2Layout(
  graph: Graph,
  iterations: number = LAYOUT_ITERATIONS,
): LatticeLayoutPositions {
  forceAtlas2.assign(graph, {
    iterations,
    settings: latticeLayoutSettings(graph),
  });
  return collectGraphPositions(graph);
}
