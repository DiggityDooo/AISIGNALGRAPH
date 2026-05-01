"use strict";

import { createState, writeDebug } from "./state/store.js";
import { createRender2D } from "./render/render2d.js";
import { createSimulationEngine } from "./simulation/engine2d.js";
import { create3DBridge } from "./bridge/engine3d.js";
import { createController } from "./interactions/controller.js";
import { setupFilterControls, bindUI } from "./ui/controls.js";

function buildRefs() {
  return {
    svg: d3.select("#graph-svg"),
    nodeCanvas: document.getElementById("node-canvas"),
    signalCanvas: document.getElementById("signal-canvas"),
    search: document.getElementById("graph-search"),
    lens: document.getElementById("graph-lens"),
    sort: document.getElementById("graph-sort"),
    yearFilter: document.getElementById("year-filter"),
    yearValue: document.getElementById("year-value"),
    signalSpeed: document.getElementById("signal-speed"),
    signalSpeedValue: document.getElementById("signal-speed-value"),
    rebuildButton: document.getElementById("rebuild-button"),
    simulationToggle: document.getElementById("simulation-toggle"),
    fitButton: document.getElementById("fit-button"),
    mode3dToggle: document.getElementById("mode-3d-toggle"),
    container3d: document.getElementById("3d-graph-container"),
    filtersToggle: document.getElementById("filters-toggle"),
    inspectorToggle: document.getElementById("inspector-toggle"),
    nodeTypeFilters: document.getElementById("node-type-filters"),
    edgeTypeFilters: document.getElementById("edge-type-filters"),
    statNodes: document.getElementById("stat-nodes"),
    statEdges: document.getElementById("stat-edges"),
    statSignals: document.getElementById("stat-signals"),
    hudLeft: document.getElementById("hud-left"),
    hudRight: document.getElementById("hud-right"),
    detailBadge: document.getElementById("detail-badge"),
    detailTitle: document.getElementById("detail-title"),
    detailSubtitle: document.getElementById("detail-subtitle"),
    detailCopy: document.getElementById("detail-copy"),
    detailMeta: document.getElementById("detail-meta"),
    detailTags: document.getElementById("detail-tags"),
    detailEntities: document.getElementById("detail-entities"),
    detailRelated: document.getElementById("detail-related"),
    detailActions: document.getElementById("detail-actions"),
    detailLink: document.getElementById("detail-link"),
    detailClose: document.getElementById("detail-close"),
    debugTarget: document.querySelector(".hud-canvas-hint"),
  };
}

function requireDeps() {
  if (typeof window.d3 === "undefined") {
    throw new Error("D3 is required for graph2.");
  }
  const appRoot = document.getElementById("app-root");
  if (!appRoot) {
    throw new Error("App root not found.");
  }
}

export async function bootstrapGraphV2() {
  requireDeps();

  const refs = buildRefs();
  const state = createState(refs);
  const render2d = createRender2D(state);
  const simulation2d = createSimulationEngine(state, (snapshot) => controller.onTick(snapshot));
  const bridge3d = create3DBridge(state, (node) => controller.onNodeClick(node));
  const controller = createController(state, render2d, simulation2d, bridge3d);

  render2d.setupSVG(() => controller.resetScene());
  controller.zoomBehavior = render2d.attachZoom(() => {
    if (!state.is3DMode) {
      render2d.render(state.frameSnapshot);
    }
  });

  setupFilterControls(state, controller);
  bindUI(state, controller);
  controller.renderDefaultPanel();

  await controller.loadGraph();
  controller.zoomToFit();
  controller.resumeSimulation();
  writeDebug(state, { stage: "bootstrapGraphV2" });
}
