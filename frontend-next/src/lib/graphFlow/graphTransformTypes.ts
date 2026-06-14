import type { GraphApiNode } from "@/components/graph-flow/fetchGraphApi";

export interface CyclicEdge {
  source: string;
  target: string;
}

export type GraphIndexSerializable = {
  nodeById: Record<string, GraphApiNode>;
  childrenById: Record<string, string[]>;
  rootIds: string[];
  cyclicEdges: CyclicEdge[];
};

export type BuildTreeResult = {
  tree: import("react-d3-tree").RawNodeDatum;
  cyclicEdges: CyclicEdge[];
};
