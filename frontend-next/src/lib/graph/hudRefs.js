import { hasMeasurableContainerSize } from "./nodeUtils.js";

export function collectHudRefs(root = document) {
  const get = (id) => root.getElementById(id);
  return {
    appRoot: get("app-root"),
    bgCanvas: get("flow-canvas-bg"),
    container: get("sigma-container"),
    canvas: get("signal-canvas"),
    statNodes: get("stat-nodes"),
    statEdges: get("stat-edges"),
    statSignals: get("stat-signals"),
    yearFilter: get("year-filter"),
    yearValue: get("year-value"),
    signalSpeed: get("signal-speed"),
    search: get("graph-search"),
    lens: get("graph-lens"),
    rebuild: get("rebuild-button"),
    fit: get("fit-button"),
    nodeFilters: get("node-type-filters"),
    detailTitle: get("detail-title"),
    detailSubtitle: get("detail-subtitle"),
    detailContent: get("detail-content"),
    detailPane: get("detail-pane"),
    rendererHost: null,
    threeContainer: get("three-container"),
    toggle3d: get("toggle-3d-button"),
    toggle3dLabel: get("toggle-3d-label"),
  };
}

export function validateHudRefs(refs, { SigmaLib, GraphCtor, forceAtlas2 }) {
  const missing = [];
  if (!refs.appRoot) missing.push("#app-root");
  if (!SigmaLib || typeof SigmaLib !== "function") missing.push("Sigma");
  if (!GraphCtor || typeof GraphCtor !== "function") missing.push("Graphology Graph");
  if (
    !forceAtlas2 ||
    typeof forceAtlas2.assign !== "function" ||
    typeof forceAtlas2.inferSettings !== "function"
  ) {
    missing.push("ForceAtlas2");
  }
  if (!refs.container) {
    missing.push("#sigma-container");
  } else if (!hasMeasurableContainerSize(refs.container)) {
    missing.push("#sigma-container dimensions");
  }
  if (!refs.canvas) {
    missing.push("#signal-canvas");
  } else if (!refs.canvas.getContext("2d")) {
    missing.push("#signal-canvas 2D context");
  }
  return missing;
}
