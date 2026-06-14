export const ERA_OPTIONS = [
  { id: "", label: "All eras" },
  { id: "founding", label: "Founding (1956–69)" },
  { id: "symbolic", label: "Symbolic AI" },
  { id: "first_winter", label: "First AI Winter" },
  { id: "connectionist", label: "Connectionist" },
  { id: "second_winter", label: "Second AI Winter" },
  { id: "statistical", label: "Statistical ML" },
  { id: "deep_learning", label: "Deep Learning" },
  { id: "transformer", label: "Transformer Era" },
  { id: "frontier", label: "Frontier Models" },
  { id: "agentic", label: "Agentic AI" },
];

export const DEFAULT_ACTIVE_YEAR = 2026;
export const DEFAULT_GLOW_COLOR = "#ff3148";
export const FALLBACK_X_SPREAD = 2.5;
export const FALLBACK_Y_SPREAD = 1.5;
export const TIMELINE_Z_SCALE = 10;
export const READY_CHECK_INTERVAL_MS = 100;
export const READY_CHECK_ATTEMPTS = 50;
export const CONTAINER_SIZE_TIMEOUT_MS = READY_CHECK_INTERVAL_MS * READY_CHECK_ATTEMPTS;

export const NODE_TYPES = [
  "story",
  "entity",
  "lab",
  "model",
  "person",
  "risk",
  "topic",
  "product",
  "year",
  "community",
];

export const OBSIDIAN_GRAPH = {
  defaultNode: "#8a8a8a",
  nodeColors: {
    story: "#a6adc8",
    lab: "#89b4fa",
    model: "#cba6f7",
    person: "#f9e2af",
    risk: "#f38ba8",
    year: "#6c7086",
    topic: "#94e2d5",
    product: "#fab387",
    community: "#b4befe",
    entity: "#8a8a8a",
  },
  edgeColor: "rgba(140, 140, 140, 0.18)",
  edgeSize: 0.35,
  labelColor: "#dcddde",
  labelSize: 10,
  labelDensity: 0.08,
  labelGridCellSize: 120,
  labelRenderedSizeThreshold: 10,
  minEdgeThickness: 0.4,
  labelFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  unfocusedNodeColor: "rgba(120, 120, 120, 0.12)",
  focusedEdgeColor: "rgba(180, 180, 180, 0.45)",
  focusedEdgeSize: 1.2,
};

export const BUBBLE_PHYSICS = {
  springStrength: 0.008,
  springRestLengthFactor: 2.8,
  repulsionStrength: 25,
  repulsionMinDist: 1.5,
  collisionStrength: 2.5,
  collisionPadding: 1,
  centerGravity: 0.0006,
  damping: 0.94,
  maxVelocity: 1.2,
  sleepThreshold: 0.02,
  hoverDrag: 0.35,
  displayLerp: 0.12,
  warmUpSeconds: 2,
  fixedDt: 1 / 60,
  maxSubsteps: 1,
  maxAccumulator: 0.05,
  cellSize: 26,
  displayEpsilon: 0.04,
  bgFlowInterval: 2,
  statsInterval: 12,
};
