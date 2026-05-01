"use strict";

export const CONFIG = {
  alphaDecay: 0.03,
  alphaMin: 0.0012,
  velocityDecay: 0.46,
  baseCharge: -170,
  attentionDecay: 0.95,
  maxSignals: navigator.maxTouchPoints > 0 ? 18 : 52,
  signalSpawnBaseMs: navigator.maxTouchPoints > 0 ? 420 : 280,
  signalSpawnJitterMs: 120,
  zoomExpandThreshold: 1.35,
  zoomCollapseThreshold: 1.1,
};

export const NODE_COLORS = {
  story: "#ff4258",
  lab: "#ff8b72",
  model: "#ff6678",
  person: "#ffd3ca",
  risk: "#ff1e3a",
  year: "#9c6c71",
  topic: "#ff9f8a",
  product: "#ffb38e",
  community: "#ff304c",
};

export const COMMUNITY_PALETTE = [
  "#ff304c",
  "#ff5a48",
  "#ff7756",
  "#ff5469",
  "#ff8f73",
  "#ff6b5a",
  "#ff4670",
  "#ff9b63",
];

export const NODE_LABELS = {
  story: "Stories",
  lab: "Labs",
  model: "Models",
  person: "People",
  risk: "Risks",
  year: "Years",
  topic: "Topics",
  product: "Products",
};

export const EDGE_LABELS = {
  timeline: "Timeline",
  mention: "Mentions",
  context: "Context",
  support: "Support",
  membership: "Membership",
};

export const EDGE_STYLES = {
  timeline: { color: "#ff8b72", dash: null, opacity: 0.32, width: 1.2, distance: 150, strength: 0.15 },
  mention: { color: "#ff4258", dash: null, opacity: 0.32, width: 1.0, distance: 92, strength: 0.14 },
  context: { color: "#7d4a4f", dash: "4,8", opacity: 0.18, width: 0.85, distance: 180, strength: 0.07 },
  support: { color: "#5c363a", dash: "2,10", opacity: 0.12, width: 0.8, distance: 165, strength: 0.05 },
  membership: { color: "#431920", dash: "2,12", opacity: 0.09, width: 0.7, distance: 44, strength: 0.16 },
};

export function createState(refs) {
  return {
    refs,
    debugMode: new URLSearchParams(window.location.search).has("debug"),
    rawNodes: [],
    rawEdges: [],
    rawCommunities: [],
    rawNodeById: new Map(),
    rawCommunityById: new Map(),
    rawNeighbors: new Map(),
    rawDirectedOut: new Map(),
    rawDirectedIn: new Map(),
    nodes: [],
    edges: [],
    nodeById: new Map(),
    linksByNode: new Map(),
    filteredRawNodeIds: new Set(),
    attentionNodes: {},
    attentionCommunities: {},
    activeSignals: [],
    currentTransform: (window.d3 && d3.zoomIdentity) || { x: 0, y: 0, k: 1 },
    query: "",
    lens: refs.lens?.value || "global",
    sortMode: refs.sort?.value || "signal",
    minYear: 2020,
    maxYear: 2026,
    activeYear: 2026,
    monthFloor: 2020 * 12 + 1,
    monthCeiling: 2026 * 12 + 12,
    signalSpeed: 1,
    activeNodeTypes: new Set(Object.keys(NODE_LABELS)),
    activeEdgeKinds: new Set(Object.keys(EDGE_LABELS)),
    selectedId: null,
    selectedCommunityId: null,
    highlightedIds: new Set(),
    pinnedCommunityId: null,
    autoExpandedCommunityId: null,
    localSupportExpanded: false,
    isPaused: false,
    is3DMode: false,
    simulation: null,
    animationFrameId: null,
    pulseTimerId: null,
    initialFitPending: true,
    frameSnapshot: { nodes: [], edges: [], nodePos: new Map() },
    layoutTargets: new Map(),
    edgesByNode: new Map(),
  };
}

export function isCommunityNode(node) {
  return node?.node_type === "community";
}

export function communityNodeId(clusterId) {
  return `community:${clusterId}`;
}

export function parseCommunityNodeId(nodeId) {
  if (typeof nodeId !== "string" || !nodeId.startsWith("community:")) {
    return null;
  }
  return Number.parseInt(nodeId.split(":")[1], 10);
}

export function nodeCommunityId(node) {
  if (!node) {
    return null;
  }
  if (Number.isFinite(node.display_cluster_id)) {
    return node.display_cluster_id;
  }
  if (Number.isFinite(node.cluster_id)) {
    return node.cluster_id;
  }
  return null;
}

export function communityColor(clusterId) {
  return COMMUNITY_PALETTE[Math.abs(Number(clusterId) || 0) % COMMUNITY_PALETTE.length];
}

export function sanitizeType(value) {
  return NODE_COLORS[value] ? value : "topic";
}

export function edgeStyle(edge) {
  return EDGE_STYLES[edge.flow_kind] || EDGE_STYLES.membership;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function monthIndexFromKey(monthKey) {
  if (!monthKey) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10) * 12 + Number.parseInt(match[2], 10);
}

export function nodeMonthIndex(state, node) {
  return node?.month_index || monthIndexFromKey(node?.timeline_month) || state.monthFloor;
}

export function nodeYear(state, node) {
  if (node?.year) {
    return Number.parseInt(node.year, 10) || state.maxYear;
  }
  const month = node?.timeline_month || "";
  return Number.parseInt(month.slice(0, 4), 10) || state.maxYear;
}

export function hexToRgba(hex, alpha) {
  const value = String(hex || "#ffffff").replace("#", "");
  const normalized = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  const parsed = Number.parseInt(normalized, 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function writeDebug(state, extra = {}) {
  if (!state.debugMode || !state.refs.debugTarget) {
    return;
  }
  const snapshot = {
    stage: extra.stage || "unknown",
    rawNodes: state.rawNodes.length,
    rawEdges: state.rawEdges.length,
    nodes: state.nodes.length,
    edges: state.edges.length,
    lens: state.lens,
    selectedId: state.selectedId,
    selectedCommunityId: state.selectedCommunityId,
    pinnedCommunityId: state.pinnedCommunityId,
    autoExpandedCommunityId: state.autoExpandedCommunityId,
    is3DMode: state.is3DMode,
    paused: state.isPaused,
    transform: {
      x: Math.round(state.currentTransform.x || 0),
      y: Math.round(state.currentTransform.y || 0),
      k: Number((state.currentTransform.k || 1).toFixed(3)),
    },
    timestamp: Date.now(),
    ...extra,
  };
  window.__AISIGNALGRAPH_DEBUG = snapshot;
  state.refs.debugTarget.style.whiteSpace = "pre-wrap";
  state.refs.debugTarget.textContent = JSON.stringify(snapshot, null, 2);
}

