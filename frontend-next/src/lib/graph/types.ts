export type GraphLens = "global" | "local";

export type GraphNodeSummary = {
  id: string;
  label: string;
  type: string;
  summary?: string;
  description?: string;
  community_name?: string;
  route?: string;
  neighbors: Array<{ id: string; label: string }>;
};

export type GraphFilterState = {
  searchQuery: string;
  lens: GraphLens;
  activeYear: number;
  activeEra: string;
  serverYearFilter: boolean;
  signalSpeed: number;
  visibleNodeTypes: ReadonlySet<string>;
};

export type GraphStats = {
  nodes: number;
  edges: number;
  signals?: number;
};

export type GraphHudBridge = {
  useReactHud?: boolean;
  getFilterState?: () => GraphFilterState;
  onNodeSelect?: (node: GraphNodeSummary | null) => void;
  onStatsChange?: (stats: GraphStats) => void;
};
