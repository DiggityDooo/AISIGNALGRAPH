"use strict";

import { GRAPH_CONFIG } from "../../../lib/graph/config.js";
import {
  DEFAULT_ACTIVE_YEAR,
  DEFAULT_GLOW_COLOR,
  FALLBACK_X_SPREAD,
  FALLBACK_Y_SPREAD,
  TIMELINE_Z_SCALE,
  READY_CHECK_INTERVAL_MS,
  READY_CHECK_ATTEMPTS,
  CONTAINER_SIZE_TIMEOUT_MS,
  OBSIDIAN_GRAPH,
  BUBBLE_PHYSICS,
} from "../../../lib/graph/constants.js";
import {
  renderErrorMessage,
  hasMeasurableContainerSize,
  safeInternalRoute,
  getNodeSemanticType,
  getStableDepthOffset,
  getNodeMonthIndex,
  getCanvasNodeColor,
} from "../../../lib/graph/nodeUtils.js";
import { filterNodes, filterEdges } from "../../../lib/graph/filters.js";
import { fetchFtsStoryIds, resolveGraphFetch } from "../../../lib/graph/data.js";
import { exportSubgraphJson } from "../../../lib/graph/export.js";
import { requestServerRebuild } from "../../../lib/graph/rebuild.js";
import { collectHudRefs, validateHudRefs } from "../../../lib/graph/hudRefs.js";

export async function initGephiLite(options = {}) {
  console.log("Gephi Lite: Initializing...");

  const SigmaLib = options.SigmaLib || window.Sigma || window.sigma?.Sigma || window.sigma;
  const GraphCtor = options.GraphCtor || window.graphology?.Graph || window.graphology;
  const forceAtlas2 = options.forceAtlas2 || window.forceAtlas2;
  const onReady = typeof options.onReady === "function" ? options.onReady : null;
  const onError = typeof options.onError === "function" ? options.onError : null;
  const onNodeSelect = typeof options.onNodeSelect === "function" ? options.onNodeSelect : null;
  const onStatsChange = typeof options.onStatsChange === "function" ? options.onStatsChange : null;
  const getFilterState = typeof options.getFilterState === "function" ? options.getFilterState : null;
  const useReactHud = Boolean(options.useReactHud);

  const CONFIG = GRAPH_CONFIG;

  function getCanvasNodeColorForNode(node) {
    return getCanvasNodeColor(node, OBSIDIAN_GRAPH);
  }

  function getCurrentFilters() {
    const external = getFilterState?.();
    return {
      query: external?.searchQuery ?? refs.search?.value ?? "",
      lens: external?.lens ?? refs.lens?.value ?? "global",
      activeYear: external?.activeYear ?? state.activeYear,
      activeEra: external?.activeEra ?? state.activeEra,
      serverYearFilter: external?.serverYearFilter ?? state.serverYearFilter,
      signalSpeed: external?.signalSpeed ?? state.signalSpeed,
      visibleNodeTypes: external?.visibleNodeTypes ?? state.visibleNodeTypes,
    };
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
    activeSignals: [], activeYear: DEFAULT_ACTIVE_YEAR, activeEra: "", serverYearFilter: true, signalSpeed: 1.0, selectedNode: null, hoveredNode: null,
    ftsStoryIds: new Set(),
    visibleNodeTypes: new Set(["story", "entity", "lab", "model", "person", "risk", "topic", "product", "year", "community"]),
    animationFrameId: null,
    destroyed: false,
    is3DMode: false,
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
    graphEngine: null,
    physicsEnabled: true,
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
    animateFrame: 0
  };

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

  function addManagedListener(target, eventName, handler, listenerOptions) {
    if (!target || typeof target.addEventListener !== "function") {
      return;
    }

    target.addEventListener(eventName, handler, listenerOptions);
    managedListeners.push(() => {
      target.removeEventListener(eventName, handler, listenerOptions);
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
    stopAnimationLoop();

    // Clean up 3D scene
    destroy3DScene();

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
    const currentRefs = collectHudRefs();
    const missing = validateHudRefs(currentRefs, { SigmaLib, GraphCtor, forceAtlas2 });

    return {
      appRoot: currentRefs.appRoot,
      refs: currentRefs,
      ctx: currentRefs.canvas?.getContext("2d") || null,
      bgCtx: currentRefs.bgCanvas?.getContext("2d") || null,
      missing,
    };
  }

  function waitForGraphRuntime() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      let intervalId = null;

      const evaluate = () => {
        const runtime = collectRuntimeReadiness();

        if (runtime.missing.length === 0) {
          if (intervalId !== null) {
            window.clearInterval(intervalId);
          }
          resolve(runtime);
          return;
        }

        attempts += 1;
        if (attempts > READY_CHECK_ATTEMPTS) {
          if (intervalId !== null) {
            window.clearInterval(intervalId);
          }

          reject(
            new Error(
              `Gephi Lite initialization timed out after ${CONTAINER_SIZE_TIMEOUT_MS}ms. Missing: ${runtime.missing.join(", ")}`
            )
          );
        }
      };

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
    onStatsChange?.({
      nodes: state.filteredNodes.length,
      edges: state.filteredEdges.length,
      signals: state.activeSignals.length,
    });
  }

  function renderFilters() {
    if (useReactHud || !refs.nodeFilters) {
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
    const neighborIds = state.graph ? state.graph.neighbors(node.id) : [];
    const neighborSummaries = neighborIds.map((neighborId) => {
      const neighbor = state.graph.getNodeAttributes(neighborId);
      return { id: neighborId, label: String(neighbor.label || neighborId) };
    });

    if (onNodeSelect) {
      onNodeSelect({
        id: String(node.id || ""),
        label: String(node.label || node.id || "Untitled node"),
        type: nodeType,
        summary: node.summary,
        description: node.description,
        community_name: node.community_name,
        route: detailUrl,
        neighbors: neighborSummaries,
      });
      return;
    }

    refs.detailTitle.textContent = "";
    const detailLink = document.createElement("a");
    detailLink.href = detailUrl;
    detailLink.className = "detail-title-link";
    detailLink.title = "Open full dossier";
    detailLink.textContent = String(node.label || node.id || "Untitled node");
    refs.detailTitle.appendChild(detailLink);
    refs.detailSubtitle.textContent = nodeType.toUpperCase();
    const neighborsList = document.createElement("div");
    neighborsList.className = "detail-neighbors-list";
    if (neighborIds.length) {
      neighborIds.forEach((neighborId) => {
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

  function filteredNodesByState() {
    const filters = getCurrentFilters();
    state.activeYear = filters.activeYear;
    state.signalSpeed = filters.signalSpeed;
    return filterNodes({
      nodes: state.nodes,
      edges: state.edges,
      query: filters.query,
      lens: filters.lens,
      activeYear: filters.activeYear,
      visibleNodeTypes: filters.visibleNodeTypes,
      selectedNodeId: state.selectedNode?.id,
      ftsStoryIds: state.ftsStoryIds,
    });
  }

  function filteredEdgesByNodes(visibleNodeIds) {
    return filterEdges(state.edges, visibleNodeIds);
  }

  async function rebuildFromFilters() {
    state.filteredNodes = filteredNodesByState();
    const visibleIds = new Set(state.filteredNodes.map((node) => node.id));
    state.filteredEdges = filteredEdgesByNodes(visibleIds);
    if (state.is3DMode) {
      // Rebuild the filtered graph data without remounting Sigma so the 3D scene stays in sync.
      buildGraph({ mountRenderer: false });
      await build3DScene();
      updateStats({ animate: true });
      return false;
    }
    return await buildGraph();
  }

  async function refreshFtsMatches() {
    const { query } = getCurrentFilters();
    state.ftsStoryIds = await fetchFtsStoryIds(query);
  }

  function exportVisibleSubgraph() {
    exportSubgraphJson(state.filteredNodes, state.filteredEdges);
  }

  function exportGraphScreenshot() {
    const canvas = refs.container?.querySelector("canvas");
    if (!canvas) {
      return;
    }
    const url = canvas.toDataURL("image/png");
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aisignalgraph-view-${Date.now()}.png`;
    anchor.click();
  }

  // --- Graph Engine ---
  async function loadGraphData() {
    const dataset = appRoot.dataset.datasetName || "";
    const filters = getCurrentFilters();
    console.log(`Gephi Lite: Fetching graph data for dataset: ${dataset}`);

    try {
      const data = await resolveGraphFetch({
        dataset,
        activeEra: filters.activeEra,
        activeYear: filters.activeYear,
        serverYearFilter: filters.serverYearFilter,
      });

      state.nodes = (data.nodes || []).map((node) => ({
        ...node,
        semanticType: getNodeSemanticType(node)
      }));
      state.edges = data.edges || [];
      state.communities = data.communities || [];

      state.filteredNodes = [...state.nodes];
      state.filteredEdges = [...state.edges];
      console.log(`Gephi Lite: Data loaded. Nodes: ${state.nodes.length}, Edges: ${state.edges.length}`);
      return data;
    } catch (error) {
      console.error("Gephi Lite: Failed to load graph data:", error);
      throw error;
    }
  }

  async function reloadGraphData() {
    await loadGraphData();
    const hasRenderer = await rebuildFromFilters();
    if (hasRenderer) {
      startAnimationLoop();
    }
    onStatsChange?.({ nodes: state.filteredNodes.length, edges: state.filteredEdges.length, signals: state.activeSignals.length });
  }

  async function buildGraph(options = {}) {
    const { mountRenderer = true } = options;
    console.log("Gephi Lite: Building graph...");
    if (!state.filteredNodes.length) {
      console.warn("Gephi Lite: No nodes to render.");
      destroyRenderer();
      updateStats();
      return false;
    }

    destroyRenderer();

    const graph = new GraphCtor({ multi: true });
    state.filteredNodes.forEach((node) => {
      const color = getCanvasNodeColorForNode(node);
      if (!graph.hasNode(node.id)) {
        graph.addNode(node.id, {
          ...node,
          label: node.label || node.id,
          size: 2,
          color,
          x: Math.random() * 100,
          y: Math.random() * 100,
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
    const iterations = isFiltered ? 40 : 120;
    console.time("FA2-Layout");
    forceAtlas2.assign(graph, { iterations, settings: spreadSettings });
    console.timeEnd("FA2-Layout");

    resetBubblePhysics(graph);

    await waitForContainerSize(refs.container);
    syncCanvasSize();

    console.log("Gephi Lite: Initializing Sigma renderer...");
    state.renderer = new SigmaLib(graph, ensureRendererHost(), {
      renderLabels: true,
      labelSize: OBSIDIAN_GRAPH.labelSize,
      labelFont: OBSIDIAN_GRAPH.labelFont,
      labelColor: { color: OBSIDIAN_GRAPH.labelColor },
      defaultNodeColor: OBSIDIAN_GRAPH.defaultNode,
      defaultEdgeColor: OBSIDIAN_GRAPH.edgeColor,
      edgeColor: "default",
      labelGridCellSize: OBSIDIAN_GRAPH.labelGridCellSize,
      labelDensity: OBSIDIAN_GRAPH.labelDensity,
      labelRenderedSizeThreshold: OBSIDIAN_GRAPH.labelRenderedSizeThreshold,
      minEdgeThickness: OBSIDIAN_GRAPH.minEdgeThickness
    });

    state.renderer.getCamera().on("updated", () => {
      state.cameraDirty = true;
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
    });
    state.renderer.on("leaveNode", () => {
      state.hoveredNode = null;
      updateFocusContext();
      const selectedType = state.selectedNode ? getNodeSemanticType(state.selectedNode) : null;
      appRoot.style.setProperty("--node-glow-color", (selectedType && CONFIG.nodeColors[selectedType]) || DEFAULT_GLOW_COLOR);
      state.cameraDirty = true;
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
    if (state.destroyed) {
      return;
    }

    state.animateFrame += 1;
    syncCanvasSize();
    if (state.animateFrame % BUBBLE_PHYSICS.bgFlowInterval === 0) {
      drawBackgroundFlow();
    }
    ctx.clearRect(0, 0, refs.canvas.width, refs.canvas.height);
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

      ctx.shadowBlur = 0;
      const hadSignals = state.activeSignals.length > 0;
      state.activeSignals = state.activeSignals.filter((signal) => {
        const alive = signal.update();
        if (alive) signal.draw(ctx, state.renderer);
        return alive;
      });
      if (state.activeSignals.length > 0 || hadSignals) {
        needsRefresh = true;
      }
      if (CONFIG.maxSignals > 0 && Math.random() < 0.15) spawnSignal();

      if (needsRefresh) {
        state.renderer.refresh();
        state.cameraDirty = false;
      }

      if (state.animateFrame % BUBBLE_PHYSICS.statsInterval === 0) {
        updateStats();
      }
    }

    state.animationFrameId = window.requestAnimationFrame(animate);
  }

  function startAnimationLoop() {
    if (!state.renderer || state.animationFrameId !== null || state.is3DMode) {
      return;
    }

    console.log("Gephi Lite: Starting animation loop...");
    state.physicsLastTime = performance.now();
    animate();
  }

  function stopAnimationLoop() {
    if (state.animationFrameId !== null) {
      window.cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }
  }

  function syncCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
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
    if (!refs.bgCanvas || !bgCtx || bgFlow.initialized) {
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
    if (!refs.bgCanvas || !bgCtx) {
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
    if (!useReactHud) {
      addManagedListener(refs.yearFilter, "input", (event) => {
        state.activeYear = Number.parseInt(event.currentTarget.value, 10);
        if (refs.yearValue) {
          refs.yearValue.textContent = String(state.activeYear);
        }
        void rebuildFromFilters();
      });

      addManagedListener(refs.search, "input", () => {
        clearSearchTimeout();
        searchTimeout = window.setTimeout(async () => {
          await refreshFtsMatches();
          void rebuildFromFilters();
        }, 250);
      });

      addManagedListener(refs.lens, "change", () => {
        void rebuildFromFilters();
      });
    }

    if (!useReactHud) {
      addManagedListener(refs.signalSpeed, "input", (event) => {
        state.signalSpeed = Number.parseFloat(event.currentTarget.value);
      });
    }

    addManagedListener(refs.fit, "click", () => {
      state.renderer?.getCamera().animatedReset();
    });

    addManagedListener(refs.rebuild, "click", async () => {
      const rebuildButton = refs.rebuild;
      const priorLabel = rebuildButton?.textContent;
      try {
        if (rebuildButton) {
          rebuildButton.disabled = true;
          rebuildButton.textContent = "Refreshing...";
        }
        await requestServerRebuild();
        await loadGraphData();
        const hasRenderer = await rebuildFromFilters();
        if (hasRenderer) {
          startAnimationLoop();
        }
        onReady?.({ nodes: state.nodes.length, edges: state.edges.length });
      } catch (error) {
        emitRuntimeError(error, "Data error");
      } finally {
        if (rebuildButton) {
          rebuildButton.disabled = false;
          rebuildButton.textContent = priorLabel || "Rebuild";
        }
      }
    });

    addManagedListener(window, "keydown", (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        if (event.key !== "Escape") {
          return;
        }
      }
      if (event.key === "/" && refs.search) {
        event.preventDefault();
        refs.search.focus();
        return;
      }
      if (event.key === "f" || event.key === "F") {
        state.renderer?.getCamera().animatedReset();
        return;
      }
      if (event.key === "3") {
        void toggle3DMode();
        return;
      }
      if (event.key === "e" || event.key === "E") {
        if (event.shiftKey) {
          exportGraphScreenshot();
        } else {
          exportVisibleSubgraph();
        }
      }
    });

    addManagedListener(window, "resize", () => {
      syncCanvasSize();
      state.renderer?.resize();
      if (state.is3DMode && state.threeRenderer && state.threeCamera && refs.threeContainer) {
        const rect = refs.threeContainer.getBoundingClientRect();
        state.threeCamera.aspect = rect.width / rect.height;
        state.threeCamera.updateProjectionMatrix();
        state.threeRenderer.setSize(rect.width, rect.height);
      }
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
    if (state.graphEngine) {
      state.graphEngine.dispose();
      state.graphEngine = null;
      state.threeRenderer = null;
      state.threeScene = null;
      state.threeCamera = null;
      state.threeControls = null;
      state.threeNodeMeshes = [];
      state.threeEdgeLines = null;
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

    try {
      const { GraphEngine } = await import("../../../lib/graphEngine/GraphEngine.js");
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

    const rect = refs.threeContainer.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050202, 0.0018);

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 5000);
    camera.position.set(0, 0, 350);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    addManagedListener(renderer.domElement, "mousemove", (event) => {
      const canvasRect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
      mouse.y = -((event.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
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
      if (state.destroyed || !state.is3DMode) return;
      state.threeAnimFrameId = requestAnimationFrame(animate3D);
      pulseTime += 0.01;

      // Raycasting for hover
      raycaster.setFromCamera(mouse, camera);
      const intersectable = nodeMeshes.filter(m => !m.userData.isGlow);
      const intersects = raycaster.intersectObjects(intersectable);

      if (intersects.length > 0) {
        const newHover = intersects[0].object;
        if (hoveredMesh !== newHover) {
          // Reset previous
          if (hoveredMesh) {
            hoveredMesh.material.emissiveIntensity = 0.6;
            hoveredMesh.scale.setScalar(1);
          }
          hoveredMesh = newHover;
          hoveredMesh.material.emissiveIntensity = 1.2;
          hoveredMesh.scale.setScalar(1.5);
          renderer.domElement.style.cursor = "pointer";
        }
      } else {
        if (hoveredMesh) {
          hoveredMesh.material.emissiveIntensity = 0.6;
          hoveredMesh.scale.setScalar(1);
          hoveredMesh = null;
          renderer.domElement.style.cursor = "grab";
        }
      }

      // Subtle pulse on all nodes
      nodeMeshes.forEach((mesh, i) => {
        if (mesh !== hoveredMesh) {
          const pulse = 1 + Math.sin(pulseTime + i * 0.3) * 0.04;
          mesh.scale.setScalar(pulse);
        }
      });

      controls.update();
      renderer.render(scene, camera);
    }

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
    window.gephiLite = {
      selectNode: selectNodeById,
      rebuildFilters: () => rebuildFromFilters(),
      refreshFtsMatches: () => refreshFtsMatches(),
      exportSubgraph: () => exportVisibleSubgraph(),
      fit: () => state.renderer?.getCamera().animatedReset(),
      toggle3D: () => toggle3DMode(),
      rebuildData: async () => {
        await requestServerRebuild();
        await reloadGraphData();
        onReady?.({ nodes: state.nodes.length, edges: state.edges.length });
      },
      reloadGraphData: () => reloadGraphData(),
    };

    bindControls();
    renderFilters();
    initBackgroundFlow();

    await loadGraphData();
    const hasRenderer = await rebuildFromFilters();
    if (hasRenderer) {
      startAnimationLoop();
    }
    onReady?.({ nodes: state.nodes.length, edges: state.edges.length });

    return cleanup;
  } catch (error) {
    emitRuntimeError(error, "Runtime error");
    return cleanup;
  }
}
