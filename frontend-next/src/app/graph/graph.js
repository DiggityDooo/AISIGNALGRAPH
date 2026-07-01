"use strict";

import { getGraphQualityProfile } from "../../lib/graph/mobileProfile";
import { assertSingleWebglSurface, bindWebglContextLossHandler } from "../../lib/graph/webglGuard";

const READY_CHECK_INTERVAL_MS = 100;
// Mobile devices (slower CPUs, throttled networks, more main-thread contention
// from site-wide background canvases/animations) can take noticeably longer
// than desktop to finish their first layout pass after the dynamic Sigma/
// graphology chunks resolve. Give the dimension check more runway than the
// other (near-instant) readiness conditions before giving up.
const READY_CHECK_ATTEMPTS = 80;
const CONTAINER_SIZE_TIMEOUT_MS = READY_CHECK_INTERVAL_MS * READY_CHECK_ATTEMPTS;
const DEFAULT_ACTIVE_YEAR = 2026;
const DEFAULT_GLOW_COLOR = "#ff3148";
const FALLBACK_X_SPREAD = 2.5;
const FALLBACK_Y_SPREAD = 1.5;
const TIMELINE_Z_SCALE = 10;

function renderErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function hasMeasurableContainerSize(container) {
  if (!container) {
    return false;
  }

  const rect = container.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function safeInternalRoute(candidate, fallback) {
  if (typeof candidate !== "string") {
    return fallback;
  }

  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\0")) {
    return fallback;
  }

  return candidate;
}

export async function initGephiLite(options = {}) {
  console.log("Gephi Lite: Initializing...");

  // Device-tier quality profile — mobile GPUs lose their WebGL context under
  // the desktop configuration (full-DPR framebuffers, decorative canvases,
  // continuous labels, legacy per-node 3D meshes).
  const QUALITY = getGraphQualityProfile();

  const SigmaLib = options.SigmaLib || window.Sigma || window.sigma?.Sigma || window.sigma;
  const GraphCtor = options.GraphCtor || window.graphology?.Graph || window.graphology;
  const forceAtlas2 = options.forceAtlas2 || window.forceAtlas2;
  const graphPayloadFingerprint = options.graphPayloadFingerprint;
  const graphTopologyFingerprint = options.graphTopologyFingerprint;
  const graphRefreshMs = Number(options.graphRefreshMs) || 0;
  const onReady = typeof options.onReady === "function" ? options.onReady : null;
  const onError = typeof options.onError === "function" ? options.onError : null;

  const CONFIG = {
    nodeColors: {
      story: "#ff4258", lab: "#ff8b72", model: "#ff6678", person: "#ffd3ca",
      risk: "#ff1e3a", year: "#9c6c71", topic: "#ff9f8a", product: "#ffb38e", community: "#ff304c"
    },
    communityPalette: ["#ff304c", "#ff5a48", "#ff7756", "#ff5469", "#ff8f73", "#ff6b5a", "#ff4670", "#ff9b63"],
    maxSignals: 0
  };

  const OBSIDIAN_GRAPH = {
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
      entity: "#8a8a8a"
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
    focusedEdgeSize: 1.2
  };

  const BUBBLE_PHYSICS = {
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
    statsInterval: 12
  };

  // Above this node count, skip continuous physics/signals to keep the main
  // thread responsive (large graphs render as a static FA2 layout).
  const AMBIENT_EFFECTS_NODE_LIMIT = 600;

  function getCanvasNodeColor(node) {
    const colorKey = getNodeSemanticType(node);
    return OBSIDIAN_GRAPH.nodeColors[colorKey] || OBSIDIAN_GRAPH.defaultNode;
  }

  function applyDegreeBasedNodeSizes(graph) {
    graph.forEachNode((nodeId) => {
      const degree = graph.degree(nodeId) || 1;
      const size = Math.min(8, Math.max(2, 1.2 + Math.sqrt(degree) * 0.85));
      graph.setNodeAttribute(nodeId, "size", size);
      const body = state.physicsVelocities?.get(nodeId);
      if (body) {
        body.radius = getNodeRadius({ size });
      }
    });
  }

  function getNodeRadius(attrs) {
    return Math.max(1.5, Number(attrs?.size) || 2);
  }

  function resetBubblePhysics(graph) {
    const velocities = new Map();
    graph.forEachNode((nodeId, attrs) => {
      velocities.set(nodeId, {
        vx: 0,
        vy: 0,
        px: attrs.x,
        py: attrs.y,
        displayX: attrs.x,
        displayY: attrs.y,
        radius: getNodeRadius(attrs)
      });
    });
    state.physicsVelocities = velocities;
    state.physicsNodeIds = graph.nodes();
    state.physicsAccumulator = 0;
    state.physicsStartedAt = performance.now();
    state.physicsLastTime = performance.now();
    state.physicsSleeping = false;
    state.physicsPositionsDirty = true;
  }

  function wakePhysics() {
    state.physicsSleeping = false;
    state.physicsPositionsDirty = true;
    ensureAnimationLoop();
  }

  function updateFocusContext() {
    const activeId = state.hoveredNode || state.selectedNode?.id;
    if (!activeId || !state.graph) {
      state.focusActiveId = null;
      state.focusNeighborIds = null;
      return;
    }
    state.focusActiveId = activeId;
    state.focusNeighborIds = new Set(state.graph.neighbors(activeId));
  }

  function getPhysicsWarmupMultiplier() {
    if (!state.physicsStartedAt) {
      return 1;
    }
    const elapsed = (performance.now() - state.physicsStartedAt) / 1000;
    return Math.min(1, elapsed / BUBBLE_PHYSICS.warmUpSeconds);
  }

  function getSoftDragNodes() {
    const dragged = new Set();
    if (state.hoveredNode) {
      dragged.add(state.hoveredNode);
    }
    if (state.selectedNode?.id) {
      dragged.add(state.selectedNode.id);
    }
    return dragged;
  }

  function stepBubblePhysics(graph, dt) {
    if (!state.physicsVelocities || !state.physicsEnabled || dt <= 0) {
      return false;
    }

    const nodeIds = state.physicsNodeIds || graph.nodes();
    const nodeCount = nodeIds.length;
    if (nodeCount === 0) {
      return false;
    }

    const softDrag = getSoftDragNodes();
    const forceScale = getPhysicsWarmupMultiplier();
    const scratch = state.physicsScratch;
    const forces = scratch.forces;
    const simPositions = scratch.simPositions;
    const grid = scratch.grid;
    forces.clear();
    simPositions.clear();
    grid.forEach((bucket) => {
      bucket.length = 0;
      scratch.gridBuckets.push(bucket);
    });
    grid.clear();

    nodeIds.forEach((nodeId) => {
      const body = state.physicsVelocities.get(nodeId);
      if (!body) {
        return;
      }
      forces.set(nodeId, { fx: 0, fy: 0 });
      simPositions.set(nodeId, { x: body.px, y: body.py, size: body.radius });
    });

    graph.forEachEdge((_edgeId, _attrs, source, target) => {
      const sourceSim = simPositions.get(source);
      const targetSim = simPositions.get(target);
      if (!sourceSim || !targetSim) {
        return;
      }

      const dx = targetSim.x - sourceSim.x;
      const dy = targetSim.y - sourceSim.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const restLength =
        (getNodeRadius(sourceSim) + getNodeRadius(targetSim)) * BUBBLE_PHYSICS.springRestLengthFactor;
      const force = (dist - restLength) * BUBBLE_PHYSICS.springStrength * forceScale;
      const nx = dx / dist;
      const ny = dy / dist;

      const sourceForce = forces.get(source);
      const targetForce = forces.get(target);
      sourceForce.fx += nx * force;
      sourceForce.fy += ny * force;
      targetForce.fx -= nx * force;
      targetForce.fy -= ny * force;
    });

    const { cellSize } = BUBBLE_PHYSICS;
    nodeIds.forEach((nodeId) => {
      const sim = simPositions.get(nodeId);
      const cellX = Math.floor(sim.x / cellSize);
      const cellY = Math.floor(sim.y / cellSize);
      const key = cellX * 100003 + cellY;
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = scratch.gridBuckets.pop() || [];
        grid.set(key, bucket);
      }
      bucket.push(nodeId);
    });

    nodeIds.forEach((nodeId) => {
      const sim = simPositions.get(nodeId);
      const cellX = Math.floor(sim.x / cellSize);
      const cellY = Math.floor(sim.y / cellSize);

      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const bucket = grid.get((cellX + offsetX) * 100003 + (cellY + offsetY));
          if (!bucket) {
            continue;
          }

          bucket.forEach((otherId) => {
            if (otherId <= nodeId) {
              return;
            }

            const otherSim = simPositions.get(otherId);
            const dx = otherSim.x - sim.x;
            const dy = otherSim.y - sim.y;
            const dist = Math.hypot(dx, dy) || 0.001;
            const nx = dx / dist;
            const ny = dy / dist;
            const radiusA = getNodeRadius(sim);
            const radiusB = getNodeRadius(otherSim);

            let push =
              (BUBBLE_PHYSICS.repulsionStrength / Math.max(dist, BUBBLE_PHYSICS.repulsionMinDist)) *
              forceScale;
            const minDist = radiusA + radiusB + BUBBLE_PHYSICS.collisionPadding;
            if (dist < minDist) {
              push += (minDist - dist) * BUBBLE_PHYSICS.collisionStrength * forceScale;
            }

            const nodeForce = forces.get(nodeId);
            const otherForce = forces.get(otherId);
            nodeForce.fx -= nx * push;
            nodeForce.fy -= ny * push;
            otherForce.fx += nx * push;
            otherForce.fy += ny * push;
          });
        }
      }
    });

    let centerX = 0;
    let centerY = 0;
    nodeIds.forEach((nodeId) => {
      const sim = simPositions.get(nodeId);
      centerX += sim.x;
      centerY += sim.y;
    });
    centerX /= nodeCount;
    centerY /= nodeCount;

    nodeIds.forEach((nodeId) => {
      const sim = simPositions.get(nodeId);
      const force = forces.get(nodeId);
      force.fx += (centerX - sim.x) * BUBBLE_PHYSICS.centerGravity * forceScale;
      force.fy += (centerY - sim.y) * BUBBLE_PHYSICS.centerGravity * forceScale;
    });

    const { damping, maxVelocity, sleepThreshold, hoverDrag } = BUBBLE_PHYSICS;
    let awakeCount = 0;

    nodeIds.forEach((nodeId) => {
      const body = state.physicsVelocities.get(nodeId);
      if (!body) {
        return;
      }

      const sim = simPositions.get(nodeId);
      const force = forces.get(nodeId);

      body.vx = (body.vx + force.fx * dt) * damping;
      body.vy = (body.vy + force.fy * dt) * damping;

      if (softDrag.has(nodeId)) {
        body.vx *= hoverDrag;
        body.vy *= hoverDrag;
      }

      const speed = Math.hypot(body.vx, body.vy);
      if (speed > maxVelocity) {
        body.vx = (body.vx / speed) * maxVelocity;
        body.vy = (body.vy / speed) * maxVelocity;
      } else if (speed < sleepThreshold) {
        body.vx = 0;
        body.vy = 0;
      }

      body.px = sim.x + body.vx * dt;
      body.py = sim.y + body.vy * dt;

      if (Math.hypot(body.vx, body.vy) > BUBBLE_PHYSICS.sleepThreshold) {
        awakeCount += 1;
      }
    });

    const hasInteraction = softDrag.size > 0;
    const wasSleeping = state.physicsSleeping;
    if (!hasInteraction && forceScale >= 1 && awakeCount === 0) {
      state.physicsSleeping = true;
    } else {
      state.physicsSleeping = false;
    }

    return (
      awakeCount > 0 ||
      hasInteraction ||
      forceScale < 1 ||
      (state.physicsSleeping && !wasSleeping)
    );
  }

  function snapDisplayToPhysics(graph) {
    if (!state.physicsVelocities) {
      return false;
    }

    let moved = false;
    state.physicsVelocities.forEach((body, nodeId) => {
      if (body.displayX === body.px && body.displayY === body.py) {
        return;
      }
      body.displayX = body.px;
      body.displayY = body.py;
      graph.setNodeAttribute(nodeId, "x", body.px);
      graph.setNodeAttribute(nodeId, "y", body.py);
      moved = true;
    });
    return moved;
  }

  function lerpDisplayPositions(graph) {
    if (!state.physicsVelocities) {
      return false;
    }

    const lerp = BUBBLE_PHYSICS.displayLerp;
    const epsilon = BUBBLE_PHYSICS.displayEpsilon;
    const epsilonSq = epsilon * epsilon;
    let moved = false;

    state.physicsVelocities.forEach((body, nodeId) => {
      const dx = body.px - body.displayX;
      const dy = body.py - body.displayY;
      if (dx * dx + dy * dy < epsilonSq) {
        return;
      }

      body.displayX += dx * lerp;
      body.displayY += dy * lerp;
      graph.setNodeAttribute(nodeId, "x", body.displayX);
      graph.setNodeAttribute(nodeId, "y", body.displayY);
      moved = true;
    });

    return moved;
  }

  function runPhysicsSimulation(frameDt) {
    if (!state.graph || !state.physicsEnabled || state.is3DMode) {
      return false;
    }

    if (state.physicsSleeping && getSoftDragNodes().size === 0) {
      return false;
    }

    const now = performance.now();
    const elapsed = Math.min(
      frameDt > 0 ? frameDt : BUBBLE_PHYSICS.fixedDt,
      BUBBLE_PHYSICS.maxAccumulator
    );
    state.physicsAccumulator += elapsed;

    let substeps = 0;
    let simActive = false;
    while (
      state.physicsAccumulator >= BUBBLE_PHYSICS.fixedDt &&
      substeps < BUBBLE_PHYSICS.maxSubsteps
    ) {
      simActive = stepBubblePhysics(state.graph, BUBBLE_PHYSICS.fixedDt) || simActive;
      state.physicsAccumulator -= BUBBLE_PHYSICS.fixedDt;
      substeps += 1;
    }

    if (state.physicsAccumulator > BUBBLE_PHYSICS.maxAccumulator) {
      state.physicsAccumulator = BUBBLE_PHYSICS.maxAccumulator;
    }

    let moved = lerpDisplayPositions(state.graph);
    if (state.physicsSleeping) {
      moved = snapDisplayToPhysics(state.graph) || moved;
    }
    state.physicsLastTime = now;
    state.physicsPositionsDirty = moved || simActive;
    return moved || simActive;
  }

  const state = {
    graph: null, renderer: null, nodes: [], edges: [], communities: [],
    filteredNodes: [], filteredEdges: [],
    activeSignals: [], activeYear: DEFAULT_ACTIVE_YEAR, signalSpeed: 1.0, selectedNode: null, hoveredNode: null,
    visibleNodeTypes: new Set(["story", "entity", "lab", "model", "person", "risk", "topic", "product", "year", "community"]),
    animationFrameId: null,
    destroyed: false,
    is3DMode: false,
    contextLossRecoveryUsed: false,
    graphEngine: null,
    threeModule: null,
    threeScene: null,
    threeRenderer: null,
    threeCamera: null,
    threeControls: null,
    threeRaycaster: null,
    threeMouse: null,
    threeNodeMeshes: [],
    threeEdgeLines: null,
    threeAnimFrameId: null,
    threeHoveredMesh: null,
    physicsEnabled: true,
    signalsEnabled: true,
    physicsVelocities: null,
    physicsNodeIds: null,
    physicsAccumulator: 0,
    physicsStartedAt: 0,
    physicsLastTime: 0,
    physicsSleeping: false,
    physicsPositionsDirty: true,
    physicsScratch: {
      forces: new Map(),
      simPositions: new Map(),
      grid: new Map(),
      gridBuckets: []
    },
    focusActiveId: null,
    focusNeighborIds: null,
    cameraDirty: false,
    animateFrame: 0,
    pageHidden: false,
    animationPaused: false,
    savedNodePositions: new Map(),
    dataRevision: null,
    topologyRevision: null,
    lastVisibleIds: null,
    pollInFlight: false,
    pollTimerId: null
  };

  let resizeRafId = null;

  let appRoot = null;
  let refs = null;
  let ctx = null;
  let bgCtx = null;
  let searchTimeout = null;
  const managedListeners = [];
  let filterCleanupFns = [];

  function clearSearchTimeout() {
    if (searchTimeout !== null) {
      window.clearTimeout(searchTimeout);
      searchTimeout = null;
    }
  }

  function clearFilterListeners() {
    filterCleanupFns.forEach((cleanup) => cleanup());
    filterCleanupFns = [];
  }

  function getNodeSemanticType(node) {
    return node?.semanticType || node?.type || node?.node_type || "entity";
  }

  function getStableDepthOffset(nodeId) {
    let hash = 0;
    const value = String(nodeId || "");
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return ((Math.abs(hash) % 61) - 30) * 3;
  }

  function getNodeMonthIndex(node) {
    const explicitIndex = Number(node?.month_index);
    if (Number.isFinite(explicitIndex)) {
      return explicitIndex;
    }

    const [yearText, monthText = "01"] = String(node?.timeline_month || "").split("-");
    const year = Number.parseInt(yearText, 10);
    const month = Number.parseInt(monthText, 10);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return null;
    }

    return year * 12 + month;
  }

  function visibleIdsEqual(left, right) {
    if (!left || !right || left.size !== right.size) {
      return false;
    }
    for (const id of left) {
      if (!right.has(id)) {
        return false;
      }
    }
    return true;
  }

  function captureNodePositions(graph) {
    if (!graph) {
      return;
    }
    graph.forEachNode((nodeId, attrs) => {
      if (Number.isFinite(attrs.x) && Number.isFinite(attrs.y)) {
        state.savedNodePositions.set(nodeId, { x: attrs.x, y: attrs.y });
      }
    });
  }

  function fingerprintPayload(data) {
    if (
      typeof graphPayloadFingerprint !== "function" ||
      typeof graphTopologyFingerprint !== "function"
    ) {
      return { revision: null, topologyRevision: null };
    }
    const payload = {
      nodes: data.nodes || [],
      edges: data.edges || []
    };
    return {
      revision: graphPayloadFingerprint(payload),
      topologyRevision: graphTopologyFingerprint(payload)
    };
  }

  function applyNormalizedGraphData(data) {
    state.nodes = (data.nodes || []).map((node) => ({
      ...node,
      semanticType: getNodeSemanticType(node)
    }));
    state.edges = data.edges || [];
    state.communities = data.communities || [];
  }

  function applyGraphMetadataPatch() {
    const graph = state.graph;
    if (!graph) {
      return;
    }

    state.filteredNodes.forEach((node) => {
      if (!graph.hasNode(node.id)) {
        return;
      }
      const color = getCanvasNodeColor(node);
      graph.mergeNodeAttributes(node.id, {
        ...node,
        label: node.label || node.id,
        color
      });
    });
    applyDegreeBasedNodeSizes(graph);
    state.renderer?.refresh();
  }

  function patch3DSceneMetadata() {
    const THREE = state.threeModule;
    if (!THREE || !state.threeNodeMeshes.length) {
      return;
    }

    const nodeById = new Map(state.filteredNodes.map((node) => [node.id, node]));
    state.threeNodeMeshes.forEach((mesh) => {
      const nodeId = mesh.userData.nodeId;
      if (!nodeId) {
        return;
      }
      const node = nodeById.get(nodeId);
      if (!node) {
        return;
      }

      const colorKey = getNodeSemanticType(node);
      const colorHex = CONFIG.nodeColors[colorKey] || "#3793ff";
      const color = new THREE.Color(colorHex);
      mesh.userData.nodeData = node;
      mesh.userData.baseColor = colorHex;

      if (mesh.userData.isGlow) {
        mesh.material.color.copy(color);
        return;
      }

      mesh.material.color.copy(color);
      mesh.material.emissive.copy(color);
    });
  }

  function addManagedListener(target, eventName, handler, listenerOptions) {
    if (!target || typeof target.addEventListener !== "function") {
      return;
    }

    target.addEventListener(eventName, handler, listenerOptions);
    managedListeners.push(() => {
      target.removeEventListener(eventName, handler, listenerOptions);
    });
  }

  /**
   * Mobile GPUs can drop the WebGL context under memory pressure, which used
   * to leave a dead black canvas (perceived as a crash). Rebuild once
   * automatically; if the context is lost again, surface a runtime error so
   * the page shows its recovery message instead of a frozen canvas.
   */
  function bindContextLossRecovery() {
    const host = refs?.rendererHost || refs?.container;
    if (!host || !state.renderer) {
      return;
    }
    bindWebglContextLossHandler(host, () => {
      console.warn("Gephi Lite: WebGL context lost.");
      if (state.destroyed) {
        return;
      }
      if (state.contextLossRecoveryUsed) {
        emitRuntimeError(new Error("WebGL context lost twice; device is out of GPU memory."), "Render error");
        return;
      }
      state.contextLossRecoveryUsed = true;
      stopAnimationLoop();
      window.setTimeout(() => {
        if (state.destroyed) {
          return;
        }
        void rebuildFromFilters().then((hasRenderer) => {
          if (hasRenderer && !state.pageHidden && !state.is3DMode) {
            startAnimationLoop();
          }
        });
      }, 500);
    });
  }

  function destroyRenderer() {
    if (state.renderer) {
      state.renderer.kill();
      state.renderer = null;
    }

    state.physicsVelocities = null;
    state.physicsNodeIds = null;
    state.physicsAccumulator = 0;
    state.physicsStartedAt = 0;
    state.physicsLastTime = 0;
    state.physicsSleeping = false;
    state.focusActiveId = null;
    state.focusNeighborIds = null;

    if (refs?.rendererHost) {
      refs.rendererHost.innerHTML = "";
    }
  }

  function cleanup() {
    if (state.destroyed) {
      return;
    }

    state.destroyed = true;
    clearSearchTimeout();
    clearFilterListeners();
    if (resizeRafId !== null) {
      window.cancelAnimationFrame(resizeRafId);
      resizeRafId = null;
    }
    stopAnimationLoop();

    if (state.pollTimerId !== null) {
      window.clearInterval(state.pollTimerId);
      state.pollTimerId = null;
    }

    // Clean up 3D scene
    destroy3DScene();
    disposeLayoutWorker();

    managedListeners.splice(0).reverse().forEach((dispose) => {
      try {
        dispose();
      } catch (error) {
        console.warn("Gephi Lite: Listener cleanup failed.", error);
      }
    });

    destroyRenderer();
    state.graph = null;
    state.activeSignals = [];
    state.hoveredNode = null;
    state.selectedNode = null;
    delete window.gephiLite;
  }

  function reportInitializationError(error, subtitle = "Renderer error") {
    console.error("Gephi Lite: Initialization failed.", error);

    const detailTitle = refs?.detailTitle || document.getElementById("detail-title");
    const detailSubtitle = refs?.detailSubtitle || document.getElementById("detail-subtitle");
    const detailContent = refs?.detailContent || document.getElementById("detail-content");
    const detailPane = refs?.detailPane || document.getElementById("detail-pane");
    const message = renderErrorMessage(error);

    if (detailTitle) {
      detailTitle.textContent = "Graph initialization failed";
    }
    if (detailSubtitle) {
      detailSubtitle.textContent = subtitle;
    }
    if (detailContent) {
      detailContent.textContent = "";
      const errorSection = document.createElement("div");
      errorSection.className = "detail-section";
      errorSection.textContent = message;
      detailContent.appendChild(errorSection);
    }
    detailPane?.classList.add("is-active");
  }

  function emitRuntimeError(error, subtitle = "Renderer error") {
    reportInitializationError(error, subtitle);
    onError?.(error);
  }

  function collectRuntimeReadiness() {
    const currentAppRoot = document.getElementById("app-root");
    const currentRefs = {
      bgCanvas: document.getElementById("flow-canvas-bg"),
      container: document.getElementById("sigma-container"),
      canvas: document.getElementById("signal-canvas"),
      statNodes: document.getElementById("stat-nodes"),
      statEdges: document.getElementById("stat-edges"),
      statSignals: document.getElementById("stat-signals"),
      yearFilter: document.getElementById("year-filter"),
      yearValue: document.getElementById("year-value"),
      signalSpeed: document.getElementById("signal-speed"),
      search: document.getElementById("graph-search"),
      lens: document.getElementById("graph-lens"),
      rebuild: document.getElementById("rebuild-button"),
      fit: document.getElementById("fit-button"),
      nodeFilters: document.getElementById("node-type-filters"),
      detailTitle: document.getElementById("detail-title"),
      detailSubtitle: document.getElementById("detail-subtitle"),
      detailContent: document.getElementById("detail-content"),
      detailPane: document.getElementById("detail-pane"),
      rendererHost: null,
      threeContainer: document.getElementById("three-container"),
      toggle3d: document.getElementById("toggle-3d-button"),
      toggle3dLabel: document.getElementById("toggle-3d-label")
    };

    const signalContext = currentRefs.canvas?.getContext("2d");
    const missing = [];

    if (!currentAppRoot) {
      missing.push("#app-root");
    }
    if (!SigmaLib || typeof SigmaLib !== "function") {
      missing.push("Sigma");
    }
    if (!GraphCtor || typeof GraphCtor !== "function") {
      missing.push("Graphology Graph");
    }
    if (
      !forceAtlas2 ||
      typeof forceAtlas2.assign !== "function" ||
      typeof forceAtlas2.inferSettings !== "function"
    ) {
      missing.push("ForceAtlas2");
    }
    if (!currentRefs.container) {
      missing.push("#sigma-container");
    } else if (!hasMeasurableContainerSize(currentRefs.container)) {
      missing.push("#sigma-container dimensions");
    }
    if (!currentRefs.canvas) {
      missing.push("#signal-canvas");
    } else if (!signalContext) {
      missing.push("#signal-canvas 2D context");
    }

    return {
      appRoot: currentAppRoot,
      refs: currentRefs,
      ctx: signalContext,
      bgCtx: currentRefs.bgCanvas?.getContext("2d") || null,
      missing
    };
  }

  function waitForGraphRuntime() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      let intervalId = null;
      let resizeObserver = null;
      let observedContainer = null;

      const finish = (callback) => {
        if (intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
        if (resizeObserver) {
          resizeObserver.disconnect();
          resizeObserver = null;
        }
        document.removeEventListener("visibilitychange", onVisibilityChange);
        callback();
      };

      // The #sigma-container dimension check is the one readiness condition
      // that can legitimately still be false the moment everything else is
      // ready (layout hasn't settled yet on a slow device). Watch it directly
      // so we resolve the instant it gains size instead of waiting up to
      // READY_CHECK_INTERVAL_MS for the next poll to notice.
      const ensureContainerObserved = (container) => {
        if (!container || container === observedContainer || typeof ResizeObserver === "undefined") {
          return;
        }
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
        observedContainer = container;
        resizeObserver = new ResizeObserver(() => evaluate());
        resizeObserver.observe(container);
      };

      const evaluate = () => {
        // A backgrounded tab/app (phone locked, app switched) suspends layout and
        // timers; don't burn the readiness budget on attempts we couldn't observe.
        if (document.hidden) {
          return;
        }

        const runtime = collectRuntimeReadiness();
        ensureContainerObserved(runtime.refs.container);

        if (runtime.missing.length === 0) {
          finish(() => resolve(runtime));
          return;
        }

        attempts += 1;
        if (attempts > READY_CHECK_ATTEMPTS) {
          finish(() =>
            reject(
              new Error(
                `Gephi Lite initialization timed out after ${CONTAINER_SIZE_TIMEOUT_MS}ms. Missing: ${runtime.missing.join(", ")}`
              )
            )
          );
        }
      };

      const onVisibilityChange = () => {
        if (!document.hidden) {
          evaluate();
        }
      };

      document.addEventListener("visibilitychange", onVisibilityChange);
      intervalId = window.setInterval(evaluate, READY_CHECK_INTERVAL_MS);
      evaluate();
    });
  }

  function waitForContainerSize(container) {
    if (hasMeasurableContainerSize(container)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId = null;

      const finish = (callback) => {
        if (settled) {
          return;
        }
        settled = true;
        observer.disconnect();
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        callback();
      };

      const observer = new ResizeObserver(() => {
        if (hasMeasurableContainerSize(container)) {
          finish(resolve);
        }
      });

      observer.observe(container);

      timeoutId = window.setTimeout(() => {
        if (hasMeasurableContainerSize(container)) {
          finish(resolve);
          return;
        }

        finish(() => {
          reject(new Error("Gephi Lite: Sigma container has no measurable size."));
        });
      }, CONTAINER_SIZE_TIMEOUT_MS);
    });
  }

  function ensureRendererHost() {
    if (!refs?.container) {
      throw new Error("Gephi Lite: Sigma container is not available.");
    }

    let rendererHost = refs.rendererHost || refs.container.querySelector("[data-gephi-lite-renderer]");
    if (!rendererHost) {
      rendererHost = document.createElement("div");
      rendererHost.dataset.gephiLiteRenderer = "true";
      rendererHost.style.position = "absolute";
      rendererHost.style.inset = "0";
      rendererHost.style.zIndex = "0";
      refs.container.prepend(rendererHost);
    }

    refs.rendererHost = rendererHost;
    return rendererHost;
  }

  // --- UI Helpers ---
  function flashStat(element) {
    if (!element) {
      return;
    }
    element.classList.remove("is-updating");
    void element.offsetWidth;
    element.classList.add("is-updating");
  }

  function animateStat(element, nextValue) {
    if (!element) {
      return;
    }
    const previousTarget = Number.parseInt(element.dataset.targetValue || "", 10);
    if (previousTarget === nextValue) {
      return;
    }

    element.dataset.targetValue = String(nextValue);
    flashStat(element);

    const startValue = Number.parseInt(element.textContent || "0", 10) || 0;
    const startedAt = window.performance.now();
    const duration = 420;

    const tick = (now) => {
      if (state.destroyed || element.dataset.targetValue !== String(nextValue)) {
        return;
      }
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(startValue + (nextValue - startValue) * eased);
      element.textContent = String(value);
      if (progress < 1) {
        window.requestAnimationFrame(tick);
      }
    };

    window.requestAnimationFrame(tick);
  }

  function syncStatText(element, nextValue) {
    if (!element) {
      return;
    }
    const previousTarget = Number.parseInt(element.dataset.targetValue || "", 10);
    if (previousTarget === nextValue) {
      return;
    }
    element.dataset.targetValue = String(nextValue);
    element.textContent = String(nextValue);
  }

  function updateStats(options = {}) {
    const { animate = false } = options;
    if (refs.statNodes) {
      if (animate) {
        animateStat(refs.statNodes, state.filteredNodes.length);
      } else {
        syncStatText(refs.statNodes, state.filteredNodes.length);
      }
    }
    if (refs.statEdges) {
      if (animate) {
        animateStat(refs.statEdges, state.filteredEdges.length);
      } else {
        syncStatText(refs.statEdges, state.filteredEdges.length);
      }
    }
    if (refs.statSignals) {
      refs.statSignals.textContent = String(state.activeSignals.length);
    }
  }

  function renderFilters() {
    if (!refs.nodeFilters) {
      return;
    }

    clearFilterListeners();

    const types = ["story", "entity", "lab", "model", "person", "risk", "topic", "product", "year", "community"];
    refs.nodeFilters.innerHTML = types.map((type) => `
      <label class="node-type-filter-item">
        <input type="checkbox" checked data-type="${type}">
        <span class="node-type-dot" style="background:${CONFIG.nodeColors[type] || "#3793ff"}"></span>
        ${type.toUpperCase()}
      </label>
    `).join("");

    refs.nodeFilters.querySelectorAll("input[data-type]").forEach((checkbox) => {
      const handleChange = (event) => {
        const type = event.currentTarget.dataset.type;
        if (!type) {
          return;
        }

        if (event.currentTarget.checked) {
          state.visibleNodeTypes.add(type);
        } else {
          state.visibleNodeTypes.delete(type);
        }
        void rebuildFromFilters();
      };

      checkbox.addEventListener("change", handleChange);
      filterCleanupFns.push(() => {
        checkbox.removeEventListener("change", handleChange);
      });
    });
  }

  function inspectNode(node) {
    state.selectedNode = node;
    wakePhysics();
    updateFocusContext();
    const nodeType = getNodeSemanticType(node);
    const fallbackRoute = (nodeType === "story" || nodeType === "topic")
      ? `/stories/${encodeURIComponent(String(node.id || "").split(":").pop() || "")}`
      : `/entities/${encodeURIComponent(String(node.id || "").split(":").pop() || "")}`;
    const detailUrl = safeInternalRoute(node.route, fallbackRoute);

    refs.detailTitle.textContent = "";
    const detailLink = document.createElement("a");
    detailLink.href = detailUrl;
    detailLink.className = "detail-title-link";
    detailLink.title = "Open full dossier";
    detailLink.textContent = String(node.label || node.id || "Untitled node");
    refs.detailTitle.appendChild(detailLink);
    refs.detailSubtitle.textContent = nodeType.toUpperCase();
    const neighbors = state.graph ? state.graph.neighbors(node.id) : [];
    const neighborsList = document.createElement("div");
    neighborsList.className = "detail-neighbors-list";
    if (neighbors.length) {
      neighbors.forEach((neighborId) => {
        const neighbor = state.graph.getNodeAttributes(neighborId);
        const button = document.createElement("button");
        button.className = "neighbor-chip";
        button.type = "button";
        button.textContent = String(neighbor.label || neighborId);
        button.addEventListener("click", () => {
          selectNodeById(neighborId);
        });
        neighborsList.appendChild(button);
      });
    } else {
      const emptyState = document.createElement("span");
      emptyState.style.color = "#666";
      emptyState.textContent = "No direct connections";
      neighborsList.appendChild(emptyState);
    }

    refs.detailContent.textContent = "";

    const descriptionSection = document.createElement("div");
    descriptionSection.className = "detail-section";
    descriptionSection.textContent = String(node.summary || node.description || "No further intelligence available for this node.");
    refs.detailContent.appendChild(descriptionSection);

    const communitySection = document.createElement("div");
    communitySection.className = "detail-community";
    const communityLabel = document.createElement("label");
    communityLabel.className = "detail-community-label";
    communityLabel.textContent = "COMMUNITY";
    const communityValue = document.createElement("div");
    communityValue.className = "detail-community-value";
    communityValue.textContent = String(node.community_name || "Global Cluster");
    communitySection.appendChild(communityLabel);
    communitySection.appendChild(communityValue);
    refs.detailContent.appendChild(communitySection);

    const relatedSection = document.createElement("div");
    relatedSection.className = "detail-section";
    relatedSection.style.marginTop = "20px";
    const relatedLabel = document.createElement("label");
    relatedLabel.className = "detail-community-label";
    relatedLabel.textContent = "CONNECTED INTELLIGENCE";
    relatedSection.appendChild(relatedLabel);
    relatedSection.appendChild(neighborsList);
    refs.detailContent.appendChild(relatedSection);
    refs.detailPane?.classList.add("is-active");
    updateVisualizer(node);
    state.renderer?.refresh();
  }

  function updateVisualizer(node) {
    const container = document.getElementById("node-visualizer-container");
    if (!container) return;

    const colorKey = getNodeSemanticType(node);
    const color = CONFIG.nodeColors[colorKey] || "#3793ff";

    container.style.setProperty("--node-glow-color", color);
    appRoot.style.setProperty("--node-glow-color", color);

    container.classList.remove("node-selected-active");
    void container.offsetWidth;
    container.classList.add("node-selected-active");
  }

  function selectNodeById(id) {
    if (!state.graph || !state.graph.hasNode(id)) return;
    const attrs = state.graph.getNodeAttributes(id);
    inspectNode(attrs);
    if (state.renderer) {
      state.renderer.getCamera().animate({ x: attrs.x, y: attrs.y, ratio: 0.15 }, { duration: 500 });
    }
  }

  async function enter3DModeIfNeeded() {
    if (!QUALITY.enable3d || state.is3DMode) return;
    state.is3DMode = true;
    if (refs.toggle3dLabel) refs.toggle3dLabel.textContent = "2D";
    if (refs.toggle3d) {
      refs.toggle3d.style.background = "rgba(255, 66, 88, 0.3)";
      refs.toggle3d.style.borderColor = "rgba(255, 66, 88, 0.6)";
    }
    stopAnimationLoop();
    state.activeSignals = [];
    destroyRenderer();
    if (refs.rendererHost) refs.rendererHost.style.display = "none";
    if (refs.canvas) refs.canvas.style.display = "none";
    if (refs.threeContainer) refs.threeContainer.style.display = "block";
    const visualizer = document.getElementById("node-visualizer-container");
    if (visualizer) visualizer.style.display = "none";
    await build3DScene();
  }

  async function flyToNodeById(id, prefer3d = false) {
    if (!state.graph || !state.graph.hasNode(id)) return;
    const attrs = state.graph.getNodeAttributes(id);
    inspectNode(attrs);

    if (prefer3d) {
      await enter3DModeIfNeeded();
    }

    if (state.is3DMode && state.graphEngine) {
      state.graphEngine.focusNode(id);
      return;
    }

    const THREE = state.threeModule;
    if (state.is3DMode && THREE) {
      highlight3DNeighbors(id, THREE);
    }

    if (state.is3DMode && THREE && state.threeCamera && state.threeControls && state.threeNodeMeshes.length) {
      const mesh = state.threeNodeMeshes.find(
        (item) => item.userData.nodeId === id && !item.userData.isGlow,
      );
      if (mesh) {
        const targetPos = mesh.position.clone();
        const camTarget = targetPos.clone().add(new THREE.Vector3(0, 0, 80));
        animateCamera(state.threeCamera, state.threeControls, camTarget, targetPos, 800);
        return;
      }
    }

    if (state.renderer) {
      state.renderer.getCamera().animate({ x: attrs.x, y: attrs.y, ratio: 0.15 }, { duration: 500 });
    }
  }

  function filteredNodesByState() {
    const query = (refs.search?.value || "").trim().toLowerCase();
    let base = state.nodes.filter((node) => {
      const nodeType = getNodeSemanticType(node);
      if (!state.visibleNodeTypes.has(nodeType)) {
        return false;
      }
      const year = Number.parseInt(String(node.year || node.timeline_month || "").slice(0, 4), 10);
      if (Number.isFinite(year) && year > state.activeYear && nodeType !== "year") {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = `${node.label || ""} ${node.summary || ""} ${node.description || ""}`.toLowerCase();
      return haystack.includes(query);
    });

    if (refs.lens?.value === "local" && state.selectedNode?.id) {
      const selectedId = state.selectedNode.id;
      const neighborIds = new Set([selectedId]);
      state.edges.forEach((edge) => {
        const sourceId = edge.sourceId || edge.source;
        const targetId = edge.targetId || edge.target;
        if (sourceId === selectedId) {
          neighborIds.add(targetId);
        } else if (targetId === selectedId) {
          neighborIds.add(sourceId);
        }
      });
      base = base.filter((node) => neighborIds.has(node.id));
    }

    return base;
  }

  function filteredEdgesByNodes(visibleNodeIds) {
    return state.edges.filter((edge) => {
      const sourceId = edge.sourceId || edge.source;
      const targetId = edge.targetId || edge.target;
      return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
    });
  }

  async function rebuildFromFilters(options = {}) {
    const { metadataOnly = false } = options;
    state.filteredNodes = filteredNodesByState();
    const visibleIds = new Set(state.filteredNodes.map((node) => node.id));
    state.filteredEdges = filteredEdgesByNodes(visibleIds);
    const sameVisible = visibleIdsEqual(state.lastVisibleIds, visibleIds);
    state.lastVisibleIds = visibleIds;

    const patchOnly = metadataOnly && sameVisible;

    if (patchOnly && state.is3DMode && state.threeScene) {
      buildGraph({ mountRenderer: false, skipLayout: true });
      patch3DSceneMetadata();
      updateStats({ animate: false });
      return false;
    }

    if (patchOnly && state.renderer && state.graph) {
      applyGraphMetadataPatch();
      updateStats({ animate: false });
      return true;
    }

    if (state.is3DMode) {
      // Rebuild the filtered graph data without remounting Sigma so the 3D scene stays in sync.
      buildGraph({ mountRenderer: false });
      await build3DScene();
      updateStats({ animate: true });
      return false;
    }
    return await buildGraph();
  }

  // --- Graph Engine ---
  async function fetchGraphApiRaw() {
    const dataset = appRoot.dataset.datasetName || "";
    const baseUrl =
      typeof window !== "undefined" && window.location.hostname === "localhost"
        ? "http://localhost:8080"
        : "";
    const response = await fetch(`${baseUrl}/api/graph?dataset=${dataset}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async function loadGraphData() {
    const dataset = appRoot.dataset.datasetName || "";
    console.log(`Gephi Lite: Fetching graph data for dataset: ${dataset}`);

    try {
      const data = await fetchGraphApiRaw();
      const { revision, topologyRevision } = fingerprintPayload(data);
      state.dataRevision = revision;
      state.topologyRevision = topologyRevision;
      applyNormalizedGraphData(data);

      state.filteredNodes = [...state.nodes];
      state.filteredEdges = [...state.edges];
      console.log(`Gephi Lite: Data loaded. Nodes: ${state.nodes.length}, Edges: ${state.edges.length}`);
      return data;
    } catch (error) {
      console.error("Gephi Lite: Failed to load graph data:", error);
      throw error;
    }
  }

  async function pollGraphData() {
    if (state.destroyed || state.pollInFlight) {
      return;
    }

    state.pollInFlight = true;
    try {
      const data = await fetchGraphApiRaw();
      const { revision, topologyRevision } = fingerprintPayload(data);
      if (!revision || revision === state.dataRevision) {
        return;
      }

      applyNormalizedGraphData(data);
      state.dataRevision = revision;

      const topologyUnchanged =
        topologyRevision && topologyRevision === state.topologyRevision;

      if (topologyUnchanged) {
        const hasRenderer = await rebuildFromFilters({ metadataOnly: true });
        if (hasRenderer && !state.is3DMode && !state.pageHidden) {
          ensureAnimationLoop();
        }
        onReady?.({ nodes: state.nodes.length, edges: state.edges.length });
        return;
      }

      state.topologyRevision = topologyRevision;
      state.filteredNodes = filteredNodesByState();
      const visibleIds = new Set(state.filteredNodes.map((node) => node.id));
      state.filteredEdges = filteredEdgesByNodes(visibleIds);
      const hasRenderer = await rebuildFromFilters();
      if (hasRenderer && !state.is3DMode && !state.pageHidden) {
        ensureAnimationLoop();
      }
      onReady?.({ nodes: state.nodes.length, edges: state.edges.length });
    } catch (error) {
      console.warn("Gephi Lite: Poll refresh failed.", error);
    } finally {
      state.pollInFlight = false;
    }
  }

  // --- ForceAtlas2 off the main thread ---
  // The synchronous FA2 pass (up to 120 iterations over the full corpus)
  // blocked the main thread for seconds on mobile. Run it in the shared
  // lattice layout worker; fall back to the old synchronous path only if the
  // worker cannot start (e.g. very old browsers).
  let layoutWorker = null;
  let layoutWorkerFailed = false;

  function getLayoutWorker() {
    if (layoutWorker || layoutWorkerFailed || typeof Worker === "undefined") {
      return layoutWorker;
    }
    try {
      layoutWorker = new Worker(
        new URL("../../lib/graphFlow/latticeLayout.worker.ts", import.meta.url),
        { type: "module" }
      );
    } catch (error) {
      console.warn("Gephi Lite: Layout worker unavailable.", error);
      layoutWorkerFailed = true;
    }
    return layoutWorker;
  }

  function disposeLayoutWorker() {
    if (layoutWorker) {
      layoutWorker.terminate();
      layoutWorker = null;
    }
  }

  function runLayoutInWorker(graph, iterations) {
    const worker = getLayoutWorker();
    if (!worker) {
      return Promise.reject(new Error("layout worker unavailable"));
    }

    const nodes = [];
    graph.forEachNode((id, attrs) => {
      nodes.push({ id, x: attrs.x, y: attrs.y, size: attrs.size });
    });
    const edges = [];
    graph.forEachEdge((_edge, _attrs, source, target) => {
      edges.push({ source, target });
    });

    const requestId = `fa2-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const onMessage = (event) => {
        const data = event.data;
        if (!data || data.requestId !== requestId) return;
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        if (data.type === "error") {
          reject(new Error(data.message || "layout worker error"));
          return;
        }
        resolve(data.positions);
      };
      const onError = (event) => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        reject(event.error instanceof Error ? event.error : new Error(event.message || "layout worker error"));
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({ type: "layout", requestId, input: { nodes, edges }, iterations });
    });
  }

  async function runGraphLayout(graph, iterations, settings) {
    if (!layoutWorkerFailed) {
      try {
        const positions = await runLayoutInWorker(graph, iterations);
        for (const [id, pos] of Object.entries(positions)) {
          if (graph.hasNode(id)) {
            graph.setNodeAttribute(id, "x", pos.x);
            graph.setNodeAttribute(id, "y", pos.y);
          }
        }
        return;
      } catch (error) {
        console.warn("Gephi Lite: Worker layout failed, using main thread.", error);
        layoutWorkerFailed = true;
        disposeLayoutWorker();
      }
    }
    forceAtlas2.assign(graph, { iterations, settings });
  }

  async function buildGraph(options = {}) {
    const { mountRenderer = true, skipLayout = false } = options;
    console.log("Gephi Lite: Building graph...");
    if (!state.filteredNodes.length) {
      console.warn("Gephi Lite: No nodes to render.");
      captureNodePositions(state.graph);
      destroyRenderer();
      updateStats();
      return false;
    }

    captureNodePositions(state.graph);
    destroyRenderer();

    const graph = new GraphCtor({ multi: true });
    let newNodeCount = 0;
    state.filteredNodes.forEach((node) => {
      const color = getCanvasNodeColor(node);
      const saved = state.savedNodePositions.get(node.id);
      if (!saved) {
        newNodeCount += 1;
      }
      if (!graph.hasNode(node.id)) {
        graph.addNode(node.id, {
          ...node,
          label: node.label || node.id,
          size: 2,
          color,
          x: saved ? saved.x : Math.random() * 100,
          y: saved ? saved.y : Math.random() * 100,
          type: "circle"
        });
      }
    });

    state.filteredEdges.forEach((edge) => {
      const sourceId = edge.sourceId || edge.source;
      const targetId = edge.targetId || edge.target;
      if (graph.hasNode(sourceId) && graph.hasNode(targetId)) {
        const edgeKey = String(edge.id || `${sourceId}->${targetId}:${edge.flow_kind || edge.kind || "edge"}`);
        if (!graph.hasEdge(edgeKey)) {
          graph.addEdgeWithKey(edgeKey, sourceId, targetId, {
            ...edge,
            color: OBSIDIAN_GRAPH.edgeColor,
            size: OBSIDIAN_GRAPH.edgeSize,
            type: "line"
          });
        }
      }
    });

    applyDegreeBasedNodeSizes(graph);

    graph.forEachNode((nodeId, attrs) => {
      if (attrs.type !== "circle") {
        graph.setNodeAttribute(nodeId, "type", "circle");
      }
    });
    graph.forEachEdge((edgeId, attrs) => {
      if (attrs.type !== "line") {
        graph.setEdgeAttribute(edgeId, "type", "line");
      }
    });

    state.graph = graph;

    if (!mountRenderer) {
      updateStats({ animate: true });
      return false;
    }

    console.log("Gephi Lite: Running ForceAtlas2 layout...");
    const spreadSettings = {
      ...forceAtlas2.inferSettings(graph),
      gravity: 0.03,
      scalingRatio: 100,
      strongGravityMode: false,
      outboundAttractionDistribution: true,
      linLogMode: true,
      adjustSizes: true,
      slowDown: 2
    };
    const isFiltered = state.filteredNodes.length < state.nodes.length;
    const shouldLayout = !skipLayout && newNodeCount > 0;
    if (shouldLayout) {
      const iterations = isFiltered ? 40 : QUALITY.layoutIterations;
      console.time("FA2-Layout");
      await runGraphLayout(graph, iterations, spreadSettings);
      console.timeEnd("FA2-Layout");
    }

    // The worker layout is async — the page may have been torn down or
    // switched to 3D while it ran.
    if (state.destroyed) {
      return false;
    }

    resetBubblePhysics(graph);

    // Ambient bubble physics + signal animation are O(nodes) per frame and run
    // continuously. Above this size they stall the main thread; render static.
    const ambientEffectsAllowed = graph.order <= AMBIENT_EFFECTS_NODE_LIMIT;
    state.physicsEnabled = ambientEffectsAllowed;
    state.signalsEnabled = ambientEffectsAllowed;

    await waitForContainerSize(refs.container);
    syncCanvasSize();

    console.log("Gephi Lite: Initializing Sigma renderer...");
    state.renderer = new SigmaLib(graph, ensureRendererHost(), {
      renderLabels: QUALITY.renderLabels,
      labelSize: OBSIDIAN_GRAPH.labelSize,
      labelFont: OBSIDIAN_GRAPH.labelFont,
      labelColor: { color: OBSIDIAN_GRAPH.labelColor },
      defaultNodeColor: OBSIDIAN_GRAPH.defaultNode,
      defaultEdgeColor: OBSIDIAN_GRAPH.edgeColor,
      edgeColor: "default",
      labelGridCellSize: OBSIDIAN_GRAPH.labelGridCellSize,
      labelDensity: QUALITY.labelDensity,
      labelRenderedSizeThreshold: QUALITY.labelRenderedSizeThreshold,
      minEdgeThickness: OBSIDIAN_GRAPH.minEdgeThickness
    });

    bindContextLossRecovery();

    state.renderer.getCamera().on("updated", () => {
      state.cameraDirty = true;
      ensureAnimationLoop();
    });

    state.renderer.setSetting("nodeReducer", (nodeId, data) => {
      const result = { ...data };
      const activeId = state.focusActiveId;
      if (activeId) {
        const isTarget = nodeId === activeId;
        const isNeighbor = state.focusNeighborIds?.has(nodeId);
        if (isTarget || isNeighbor) {
          result.label = data.label;
          result.zIndex = 999;
          if (isTarget) result.highlighted = true;
        } else {
          result.label = "";
          result.color = OBSIDIAN_GRAPH.unfocusedNodeColor;
        }
      }
      return result;
    });

    state.renderer.setSetting("edgeReducer", (edgeId, data) => {
      const result = { ...data };
      const activeId = state.focusActiveId;
      if (activeId) {
        if (graph.hasExtremity(edgeId, activeId)) {
          result.color = OBSIDIAN_GRAPH.focusedEdgeColor;
          result.size = OBSIDIAN_GRAPH.focusedEdgeSize;
          result.zIndex = 998;
        } else {
          result.hidden = true;
        }
      }
      return result;
    });

    state.renderer.on("enterNode", ({ node }) => {
      state.hoveredNode = node;
      wakePhysics();
      updateFocusContext();
      const hovered = graph.getNodeAttributes(node);
      const hoverType = getNodeSemanticType(hovered);
      appRoot.style.setProperty("--node-glow-color", CONFIG.nodeColors[hoverType] || "#3793ff");
      state.cameraDirty = true;
      ensureAnimationLoop();
    });
    state.renderer.on("leaveNode", () => {
      state.hoveredNode = null;
      updateFocusContext();
      const selectedType = state.selectedNode ? getNodeSemanticType(state.selectedNode) : null;
      appRoot.style.setProperty("--node-glow-color", (selectedType && CONFIG.nodeColors[selectedType]) || DEFAULT_GLOW_COLOR);
      state.cameraDirty = true;
      ensureAnimationLoop();
    });
    state.renderer.on("clickNode", ({ node }) => inspectNode(graph.getNodeAttributes(node)));
    state.renderer.on("clickStage", () => {
      state.selectedNode = null;
      updateFocusContext();
      refs.detailTitle.textContent = "Select a node";
      refs.detailSubtitle.textContent = "Select any node on the graph to view detailed intelligence.";
      refs.detailContent.innerHTML = "";
      refs.detailPane?.classList.remove("is-active");
      appRoot.style.setProperty("--node-glow-color", DEFAULT_GLOW_COLOR);
      const visualizerContainer = document.getElementById("node-visualizer-container");
      if (visualizerContainer) visualizerContainer.classList.remove("node-selected-active");
      state.renderer.getCamera().animatedReset();
    });

    console.log("Gephi Lite: Build complete.");
    syncCanvasSize();
    updateStats({ animate: true });
    return true;
  }

  // --- Signals ---
  class Signal {
    constructor(source, target, color) {
      this.s = source; this.t = target; this.c = color;
      this.p = 0; this.v = 0.01 + Math.random() * 0.01;
    }
    update() { this.p += this.v * state.signalSpeed; return this.p < 1; }
    draw(context, renderer) {
      const p1 = renderer.graphToViewport(this.s);
      const p2 = renderer.graphToViewport(this.t);
      const x = p1.x + (p2.x - p1.x) * this.p;
      const y = p1.y + (p2.y - p1.y) * this.p;
      context.beginPath();
      context.arc(x, y, 2.5, 0, Math.PI * 2);
      context.fillStyle = this.c;
      context.fill();
    }
  }

  function spawnSignal() {
    if (state.activeSignals.length >= CONFIG.maxSignals || !state.graph) return;
    const edges = state.graph.edges();
    if (!edges.length) return;
    const edge = edges[Math.floor(Math.random() * edges.length)];
    const source = state.graph.getNodeAttributes(state.graph.source(edge));
    const target = state.graph.getNodeAttributes(state.graph.target(edge));
    state.activeSignals.push(new Signal(source, target, source.color));
  }

  function animate() {
    if (state.destroyed || state.pageHidden) {
      state.animationFrameId = null;
      return;
    }

    state.animationFrameId = null;
    state.animationPaused = false;
    state.animateFrame += 1;

    const signalsEnabled = CONFIG.maxSignals > 0 && state.signalsEnabled !== false;
    const bgFlowFrame = state.animateFrame % BUBBLE_PHYSICS.bgFlowInterval === 0;
    if (bgFlowFrame) {
      drawBackgroundFlow();
    }

    if (state.renderer) {
      let needsRefresh = state.cameraDirty;
      if (state.graph && state.physicsEnabled && !state.is3DMode) {
        const frameDt =
          state.physicsLastTime > 0
            ? (performance.now() - state.physicsLastTime) / 1000
            : BUBBLE_PHYSICS.fixedDt;
        if (runPhysicsSimulation(frameDt)) {
          needsRefresh = true;
        }
      }

      if (signalsEnabled) {
        ctx.shadowBlur = 0;
        const hadSignals = state.activeSignals.length > 0;
        if (hadSignals || Math.random() < 0.15) {
          ctx.clearRect(0, 0, refs.canvas.width, refs.canvas.height);
          state.activeSignals = state.activeSignals.filter((signal) => {
            const alive = signal.update();
            if (alive) signal.draw(ctx, state.renderer);
            return alive;
          });
          if (Math.random() < 0.15) spawnSignal();
          if (state.activeSignals.length > 0 || hadSignals) {
            needsRefresh = true;
          }
        }
      }

      if (needsRefresh) {
        state.renderer.refresh();
        state.cameraDirty = false;
      }

      if (state.animateFrame % BUBBLE_PHYSICS.statsInterval === 0) {
        updateStats();
      }

      if (!needsRefresh && !bgFlowFrame) {
        pauseAnimationIfIdle();
      }
    }

    if (!state.animationPaused) {
      state.animationFrameId = window.requestAnimationFrame(animate);
    }
  }

  function startAnimationLoop() {
    if (!state.renderer || state.animationFrameId !== null || state.is3DMode || state.pageHidden) {
      return;
    }

    console.log("Gephi Lite: Starting animation loop...");
    state.animationPaused = false;
    state.physicsLastTime = performance.now();
    animate();
  }

  function stopAnimationLoop() {
    if (state.animationFrameId !== null) {
      window.cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }
    state.animationPaused = false;
  }

  function ensureAnimationLoop() {
    if (state.destroyed || state.pageHidden || state.is3DMode || !state.renderer) {
      return;
    }
    startAnimationLoop();
  }

  function pauseAnimationIfIdle() {
    if (
      state.renderer &&
      (state.physicsSleeping || !state.physicsEnabled) &&
      !state.cameraDirty &&
      state.activeSignals.length === 0 &&
      getSoftDragNodes().size === 0
    ) {
      stopAnimationLoop();
      state.animationPaused = true;
    }
  }

  function handleViewportResize() {
    if (resizeRafId !== null) {
      return;
    }

    resizeRafId = window.requestAnimationFrame(() => {
      resizeRafId = null;
      syncCanvasSize();
      state.cameraDirty = true;
      state.renderer?.resize();
      if (state.is3DMode && state.threeRenderer && state.threeCamera && refs.threeContainer) {
        const rect = refs.threeContainer.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          state.threeCamera.aspect = rect.width / rect.height;
          state.threeCamera.updateProjectionMatrix();
          state.threeRenderer.setSize(rect.width, rect.height);
        }
      }
      ensureAnimationLoop();
    });
  }

  function syncCanvasSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY.maxDpr);
    if (refs.bgCanvas) {
      const rootRect = appRoot.getBoundingClientRect();
      const bgW = Math.max(1, Math.floor(rootRect.width * dpr));
      const bgH = Math.max(1, Math.floor(rootRect.height * dpr));
      if (refs.bgCanvas.width !== bgW || refs.bgCanvas.height !== bgH) {
        refs.bgCanvas.width = bgW;
        refs.bgCanvas.height = bgH;
      }
    }
    const rect = refs.container.getBoundingClientRect();

    const fgW = Math.max(1, Math.floor(rect.width * dpr));
    const fgH = Math.max(1, Math.floor(rect.height * dpr));
    if (refs.canvas.width !== fgW || refs.canvas.height !== fgH) {
      refs.canvas.width = fgW;
      refs.canvas.height = fgH;
    }
  }

  const bgFlow = {
    particles: [],
    initialized: false,
    mouseX: 0,
    mouseY: 0
  };

  function initBackgroundFlow() {
    if (!QUALITY.enableBackgroundFlow || !refs.bgCanvas || !bgCtx || bgFlow.initialized) {
      return;
    }

    const count = 150;
    for (let i = 0; i < count; i += 1) {
      bgFlow.particles.push({
        x: Math.random(),
        y: Math.random(),
        vx: 0.00035 + Math.random() * 0.00085,
        size: 0.5 + Math.random() * 1.6,
        alpha: 0.03 + Math.random() * 0.08
      });
    }

    const updatePointer = (clientX, clientY) => {
      const rect = appRoot.getBoundingClientRect();
      bgFlow.mouseX = (clientX - rect.left) / Math.max(1, rect.width) - 0.5;
      bgFlow.mouseY = (clientY - rect.top) / Math.max(1, rect.height) - 0.5;
      appRoot.style.setProperty("--hud-pointer-x", `${(((clientX - rect.left) / Math.max(1, rect.width)) * 100).toFixed(2)}%`);
      appRoot.style.setProperty("--hud-pointer-y", `${(((clientY - rect.top) / Math.max(1, rect.height)) * 100).toFixed(2)}%`);
    };

    addManagedListener(appRoot, "mousemove", (event) => {
      updatePointer(event.clientX, event.clientY);
    });

    addManagedListener(appRoot, "touchmove", (event) => {
      if (event.touches.length > 0) {
        updatePointer(event.touches[0].clientX, event.touches[0].clientY);
      }
    }, { passive: true });

    addManagedListener(appRoot, "touchstart", (event) => {
      if (event.touches.length > 0) {
        updatePointer(event.touches[0].clientX, event.touches[0].clientY);
      }
    }, { passive: true });

    bgFlow.initialized = true;
  }

  function drawBackgroundFlow() {
    if (!bgFlow.initialized || !refs.bgCanvas || !bgCtx) {
      return;
    }
    const width = refs.bgCanvas.width;
    const height = refs.bgCanvas.height;
    if (!width || !height) {
      return;
    }

    bgCtx.clearRect(0, 0, width, height);
    const gradient = bgCtx.createRadialGradient(
      width * (0.7 + bgFlow.mouseX * 0.1),
      height * (0.22 - bgFlow.mouseY * 0.05),
      width * 0.04,
      width * 0.66,
      height * 0.35,
      width * 0.75
    );
    gradient.addColorStop(0, "rgba(255, 49, 72, 0.15)");
    gradient.addColorStop(1, "rgba(255, 49, 72, 0)");
    bgCtx.fillStyle = gradient;
    bgCtx.fillRect(0, 0, width, height);

    for (let i = 0; i < bgFlow.particles.length; i += 1) {
      const particle = bgFlow.particles[i];
      particle.x += particle.vx;
      particle.y += (bgFlow.mouseY * 0.0008 - (particle.y - 0.5) * 0.00004);
      if (particle.x > 1.03) {
        particle.x = -0.03;
        particle.y = Math.random();
      }
      if (particle.y < -0.05) particle.y = 1.05;
      if (particle.y > 1.05) particle.y = -0.05;
      bgCtx.beginPath();
      bgCtx.arc(particle.x * width, particle.y * height, particle.size * (window.devicePixelRatio || 1), 0, Math.PI * 2);
      bgCtx.fillStyle = `rgba(255, 96, 114, ${particle.alpha})`;
      bgCtx.fill();
    }
  }

  function bindControls() {
    addManagedListener(refs.yearFilter, "input", (event) => {
      state.activeYear = Number.parseInt(event.currentTarget.value, 10);
      if (refs.yearValue) {
        refs.yearValue.textContent = String(state.activeYear);
      }
      void rebuildFromFilters();
    });

    addManagedListener(refs.signalSpeed, "input", (event) => {
      state.signalSpeed = Number.parseFloat(event.currentTarget.value);
    });

    addManagedListener(refs.fit, "click", () => {
      state.renderer?.getCamera().animatedReset();
    });

    addManagedListener(refs.rebuild, "click", async () => {
      try {
        await loadGraphData();
        const hasRenderer = await rebuildFromFilters();
        if (hasRenderer) {
          startAnimationLoop();
        }
        onReady?.({ nodes: state.nodes.length, edges: state.edges.length });
      } catch (error) {
        emitRuntimeError(error, "Data error");
      }
    });

    addManagedListener(refs.search, "input", () => {
      clearSearchTimeout();
      searchTimeout = window.setTimeout(() => {
        void rebuildFromFilters();
      }, 250);
    });

    addManagedListener(refs.lens, "change", () => {
      void rebuildFromFilters();
    });

    addManagedListener(window, "resize", handleViewportResize);

    addManagedListener(document, "visibilitychange", () => {
      state.pageHidden = document.hidden;
      if (state.pageHidden) {
        stopAnimationLoop();
        if (state.threeAnimFrameId !== null) {
          window.cancelAnimationFrame(state.threeAnimFrameId);
          state.threeAnimFrameId = null;
        }
        return;
      }
      ensureAnimationLoop();
      state.resumeThreeLoop?.();
    });

    addManagedListener(refs.toggle3d, "click", async () => {
      try {
        await toggle3DMode();
      } catch (error) {
        state.is3DMode = false;
        emitRuntimeError(error, "3D mode error");
      }
    });
  }

  // --- 3D Neural Engine ---
  async function toggle3DMode() {
    if (!QUALITY.enable3d) {
      return;
    }
    state.is3DMode = !state.is3DMode;

    if (refs.toggle3dLabel) {
      refs.toggle3dLabel.textContent = state.is3DMode ? "2D" : "3D";
    }
    if (refs.toggle3d) {
      refs.toggle3d.style.background = state.is3DMode ? "rgba(255, 66, 88, 0.3)" : "";
      refs.toggle3d.style.borderColor = state.is3DMode ? "rgba(255, 66, 88, 0.6)" : "";
    }

    if (state.is3DMode) {
      stopAnimationLoop();
      state.activeSignals = [];
      destroyRenderer();

      if (refs.rendererHost) refs.rendererHost.style.display = "none";
      if (refs.canvas) refs.canvas.style.display = "none";
      if (refs.threeContainer) refs.threeContainer.style.display = "block";
      const visualizer = document.getElementById("node-visualizer-container");
      if (visualizer) visualizer.style.display = "none";

      await build3DScene();
    } else {
      destroy3DScene();
      if (refs.rendererHost) refs.rendererHost.style.display = "";
      if (refs.canvas) refs.canvas.style.display = "";
      if (refs.threeContainer) refs.threeContainer.style.display = "none";
      const visualizer = document.getElementById("node-visualizer-container");
      if (visualizer) visualizer.style.display = "";
      const hasRenderer = await rebuildFromFilters();
      if (hasRenderer) {
        startAnimationLoop();
      }
    }
  }

  function destroy3DScene() {
    state.resumeThreeLoop = null;
    if (state.graphEngine) {
      state.graphEngine.dispose();
      state.graphEngine = null;
      state.threeRenderer = null;
      state.threeScene = null;
      state.threeModule = null;
      state.threeCamera = null;
      state.threeControls = null;
      state.threeNodeMeshes = [];
      state.threeEdgeLines = null;
      state.threeRaycaster = null;
      state.threeMouse = null;
      state.threeHoveredMesh = null;
      if (refs.threeContainer) {
        refs.threeContainer.innerHTML = "";
      }
      return;
    }
    if (state.threeAnimFrameId !== null) {
      window.cancelAnimationFrame(state.threeAnimFrameId);
      state.threeAnimFrameId = null;
    }
    if (state.threeControls) {
      state.threeControls.dispose();
      state.threeControls = null;
    }
    if (state.threeRenderer) {
      state.threeRenderer.dispose();
      state.threeRenderer = null;
    }
    if (state.threeScene) {
      state.threeScene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose?.();
        }
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material?.dispose?.());
        }
      });
    }
    if (refs.threeContainer) {
      refs.threeContainer.innerHTML = "";
    }
    state.threeScene = null;
    state.threeModule = null;
    state.threeCamera = null;
    state.threeNodeMeshes = [];
    state.threeEdgeLines = null;
    state.threeRaycaster = null;
    state.threeMouse = null;
    state.threeHoveredMesh = null;
  }

  async function build3DScene() {
    if (!refs.threeContainer) return;

    destroy3DScene();

    const graph = state.graph;
    if (!graph || graph.order === 0) return;

    const nodes = [];
    graph.forEachNode((nodeId, attrs) => {
      nodes.push({ id: nodeId, ...attrs });
    });
    if (!nodes.length) return;

    const monthIndexes = nodes
      .map((node) => getNodeMonthIndex(node))
      .filter((value) => Number.isFinite(value));
    const timelineCenter = monthIndexes.length
      ? (Math.min(...monthIndexes) + Math.max(...monthIndexes)) / 2
      : 0;

    const nodePositions = new Map();
    nodes.forEach((node) => {
      const monthIndex = getNodeMonthIndex(node);
      const rawX = Number(node.x);
      const rawY = Number(node.y);
      const x = Number.isFinite(rawX) ? rawX : getStableDepthOffset(`${node.id}:x`) * FALLBACK_X_SPREAD;
      const y = Number.isFinite(rawY) ? rawY : getStableDepthOffset(`${node.id}:y`) * FALLBACK_Y_SPREAD;
      const z = Number.isFinite(monthIndex)
        ? (monthIndex - timelineCenter) * TIMELINE_Z_SCALE + getStableDepthOffset(node.id)
        : getStableDepthOffset(node.id);
      nodePositions.set(node.id, { x, y, z });
    });

    // Prefer the instanced GraphEngine (InstancedMesh nodes, batched edges,
    // frustum culling, LOD, adaptive pixel-ratio) — already proven on
    // /graph/prototype. The legacy per-node-mesh scene below is fallback only.
    try {
      const { GraphEngine } = await import("../../lib/graphEngine/GraphEngine.js");
      const engine = new GraphEngine({
        container: refs.threeContainer,
        onNodeClick: (node) => {
          inspectNode(node);
          engine.focusNode(node.id);
        },
        onNodeHover: (node) => {
          const canvas = engine.getDomElement();
          if (canvas) {
            canvas.style.cursor = node ? "pointer" : "grab";
          }
        },
      });
      const engineNodes = nodes.map((node) => {
        const pos = nodePositions.get(node.id);
        return {
          ...node,
          semanticType: getNodeSemanticType(node),
          x: pos.x,
          y: pos.y,
          z: pos.z,
        };
      });
      const initialized = await engine.init({
        nodes: engineNodes,
        edges: state.filteredEdges,
        positions: nodePositions,
      });
      if (state.destroyed || !state.is3DMode) {
        engine.dispose();
        return;
      }
      if (initialized) {
        state.graphEngine = engine;
        state.threeRenderer = { domElement: engine.getDomElement(), dispose: () => {} };
        const canvas = engine.getDomElement();
        if (canvas) {
          canvas.style.cursor = "grab";
        }
        return;
      }
      engine.dispose();
    } catch (error) {
      console.warn("GraphEngine unavailable, using legacy 3D renderer:", error);
    }

    const THREE = await import("three");
    const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

    state.threeModule = THREE;

    const rect = refs.threeContainer.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050202, 0.0018);

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 5000);
    camera.position.set(0, 0, 350);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY.maxDpr));
    renderer.setClearColor(0x050202, 1);
    refs.threeContainer.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 30;
    controls.maxDistance = 1200;

    // Raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 5 };
    const mouse = new THREE.Vector2();

    state.threeScene = scene;
    state.threeCamera = camera;
    state.threeRenderer = renderer;
    state.threeControls = controls;
    state.threeRaycaster = raycaster;
    state.threeMouse = mouse;

    // Ambient light
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const pointLight = new THREE.PointLight(0xff4258, 2, 800);
    pointLight.position.set(0, 100, 200);
    scene.add(pointLight);

    // Create node meshes with glow
    const nodeMeshes = [];
    const nodeGroup = new THREE.Group();

    nodes.forEach((node) => {
      const pos = nodePositions.get(node.id);
      const colorKey = getNodeSemanticType(node);
      const colorHex = CONFIG.nodeColors[colorKey] || "#3793ff";
      const color = new THREE.Color(colorHex);
      const baseSize = Math.sqrt(node.importance || 1) * 1.2 + 1.0;

      // Core sphere
      const geometry = new THREE.SphereGeometry(baseSize, 16, 12);
      const material = new THREE.MeshPhongMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.6,
        shininess: 80,
        transparent: true,
        opacity: 0.92
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.userData = { nodeId: node.id, nodeData: node, baseColor: colorHex, baseSize };
      nodeGroup.add(mesh);
      nodeMeshes.push(mesh);

      // Glow halo
      const glowGeo = new THREE.SphereGeometry(baseSize * 2.2, 12, 8);
      const glowMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(mesh.position);
      glow.userData.isGlow = true;
      nodeGroup.add(glow);
    });

    scene.add(nodeGroup);
    state.threeNodeMeshes = nodeMeshes;

    // Create edges
    const edgePositions = [];
    const edgeColors = [];
    const edgeColor = new THREE.Color(0x5c363a);

    graph.forEachEdge((_edgeId, _attrs, sourceId, targetId) => {
      const srcPos = nodePositions.get(sourceId);
      const tgtPos = nodePositions.get(targetId);
      if (srcPos && tgtPos) {
        edgePositions.push(srcPos.x, srcPos.y, srcPos.z);
        edgePositions.push(tgtPos.x, tgtPos.y, tgtPos.z);
        edgeColors.push(edgeColor.r, edgeColor.g, edgeColor.b);
        edgeColors.push(edgeColor.r, edgeColor.g, edgeColor.b);
      }
    });

    if (edgePositions.length) {
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
      lineGeo.setAttribute("color", new THREE.Float32BufferAttribute(edgeColors, 3));
      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending
      });
      const lines = new THREE.LineSegments(lineGeo, lineMat);
      scene.add(lines);
      state.threeEdgeLines = lines;
    }

    // Mouse interaction
    let hoveredMesh = null;
    const intersectableMeshes = nodeMeshes.filter((mesh) => !mesh.userData.isGlow);
    let raycastTick = 0;
    let mouseDirty = true;

    addManagedListener(renderer.domElement, "mousemove", (event) => {
      const canvasRect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
      mouse.y = -((event.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
      mouseDirty = true;
    });

    addManagedListener(renderer.domElement, "click", () => {
      if (hoveredMesh && hoveredMesh.userData.nodeData) {
        inspectNode(hoveredMesh.userData.nodeData);
        highlight3DNeighbors(hoveredMesh.userData.nodeId, THREE);
        // Fly camera to node
        const targetPos = hoveredMesh.position.clone();
        const camTarget = targetPos.clone().add(new THREE.Vector3(0, 0, 80));
        animateCamera(camera, controls, camTarget, targetPos, 800);
      }
    });

    // Animation loop
    let pulseTime = 0;
    function animate3D() {
      if (state.destroyed || !state.is3DMode || state.pageHidden) {
        state.threeAnimFrameId = null;
        return;
      }
      state.threeAnimFrameId = requestAnimationFrame(animate3D);
      pulseTime += 0.01;

      raycastTick += 1;
      if (mouseDirty || raycastTick % 3 === 0) {
        mouseDirty = false;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(intersectableMeshes, false);

        if (intersects.length > 0) {
          const newHover = intersects[0].object;
          if (hoveredMesh !== newHover) {
            if (hoveredMesh) {
              hoveredMesh.material.emissiveIntensity = 0.6;
              hoveredMesh.scale.setScalar(1);
            }
            hoveredMesh = newHover;
            hoveredMesh.material.emissiveIntensity = 1.2;
            hoveredMesh.scale.setScalar(1.5);
            renderer.domElement.style.cursor = "pointer";
          }
        } else if (hoveredMesh) {
          hoveredMesh.material.emissiveIntensity = 0.6;
          hoveredMesh.scale.setScalar(1);
          hoveredMesh = null;
          renderer.domElement.style.cursor = "grab";
        }
      }

      // Subtle pulse on all nodes
      nodeMeshes.forEach((mesh, i) => {
        if (mesh.userData.isGlow || mesh === hoveredMesh) {
          return;
        }
        const pulse = 1 + Math.sin(pulseTime + i * 0.3) * 0.04;
        mesh.scale.setScalar(pulse);
      });

      controls.update();
      renderer.render(scene, camera);
    }

    state.resumeThreeLoop = () => {
      if (state.is3DMode && !state.pageHidden && state.threeAnimFrameId === null) {
        animate3D();
      }
    };

    animate3D();
    renderer.domElement.style.cursor = "grab";
  }

  function highlight3DNeighbors(nodeId, THREE) {
    if (!state.graph || !state.threeNodeMeshes.length) return;
    const neighbors = new Set(state.graph.neighbors(nodeId));
    neighbors.add(nodeId);

    state.threeNodeMeshes.forEach((mesh) => {
      if (!mesh.userData.nodeId) return;
      const isHighlighted = neighbors.has(mesh.userData.nodeId);
      const isSelected = mesh.userData.nodeId === nodeId;

      if (isSelected) {
        mesh.material.emissiveIntensity = 1.5;
        mesh.material.opacity = 1;
        mesh.scale.setScalar(1.8);
      } else if (isHighlighted) {
        mesh.material.emissiveIntensity = 0.9;
        mesh.material.opacity = 0.95;
        mesh.scale.setScalar(1.2);
      } else {
        mesh.material.emissiveIntensity = 0.15;
        mesh.material.opacity = 0.2;
        mesh.scale.setScalar(0.7);
      }
    });

    // Highlight connected edges
    if (state.threeEdgeLines) {
      const colorsAttr = state.threeEdgeLines.geometry.getAttribute("color");
      const edgeList = state.filteredEdges;
      const highlightColor = new THREE.Color(0xff304c);
      const dimColor = new THREE.Color(0x1a0a0e);

      let idx = 0;
      edgeList.forEach((edge) => {
        const sourceId = edge.sourceId || edge.source;
        const targetId = edge.targetId || edge.target;
        const connected = (sourceId === nodeId || targetId === nodeId);
        const color = connected ? highlightColor : dimColor;
        if (idx * 2 + 1 < colorsAttr.count) {
          colorsAttr.setXYZ(idx * 2, color.r, color.g, color.b);
          colorsAttr.setXYZ(idx * 2 + 1, color.r, color.g, color.b);
        }
        idx++;
      });
      colorsAttr.needsUpdate = true;
    }
  }

  function animateCamera(camera, controls, targetPosition, lookAt, duration) {
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out

      camera.position.lerpVectors(startPos, targetPosition, ease);
      controls.target.lerpVectors(startTarget, lookAt, ease);
      controls.update();

      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  try {
    const runtime = await waitForGraphRuntime();

    if (state.destroyed) {
      return cleanup;
    }

    appRoot = runtime.appRoot;
    refs = runtime.refs;
    ctx = runtime.ctx;
    bgCtx = runtime.bgCtx;

    if (!refs.container || !refs.canvas || !ctx) {
      throw new Error("Gephi Lite: Required render elements are missing.");
    }

    appRoot.style.setProperty("--node-glow-color", DEFAULT_GLOW_COLOR);
    window.gephiLite = { selectNode: selectNodeById, flyToNode: flyToNodeById };

    assertSingleWebglSurface();

    if (!QUALITY.enable3d && refs.toggle3d) {
      refs.toggle3d.style.display = "none";
    }
    if (!QUALITY.enableNeuralSphere) {
      const visualizer = document.getElementById("node-visualizer-container");
      if (visualizer) visualizer.style.display = "none";
    }

    state.pageHidden = document.hidden;
    bindControls();
    renderFilters();
    initBackgroundFlow();

    await loadGraphData();
    const hasRenderer = await rebuildFromFilters();
    if (hasRenderer && !state.pageHidden) {
      startAnimationLoop();
    }
    onReady?.({ nodes: state.nodes.length, edges: state.edges.length });

    if (graphRefreshMs > 0) {
      state.pollTimerId = window.setInterval(() => {
        void pollGraphData();
      }, graphRefreshMs);
    }

    const focusParams = new URLSearchParams(window.location.search);
    const focusId = focusParams.get("focus");
    const focus3d = focusParams.get("mode") === "3d";
    if (focusId) {
      void flyToNodeById(focusId, focus3d);
    }

    return cleanup;
  } catch (error) {
    emitRuntimeError(error, "Runtime error");
    return cleanup;
  }
}
