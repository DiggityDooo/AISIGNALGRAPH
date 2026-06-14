import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

export const DOCUMENT_CARD_WIDTH = 196;
export const DOCUMENT_CARD_HEIGHT = 72;

export interface DagreLayoutOptions {
  direction?: "LR" | "TB";
  nodeWidth?: number;
  nodeHeight?: number;
  nodesep?: number;
  ranksep?: number;
}

export function layoutWithDagre<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
  options: DagreLayoutOptions = {},
): Node<T>[] {
  const {
    direction = "LR",
    nodeWidth = DOCUMENT_CARD_WIDTH,
    nodeHeight = DOCUMENT_CARD_HEIGHT,
    nodesep = 56,
    ranksep = 104,
  } = options;

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep, ranksep });

  for (const node of nodes) {
    graph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  return nodes.map((node) => {
    const positioned = graph.node(node.id);
    return {
      ...node,
      position: {
        x: positioned.x - nodeWidth / 2,
        y: positioned.y - nodeHeight / 2,
      },
    };
  });
}
