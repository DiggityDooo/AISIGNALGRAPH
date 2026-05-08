"use strict";

const READY_CHECK_INTERVAL_MS = 100;
const READY_CHECK_ATTEMPTS = 20;
const DEFAULT_ACTIVE_YEAR = 2026;
const DEFAULT_GLOW_COLOR = "#ff3148";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function initGephiLite(options = {}) {
  console.log("Gephi Lite: Initializing...");

  const SigmaLib = options.SigmaLib || window.Sigma || window.sigma?.Sigma || window.sigma;
  const GraphCtor = options.GraphCtor || window.graphology?.Graph || window.graphology;
  const forceAtlas2 = options.forceAtlas2 || window.forceAtlas2;
  const onReady = typeof options.onReady === "function" ? options.onReady : null;
  const onError = typeof options.onError === "function" ? options.onError : null;

  const CONFIG = {
    nodeColors: {
      story: "#ff4258", lab: "#ff8b72", model: "#ff6678", person: "#ffd3ca",
      risk: "#ff1e3a", year: "#9c6c71", topic: "#ff9f8a", product: "#ffb38e", community: "#ff304c"
    },
    communityPalette: ["#ff304c", "#ff5a48", "#ff7756", "#ff5469", "#ff8f73", "#ff6b5a", "#ff4670", "#ff9b63"],
    maxSignals: 50
  };

  const state = {
    graph: null, renderer: null, nodes: [], edges: [], communities: [],
    filteredNodes: [], filteredEdges: [],
    activeSignals: [], activeYear: DEFAULT_ACTIVE_YEAR, signalSpeed: 1.0, selectedNode: null, hoveredNode: null,
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
    threeHoveredMesh: null
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
    const message = escapeHtml(renderErrorMessage(error));

    if (detailTitle) {
      detailTitle.textContent = "Graph initialization failed";
    }
    if (detailSubtitle) {
      detailSubtitle.textContent = subtitle;
    }
    if (detailContent) {
      detailContent.innerHTML = `<div class="detail-section">${message}</div>`;
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
              `Gephi Lite initialization timed out after ${READY_CHECK_INTERVAL_MS * READY_CHECK_ATTEMPTS}ms. Missing: ${runtime.missing.join(", ")}`
            )
          );
        }
      };

      intervalId = window.setInterval(evaluate, READY_CHECK_INTERVAL_MS);
      evaluate();
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
    const nodeType = getNodeSemanticType(node);
    const detailUrl = node.route || ((nodeType === "story" || nodeType === "topic")
      ? `/stories/${node.id.split(":").pop()}`
      : `/entities/${node.id.split(":").pop()}`);

    refs.detailTitle.innerHTML = `<a href="${detailUrl}" class="detail-title-link" title="Open full dossier">${node.label || node.id}</a>`;
    refs.detailSubtitle.textContent = nodeType.toUpperCase();
    const neighbors = state.graph ? state.graph.neighbors(node.id) : [];
    const neighborLinks = neighbors.map((neighborId) => {
      const neighbor = state.graph.getNodeAttributes(neighborId);
      return `<button class="neighbor-chip" onclick="window.gephiLite.selectNode('${neighborId}')">${neighbor.label || neighborId}</button>`;
    }).join("");

    refs.detailContent.innerHTML = `
      <div class="detail-section">
        ${node.summary || node.description || "No further intelligence available for this node."}
      </div>
      <div class="detail-community">
        <label class="detail-community-label">COMMUNITY</label>
        <div class="detail-community-value">
          ${node.community_name || "Global Cluster"}
        </div>
      </div>
      <div class="detail-section" style="margin-top:20px;">
        <label class="detail-community-label">CONNECTED INTELLIGENCE</label>
        <div class="detail-neighbors-list">
          ${neighborLinks || '<span style="color:#666">No direct connections</span>'}
        </div>
      </div>
    `;
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
    return buildGraph();
  }

  // --- Graph Engine ---
  async function loadGraphData() {
    const dataset = appRoot.dataset.datasetName || "";
    console.log(`Gephi Lite: Fetching graph data for dataset: ${dataset}`);

    try {
      const baseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:8080' : '';
      const response = await fetch(`${baseUrl}/api/graph?dataset=${dataset}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      state.nodes = (data.nodes || []).map((node) => ({
        ...node,
        semanticType: node.semanticType || node.type || node.node_type || "topic"
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

  function buildGraph(options = {}) {
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
      const colorKey = getNodeSemanticType(node);
      const color = CONFIG.nodeColors[colorKey] || "#3793ff";
      if (!graph.hasNode(node.id)) {
        graph.addNode(node.id, {
          ...node,
          label: node.label || node.id,
          size: Math.sqrt(node.importance || 1) * 1.5 + 1.5,
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
            color: "rgba(150, 150, 150, 0.2)",
            size: 1,
            type: "line"
          });
        }
      }
    });

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
      gravity: 0.0005,
      scalingRatio: 5000,
      strongGravityMode: false,
      outboundAttractionDistribution: true,
      linLogMode: true,
      adjustSizes: true,
      slowDown: 1.2
    };
    const isFiltered = state.filteredNodes.length < state.nodes.length;
    const iterations = isFiltered ? 50 : 300;
    console.time("FA2-Layout");
    forceAtlas2.assign(graph, { iterations, settings: spreadSettings });
    console.timeEnd("FA2-Layout");

    graph.forEachNode((nodeId, attrs) => {
      graph.setNodeAttribute(nodeId, "x", attrs.x * 4);
      graph.setNodeAttribute(nodeId, "y", attrs.y * 4);
    });

    console.log("Gephi Lite: Initializing Sigma renderer...");
    state.renderer = new SigmaLib(graph, ensureRendererHost(), {
      renderLabels: true,
      labelSize: 11,
      labelFont: "Outfit, Inter, system-ui, sans-serif",
      labelColor: { color: "#ffe7e9" },
      defaultEdgeColor: "rgba(180, 180, 180, 0.04)",
      edgeColor: "default",
      labelGridCellSize: 180,
      labelDensity: 0.25
    });

    state.renderer.setSetting("nodeReducer", (nodeId, data) => {
      const result = { ...data };
      const activeId = state.hoveredNode || state.selectedNode?.id;
      if (activeId) {
        const isTarget = nodeId === activeId;
        const isNeighbor = graph.neighbors(activeId).includes(nodeId);
        if (isTarget || isNeighbor) {
          result.label = data.label;
          result.zIndex = 999;
          if (isTarget) result.highlighted = true;
        } else {
          result.label = "";
          result.color = "rgba(50, 50, 50, 0.15)";
        }
      }
      return result;
    });

    state.renderer.setSetting("edgeReducer", (edgeId, data) => {
      const result = { ...data };
      const activeId = state.hoveredNode || state.selectedNode?.id;
      if (activeId) {
        if (graph.hasExtremity(edgeId, activeId)) {
          result.color = "#ff304c";
          result.size = 2.5;
          result.zIndex = 998;
        } else {
          result.hidden = true;
        }
      }
      return result;
    });

    state.renderer.on("enterNode", ({ node }) => {
      state.hoveredNode = node;
      const hovered = graph.getNodeAttributes(node);
      const hoverType = getNodeSemanticType(hovered);
      appRoot.style.setProperty("--node-glow-color", CONFIG.nodeColors[hoverType] || "#3793ff");
      state.renderer.refresh();
    });
    state.renderer.on("leaveNode", () => {
      state.hoveredNode = null;
      const selectedType = getNodeSemanticType(state.selectedNode);
      appRoot.style.setProperty("--node-glow-color", CONFIG.nodeColors[selectedType] || DEFAULT_GLOW_COLOR);
      state.renderer.refresh();
    });
    state.renderer.on("clickNode", ({ node }) => inspectNode(graph.getNodeAttributes(node)));
    state.renderer.on("clickStage", () => {
      state.selectedNode = null;
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

    syncCanvasSize();
    drawBackgroundFlow();
    ctx.clearRect(0, 0, refs.canvas.width, refs.canvas.height);
    if (state.renderer) {
      ctx.shadowBlur = 0;
      state.activeSignals = state.activeSignals.filter((signal) => {
        const alive = signal.update();
        if (alive) signal.draw(ctx, state.renderer);
        return alive;
      });
      if (Math.random() < 0.15) spawnSignal();
      updateStats();
    }

    state.animationFrameId = window.requestAnimationFrame(animate);
  }

  function startAnimationLoop() {
    if (!state.renderer || state.animationFrameId !== null || state.is3DMode) {
      return;
    }

    console.log("Gephi Lite: Starting animation loop...");
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

    addManagedListener(window, "resize", () => {
      syncCanvasSize();
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

    const THREE = await import("three");
    const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

    destroy3DScene();

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
      const x = Number.isFinite(rawX) ? rawX : getStableDepthOffset(`${node.id}:x`) * 2.5;
      const y = Number.isFinite(rawY) ? rawY : getStableDepthOffset(`${node.id}:y`) * 1.5;
      const z = Number.isFinite(monthIndex)
        ? (monthIndex - timelineCenter) * 10 + getStableDepthOffset(node.id)
        : getStableDepthOffset(node.id);
      nodePositions.set(node.id, { x, y, z });
    });

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
    window.gephiLite = { selectNode: selectNodeById };

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
