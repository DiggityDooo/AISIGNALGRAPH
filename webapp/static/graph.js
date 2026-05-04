"use strict";

(function bootstrapAISIGNALGRAPH() {
  console.log("AISIGNALGRAPH: Initializing...");
  const appRoot = document.getElementById("app-root");
  const SigmaLib = window.Sigma || window.sigma?.Sigma || window.sigma;
  const GraphologyLib = window.graphology;

  if (!appRoot) {
    console.error("AISIGNALGRAPH: #app-root not found.");
    return;
  }
  if (!SigmaLib || typeof SigmaLib !== "function") {
    console.error("AISIGNALGRAPH: Sigma library not found.");
    return;
  }
  if (!GraphologyLib) {
    console.error("AISIGNALGRAPH: Graphology library not found.");
    return;
  }

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
    activeSignals: [], activeYear: 2026, signalSpeed: 1.0, selectedNode: null, hoveredNode: null,
    visibleNodeTypes: new Set(["story", "entity", "lab", "model", "person", "risk", "topic", "product", "year", "community"])
  };

  const refs = {
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
    detailPane: document.getElementById("detail-pane")
  };

  const ctx = refs.canvas?.getContext("2d");
  const bgCtx = refs.bgCanvas?.getContext("2d");
  if (!refs.container || !refs.canvas || !ctx) {
    console.error("AISIGNALGRAPH: Required render elements are missing.");
    return;
  }

  // --- Utilities ---
  function escapeHTML(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function hexToRGBA(hex, alpha = 1) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
      if (element.dataset.targetValue !== String(nextValue)) {
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

  let lastStatsUpdate = 0;
  function updateStats(options = {}) {
    const { animate = false, force = false } = options;
    const now = window.performance.now();
    if (!force && now - lastStatsUpdate < 100) { // Max 10Hz for stats updates
      return;
    }
    lastStatsUpdate = now;

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
    const types = ["story", "entity", "lab", "model", "person", "risk", "topic", "product", "year", "community"];
    refs.nodeFilters.innerHTML = types.map(t => `
      <label class="node-type-filter-item">
        <input type="checkbox" checked data-type="${t}">
        <span class="node-type-dot" style="background:${CONFIG.nodeColors[t] || "#3793ff"}"></span>
        ${t.toUpperCase()}
      </label>
    `).join("");

    refs.nodeFilters.querySelectorAll("input[data-type]").forEach((checkbox) => {
      checkbox.addEventListener("change", (event) => {
        const type = event.target.dataset.type;
        if (event.target.checked) {
          state.visibleNodeTypes.add(type);
        } else {
          state.visibleNodeTypes.delete(type);
        }
        rebuildFromFilters();
      });
    });
  }

  function inspectNode(node) {
    state.selectedNode = node;
    // Cache neighbor set for fast reducer lookups
    if (state.graph && state.graph.hasNode(node.id)) {
      state._activeNeighborSet = new Set(state.graph.neighbors(node.id));
    } else {
      state._activeNeighborSet = new Set();
    }
    const nodeType = node.semanticType || node.node_type || "entity";
    const detailUrl = node.route || ((nodeType === "story" || nodeType === "topic")
      ? `/stories/${encodeURIComponent(node.id.split(':').pop())}`
      : `/entities/${encodeURIComponent(node.id.split(':').pop())}`);

    // XSS-safe: build DOM elements instead of raw innerHTML for user data
    refs.detailTitle.textContent = "";
    const titleLink = document.createElement("a");
    titleLink.href = detailUrl;
    titleLink.className = "detail-title-link";
    titleLink.title = "Open full dossier";
    titleLink.textContent = node.label || node.id;
    refs.detailTitle.appendChild(titleLink);

    refs.detailSubtitle.textContent = (nodeType).toUpperCase();
    const neighbors = state.graph ? state.graph.neighbors(node.id) : [];

    // Build neighbor chips safely via DOM API
    const neighborsContainer = document.createElement("div");
    neighborsContainer.className = "detail-neighbors-list";
    if (neighbors.length === 0) {
      const noConn = document.createElement("span");
      noConn.style.color = "#666";
      noConn.textContent = "No direct connections";
      neighborsContainer.appendChild(noConn);
    } else {
      neighbors.forEach(nid => {
        const n = state.graph.getNodeAttributes(nid);
        const btn = document.createElement("button");
        btn.className = "neighbor-chip";
        btn.textContent = n.label || nid;
        btn.addEventListener("click", () => window.aisignalgraph.selectNode(nid));
        neighborsContainer.appendChild(btn);
      });
    }

    refs.detailContent.innerHTML = "";
    const section1 = document.createElement("div");
    section1.className = "detail-section";
    section1.textContent = node.summary || node.description || "No further intelligence available for this node.";
    refs.detailContent.appendChild(section1);

    const communityDiv = document.createElement("div");
    communityDiv.className = "detail-community";
    const communityLabel = document.createElement("label");
    communityLabel.className = "detail-community-label";
    communityLabel.textContent = "COMMUNITY";
    const communityValue = document.createElement("div");
    communityValue.className = "detail-community-value";
    communityValue.textContent = node.community_name || "Global Cluster";
    communityDiv.appendChild(communityLabel);
    communityDiv.appendChild(communityValue);
    refs.detailContent.appendChild(communityDiv);

    const section2 = document.createElement("div");
    section2.className = "detail-section";
    section2.style.marginTop = "20px";
    const connLabel = document.createElement("label");
    connLabel.className = "detail-community-label";
    connLabel.textContent = "CONNECTED INTELLIGENCE";
    section2.appendChild(connLabel);
    section2.appendChild(neighborsContainer);
    refs.detailContent.appendChild(section2);

    refs.detailPane?.classList.add("is-active");
    updateVisualizer(node);
    state.renderer?.refresh();
  }

  function updateVisualizer(node) {
    const container = document.getElementById('node-visualizer-container');
    if (!container) return;

    // 1. Get Node Color
    const colorKey = node.semanticType || node.node_type || "entity";
    const color = CONFIG.nodeColors[colorKey] || "#3793ff";

    // 2. Apply CSS Variables
    container.style.setProperty('--node-glow-color', color);
    appRoot.style.setProperty('--node-glow-color', color);

    // 3. Trigger "Select" Animation
    container.classList.remove('node-selected-active');
    void container.offsetWidth; // Force Reflow
    container.classList.add('node-selected-active');
  }

  function selectNodeById(id) {
    if (!state.graph || !state.graph.hasNode(id)) return;
    const attrs = state.graph.getNodeAttributes(id);
    inspectNode(attrs);
    if (state.renderer) {
      state.renderer.getCamera().animate({ x: attrs.x, y: attrs.y, ratio: 0.15 }, { duration: 500 });
    }
  }
  window.aisignalgraph = { selectNode: selectNodeById };

  function filteredNodesByState() {
    const query = (refs.search?.value || "").trim().toLowerCase();
    let base = state.nodes.filter((node) => {
      const nodeType = node.semanticType || node.node_type || node.type;
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

  let rebuildTimeout = null;
  function rebuildFromFilters() {
    if (rebuildTimeout) clearTimeout(rebuildTimeout);
    rebuildTimeout = setTimeout(() => {
      state.filteredNodes = filteredNodesByState();
      const visibleIds = new Set(state.filteredNodes.map((node) => node.id));
      state.filteredEdges = filteredEdgesByNodes(visibleIds);
      buildGraph();
    }, 50); // Small debounce to prevent rapid rebuilds
  }

  // --- Graph Engine ---
  async function loadGraphData() {
    try {
      const dataset = appRoot.dataset.datasetName || "";
      console.log(`AISIGNALGRAPH: Fetching graph data for dataset: ${dataset}`);
      const response = await fetch(`/api/graph?dataset=${dataset}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      state.nodes = (data.nodes || []).map((node) => ({
        ...node,
        semanticType: node.semanticType || node.node_type || node.type || "topic"
      }));
      state.edges = data.edges || [];
      state.communities = data.communities || [];

      state.filteredNodes = [...state.nodes];
      state.filteredEdges = [...state.edges];
      console.log(`AISIGNALGRAPH: Data loaded. Nodes: ${state.nodes.length}, Edges: ${state.edges.length}`);
      return data;
    } catch (err) {
      console.error("AISIGNALGRAPH: Failed to load graph data:", err);
      return { nodes: [], edges: [] };
    }
  }

  function buildGraph() {
    console.log("AISIGNALGRAPH: Building graph...");
    if (!state.filteredNodes.length) {
      console.warn("AISIGNALGRAPH: No nodes to render.");
      if (state.renderer) {
        state.renderer.kill();
        refs.container.innerHTML = "";
      }
      updateStats();
      return;
    }

    if (state.renderer) {
      state.renderer.kill();
      refs.container.innerHTML = "";
    }

    const GraphCtor = GraphologyLib.MultiGraph || GraphologyLib.Graph;
    const graph = new GraphCtor();
    state.filteredNodes.forEach(n => {
      const colorKey = n.semanticType || n.node_type || n.type;
      const color = CONFIG.nodeColors[colorKey] || "#3793ff";
      if (!graph.hasNode(n.id)) {
        graph.addNode(n.id, {
          ...n,
          label: n.label || n.id,
          size: Math.sqrt(n.importance || 1) * 1.5 + 1.5,
          color: color,
          x: Math.random() * 100,
          y: Math.random() * 100,
          type: "circle"
        });
      }
    });

    state.filteredEdges.forEach(e => {
      const s = e.sourceId || e.source;
      const t = e.targetId || e.target;
      if (graph.hasNode(s) && graph.hasNode(t)) {
        const edgeKey = String(e.id || `${s}->${t}:${e.flow_kind || e.kind || "edge"}`);
        if (!graph.hasEdge(edgeKey)) {
          graph.addEdgeWithKey(edgeKey, s, t, { ...e, color: "rgba(150, 150, 150, 0.2)", size: 1, type: "line" });
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

    try {
      // Layout
      console.log("AISIGNALGRAPH: Running ForceAtlas2 layout...");
      const spreadSettings = {
        ...window.forceAtlas2.inferSettings(graph),
        gravity: 0.0005,
        scalingRatio: 5000,
        strongGravityMode: false,
        outboundAttractionDistribution: true,
        linLogMode: true,
        adjustSizes: true,
        slowDown: 1.2
      };
      console.time("FA2-Layout");
      // Reduced iterations for faster initial load, 1200 was too high for a single block
      window.forceAtlas2.assign(graph, { iterations: 250, settings: spreadSettings });
      console.timeEnd("FA2-Layout");

      // Post-layout aggressive spread
      graph.forEachNode((node, attrs) => {
        graph.setNodeAttribute(node, "x", attrs.x * 4);
        graph.setNodeAttribute(node, "y", attrs.y * 4);
      });

      // Render
      console.log("AISIGNALGRAPH: Initializing Sigma renderer...");
      state.renderer = new SigmaLib(graph, refs.container, {
        allowInvalidContainer: true,
        renderLabels: true,
        labelSize: 11,
        labelFont: "Outfit, Inter, system-ui, sans-serif",
        labelColor: { color: "#ffe7e9" },
        defaultEdgeColor: "rgba(180, 180, 180, 0.04)",
        edgeColor: "default",
        labelGridCellSize: 180,
        labelDensity: 0.25
      });

      // Declutter logic: Reducers (uses cached neighbor set for O(1) lookups)
      state.renderer.setSetting("nodeReducer", (node, data) => {
        const res = { ...data };
        const activeId = state.hoveredNode || state.selectedNode?.id;
        if (activeId) {
          const isTarget = node === activeId;
          const neighborSet = state._activeNeighborSet || new Set();
          const isNeighbor = neighborSet.has(node);
          if (isTarget || isNeighbor) {
            res.label = data.label;
            res.zIndex = 999;
            if (isTarget) res.highlighted = true;
          } else {
            res.label = "";
            res.color = "rgba(50, 50, 50, 0.15)";
          }
        }
        return res;
      });

      state.renderer.setSetting("edgeReducer", (edge, data) => {
        const res = { ...data };
        const activeId = state.hoveredNode || state.selectedNode?.id;
        if (activeId) {
          if (graph.hasExtremity(edge, activeId)) {
            res.color = "#ff304c";
            res.size = 2.5;
            res.zIndex = 998;
          } else {
            res.hidden = true;
          }
        }
        return res;
      });

      state.renderer.on("enterNode", ({ node }) => {
        state.hoveredNode = node;
        // Cache hovered node's neighbor set for fast reducer lookups
        state._activeNeighborSet = new Set(graph.neighbors(node));
        const hovered = graph.getNodeAttributes(node);
        const hoverType = hovered.semanticType || hovered.node_type || "entity";
        appRoot.style.setProperty("--node-glow-color", CONFIG.nodeColors[hoverType] || "#3793ff");
        state.renderer.refresh();
      });
      state.renderer.on("leaveNode", () => {
        state.hoveredNode = null;
        // Restore selected node's neighbor set or clear
        if (state.selectedNode?.id && state.graph?.hasNode(state.selectedNode.id)) {
          state._activeNeighborSet = new Set(graph.neighbors(state.selectedNode.id));
        } else {
          state._activeNeighborSet = null;
        }
        const selectedType = state.selectedNode?.semanticType || state.selectedNode?.node_type || "story";
        appRoot.style.setProperty("--node-glow-color", CONFIG.nodeColors[selectedType] || "#ff3148");
        state.renderer.refresh();
      });
    } catch (error) {
      console.error("AISIGNALGRAPH: Failed to initialize layout/renderer:", error);
      refs.detailTitle.textContent = "Graph initialization failed";
      refs.detailSubtitle.textContent = "Renderer error";
      refs.detailContent.innerHTML = `<div class="detail-section">${String(error?.message || error)}</div>`;
      return;
    }

    state.renderer.on("clickNode", ({ node }) => inspectNode(graph.getNodeAttributes(node)));
    state.renderer.on("clickStage", () => {
      state.selectedNode = null;
      refs.detailTitle.textContent = "Select a node";
      refs.detailSubtitle.textContent = "Select any node on the graph to view detailed intelligence.";
      refs.detailContent.innerHTML = "";
      refs.detailPane?.classList.remove("is-active");
      appRoot.style.setProperty("--node-glow-color", "#ff3148");
      const container = document.getElementById('node-visualizer-container');
      if (container) container.classList.remove('node-selected-active');
      state.renderer.getCamera().animatedReset();
    });

    // Cache edge list for signal spawning (avoids per-frame allocation)
    _cachedEdges = state.graph ? state.graph.edges() : [];
    console.log("AISIGNALGRAPH: Build complete.");
    syncCanvasSize();
    updateStats({ animate: true });
  }

  // --- Signals ---
  class Signal {
    constructor(s, t, color) {
      this.s = s; this.t = t; this.c = color;
      this.p = 0; this.v = 0.01 + Math.random() * 0.01;
    }
    update() { this.p += this.v * state.signalSpeed; return this.p < 1; }
    draw(ctx, renderer) {
      const p1 = renderer.graphToViewport(this.s);
      const p2 = renderer.graphToViewport(this.t);
      const x = p1.x + (p2.x - p1.x) * this.p;
      const y = p1.y + (p2.y - p1.y) * this.p;

      // Secondary glow - draw first
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = hexToRGBA(this.c, 0.2);
      ctx.fill();

      // Primary signal
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = this.c;
      ctx.fill();
    }
  }

  let _cachedEdges = [];
  function spawnSignal() {
    if (state.activeSignals.length >= CONFIG.maxSignals || !state.graph) return;
    if (!_cachedEdges.length) return;
    const edge = _cachedEdges[Math.floor(Math.random() * _cachedEdges.length)];
    const s = state.graph.getNodeAttributes(state.graph.source(edge));
    const t = state.graph.getNodeAttributes(state.graph.target(edge));
    state.activeSignals.push(new Signal(s, t, s.color));
  }

  let _lastAnimateTime = 0;
  let _signalAccumulator = 0;
  let _animationFrameId = null;
  function animate(now) {
    const dt = _lastAnimateTime ? (now - _lastAnimateTime) / 1000 : 0.016;
    _lastAnimateTime = now;
    drawBackgroundFlow();

    if (state.renderer) {
      ctx.clearRect(0, 0, refs.canvas.width, refs.canvas.height);
      state.activeSignals = state.activeSignals.filter(s => {
        const alive = s.update();
        if (alive) s.draw(ctx, state.renderer);
        return alive;
      });
      // Time-based signal spawning: ~9 signals/sec regardless of framerate
      _signalAccumulator += dt * 9;
      while (_signalAccumulator >= 1) {
        spawnSignal();
        _signalAccumulator -= 1;
      }
      updateStats();
    }
    _animationFrameId = requestAnimationFrame(animate);
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
    mouseY: 0,
    lastMouseX: -1,
    lastMouseY: -1,
    gradient: null
  };

  function initBackgroundFlow() {
    if (!refs.bgCanvas || !bgCtx || bgFlow.initialized) {
      return;
    }
    const count = 180; // Reduced particle count for performance
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

    appRoot.addEventListener("mousemove", (event) => {
      updatePointer(event.clientX, event.clientY);
    });

    appRoot.addEventListener("touchmove", (event) => {
      if (event.touches.length > 0) {
        updatePointer(event.touches[0].clientX, event.touches[0].clientY);
      }
    }, { passive: true });

    appRoot.addEventListener("touchstart", (event) => {
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

    // Only recreate gradient if mouse moved or no gradient exists
    if (!bgFlow.gradient || bgFlow.mouseX !== bgFlow.lastMouseX || bgFlow.mouseY !== bgFlow.lastMouseY) {
      bgFlow.gradient = bgCtx.createRadialGradient(
        width * (0.7 + bgFlow.mouseX * 0.1),
        height * (0.22 - bgFlow.mouseY * 0.05),
        width * 0.04,
        width * 0.66,
        height * 0.35,
        width * 0.75
      );
      bgFlow.gradient.addColorStop(0, "rgba(255, 49, 72, 0.12)");
      bgFlow.gradient.addColorStop(1, "rgba(255, 49, 72, 0)");
      bgFlow.lastMouseX = bgFlow.mouseX;
      bgFlow.lastMouseY = bgFlow.mouseY;
    }

    bgCtx.fillStyle = bgFlow.gradient;
    bgCtx.fillRect(0, 0, width, height);

    // Batched particle rendering: single path + fill for all same-alpha particles
    const dpr = window.devicePixelRatio || 1;
    const TAU = Math.PI * 2;
    // Group by alpha for fewer fill calls
    const alphaGroups = {};
    for (let i = 0; i < bgFlow.particles.length; i += 1) {
      const p = bgFlow.particles[i];
      p.x += p.vx;
      p.y += (bgFlow.mouseY * 0.0008 - (p.y - 0.5) * 0.00004);
      if (p.x > 1.03) { p.x = -0.03; p.y = Math.random(); }
      if (p.y < -0.05) p.y = 1.05;
      if (p.y > 1.05) p.y = -0.05;
      const key = p.alpha.toFixed(2);
      if (!alphaGroups[key]) alphaGroups[key] = [];
      alphaGroups[key].push(p);
    }
    for (const [alpha, particles] of Object.entries(alphaGroups)) {
      bgCtx.beginPath();
      for (const p of particles) {
        const px = p.x * width;
        const py = p.y * height;
        const r = p.size * dpr;
        bgCtx.moveTo(px + r, py);
        bgCtx.arc(px, py, r, 0, TAU);
      }
      bgCtx.fillStyle = `rgba(255, 96, 114, ${alpha})`;
      bgCtx.fill();
    }
  }

  // --- Init ---
  refs.yearFilter && (refs.yearFilter.oninput = (e) => {
    state.activeYear = parseInt(e.target.value);
    refs.yearValue.textContent = state.activeYear;
    rebuildFromFilters();
  });
  refs.signalSpeed && (refs.signalSpeed.oninput = (e) => state.signalSpeed = parseFloat(e.target.value));
  refs.fit && (refs.fit.onclick = () => state.renderer?.getCamera().animatedReset());
  refs.rebuild && (refs.rebuild.onclick = () => loadGraphData().then(rebuildFromFilters));
  refs.search && (refs.search.oninput = () => rebuildFromFilters());
  refs.lens && (refs.lens.onchange = () => rebuildFromFilters());

  window.addEventListener("resize", syncCanvasSize);
  renderFilters();
  initBackgroundFlow();
  window.addEventListener("beforeunload", () => {
    if (_animationFrameId) cancelAnimationFrame(_animationFrameId);
    if (_3dState) _destroy3D();
  });

  // ─── 3D MODE ─────────────────────────────────────────────────────────────
  let _3dState = null;

  function toggle3DMode() {
    const btn = document.getElementById("mode-3d-button");
    if (_3dState) {
      // ── Tear down 3D, restore 2D ──────────────────────────────────────────
      _destroy3D();
      if (btn) { btn.textContent = "3D MODE"; btn.classList.remove("is-active-3d"); }
      // Rebuild Sigma 2D renderer
      buildGraph();
      _animationFrameId = requestAnimationFrame(animate);
    } else {
      if (!window.THREE) {
        console.warn("AISIGNALGRAPH: Three.js not loaded — cannot enter 3D mode.");
        return;
      }
      // ── Kill 2D renderer, launch 3D ───────────────────────────────────────
      if (_animationFrameId) { cancelAnimationFrame(_animationFrameId); _animationFrameId = null; }
      if (state.renderer) { state.renderer.kill(); state.renderer = null; }
      // Clear the sigma container's inner renderer divs (but keep our overlays)
      const sigChildren = refs.container.querySelectorAll("[data-sigma-container], .sigma-container");
      sigChildren.forEach(c => c.remove());

      _3dState = _init3D();
      if (btn) { btn.textContent = "2D MODE"; btn.classList.add("is-active-3d"); }
    }
  }

  function _destroy3D() {
    if (!_3dState) return;
    cancelAnimationFrame(_3dState.animId);
    window.removeEventListener("resize", _3dState.onResize);
    window.removeEventListener("mouseup", _3dState.onMouseUp);
    _3dState.renderer3d.domElement.removeEventListener("mousemove", _3dState.onHoverMove);
    _3dState.renderer3d.dispose();
    _3dState.canvas3d.remove();
    if (_3dState.labelEl) _3dState.labelEl.remove();
    _3dState = null;
  }

  function _init3D() {
    const THREE = window.THREE;
    const container = refs.container;
    const rect = container.getBoundingClientRect();

    // ── Scene & Camera ──────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080208, 0.00032);

    const camera = new THREE.PerspectiveCamera(55, rect.width / rect.height, 0.1, 50000);
    const sph = { theta: 0, phi: Math.PI / 2.4, r: 1200 };
    const cameraTarget = new THREE.Vector3(0, 0, 0);

    function applyCamera() {
      camera.position.set(
        sph.r * Math.sin(sph.phi) * Math.sin(sph.theta),
        sph.r * Math.cos(sph.phi),
        sph.r * Math.sin(sph.phi) * Math.cos(sph.theta)
      );
      camera.lookAt(cameraTarget);
    }
    applyCamera();

    // ── WebGL Renderer ──────────────────────────────────────────────────────
    const renderer3d = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer3d.setSize(rect.width, rect.height);
    renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer3d.setClearColor(0x050208, 1);
    const canvas3d = renderer3d.domElement;
    canvas3d.style.cssText = "position:absolute;inset:0;z-index:8;cursor:grab;";
    container.appendChild(canvas3d);

    // ── Floating label overlay ──────────────────────────────────────────────
    const labelEl = document.createElement("div");
    labelEl.style.cssText = `
      position:absolute; z-index:12; pointer-events:none;
      font: 600 12px 'JetBrains Mono', monospace; color:#ffe7e9;
      background: rgba(10,2,5,0.82); border:1px solid rgba(255,49,72,0.4);
      padding: 4px 10px; border-radius: 6px;
      text-shadow: 0 0 8px rgba(255,49,72,0.6);
      opacity:0; transition: opacity 0.15s ease;
      white-space: nowrap; transform: translate(-50%, -120%);
    `;
    container.appendChild(labelEl);

    // ── Vibrant color palette ───────────────────────────────────────────────
    const VIBRANT = {
      story: "#ff2244", lab: "#ff6644", model: "#ff4488",
      person: "#ff88aa", risk: "#ff0033", year: "#cc5566",
      topic: "#ff7755", product: "#ff9944", community: "#ff3355",
      entity: "#44aaff"
    };

    // ── Build Nodes ─────────────────────────────────────────────────────────
    const nodeObjects = [];
    const nodeMap = {};
    const neighborCache = {};  // id → Set of neighbor ids

    if (state.graph) {
      // Pre-cache neighbors for highlight
      state.graph.forEachNode((id) => {
        neighborCache[id] = new Set(state.graph.neighbors(id));
      });

      state.graph.forEachNode((id, attrs) => {
        const r = Math.max(2.5, (attrs.size || 3) * 1.1);
        const type = attrs.semanticType || attrs.node_type || "entity";
        const hexColor = VIBRANT[type] || VIBRANT.entity;
        const col = new THREE.Color(hexColor);

        // Core sphere — brighter via emissive-style trick
        const mat = new THREE.MeshBasicMaterial({ color: col });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 18), mat);
        mesh.position.set(
          (attrs.x || 0) * 3,
          (attrs.y || 0) * -3,
          (Math.random() - 0.5) * 600
        );
        mesh.userData = { id, attrs, baseColor: col.clone(), baseScale: 1, type };
        scene.add(mesh);
        nodeObjects.push(mesh);
        nodeMap[id] = mesh;

        // Inner glow (bright core)
        const innerGlow = new THREE.Mesh(
          new THREE.SphereGeometry(r * 0.5, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false })
        );
        mesh.add(innerGlow);

        // Outer halo (vibrant glow)
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(r * 3.5, 14, 14),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.09, depthWrite: false })
        );
        mesh.add(halo);
      });

      // ── Build Edges ───────────────────────────────────────────────────────
      state.graph.forEachEdge((_id, _attrs, source, target) => {
        const s = nodeMap[source];
        const t = nodeMap[target];
        if (!s || !t) return;
        const geo = new THREE.BufferGeometry().setFromPoints([s.position.clone(), t.position.clone()]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: 0x661133, transparent: true, opacity: 0.12
        }));
        line.userData = { source, target };
        scene.add(line);
      });
    }

    // ── Ambient point lights for depth ──────────────────────────────────────
    const ambientGlow = new THREE.PointLight(0xff3148, 0.8, 3000);
    ambientGlow.position.set(0, 200, 0);
    scene.add(ambientGlow);
    scene.add(new THREE.AmbientLight(0x221111, 0.3));

    // ── Orbital Controls ────────────────────────────────────────────────────
    let dragging = false, lastMouse = { x: 0, y: 0 }, dragDist = 0;

    canvas3d.addEventListener("mousedown", e => {
      dragging = true; dragDist = 0;
      lastMouse = { x: e.clientX, y: e.clientY };
      canvas3d.style.cursor = "grabbing";
    });
    const onMouseUp = () => { dragging = false; canvas3d.style.cursor = "grab"; };
    window.addEventListener("mouseup", onMouseUp);

    canvas3d.addEventListener("mousemove", e => {
      if (!dragging) return;
      const dx = e.clientX - lastMouse.x, dy = e.clientY - lastMouse.y;
      dragDist += Math.abs(dx) + Math.abs(dy);
      sph.theta -= dx * 0.004;
      sph.phi = Math.max(0.15, Math.min(Math.PI - 0.15, sph.phi + dy * 0.004));
      lastMouse = { x: e.clientX, y: e.clientY };
      applyCamera();
    });

    canvas3d.addEventListener("wheel", e => {
      sph.r = Math.max(200, Math.min(4000, sph.r + e.deltaY * 0.8));
      applyCamera();
      e.preventDefault();
    }, { passive: false });

    // ── Raycasting — Hover & Click ──────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredMesh = null;
    let selectedMesh = null;

    function raycast(e) {
      const r2 = canvas3d.getBoundingClientRect();
      pointer.x = ((e.clientX - r2.left) / r2.width) * 2 - 1;
      pointer.y = -((e.clientY - r2.top) / r2.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(nodeObjects);
    }

    // Hover
    const onHoverMove = (e) => {
      if (dragging) { labelEl.style.opacity = "0"; return; }
      const hits = raycast(e);
      if (hits.length > 0) {
        const mesh = hits[0].object;
        if (mesh !== hoveredMesh) {
          // Reset previous hover
          if (hoveredMesh && hoveredMesh !== selectedMesh) {
            hoveredMesh.scale.setScalar(hoveredMesh.userData.baseScale);
            hoveredMesh.material.color.copy(hoveredMesh.userData.baseColor);
          }
          hoveredMesh = mesh;
          canvas3d.style.cursor = "pointer";
          // Highlight hovered node
          mesh.scale.setScalar(1.5);
          mesh.material.color.set(0xffffff);
          // Show label
          const projected = mesh.position.clone().project(camera);
          const lx = (projected.x * 0.5 + 0.5) * rect.width;
          const ly = (-projected.y * 0.5 + 0.5) * rect.height;
          labelEl.textContent = mesh.userData.attrs?.label || mesh.userData.id;
          labelEl.style.left = lx + "px";
          labelEl.style.top = ly + "px";
          labelEl.style.opacity = "1";
        }
      } else {
        if (hoveredMesh && hoveredMesh !== selectedMesh) {
          hoveredMesh.scale.setScalar(hoveredMesh.userData.baseScale);
          hoveredMesh.material.color.copy(hoveredMesh.userData.baseColor);
        }
        hoveredMesh = null;
        if (!dragging) canvas3d.style.cursor = "grab";
        labelEl.style.opacity = "0";
      }
    };
    canvas3d.addEventListener("mousemove", onHoverMove);

    // Click — select node + highlight neighbors + fly camera
    canvas3d.addEventListener("click", e => {
      if (dragDist > 8) return;  // Was a drag, not a click
      const hits = raycast(e);

      // Reset previous selection
      if (selectedMesh) {
        selectedMesh.scale.setScalar(selectedMesh.userData.baseScale);
        selectedMesh.material.color.copy(selectedMesh.userData.baseColor);
        // Reset all neighbor dimming
        nodeObjects.forEach(m => {
          m.material.opacity = 1;
          m.material.transparent = false;
          m.visible = true;
        });
        scene.children.forEach(c => {
          if (c.isLine && c.userData.source) {
            c.material.opacity = 0.12;
            c.material.color.set(0x661133);
          }
        });
      }

      if (hits.length > 0) {
        const mesh = hits[0].object;
        selectedMesh = mesh;
        const { id, attrs } = mesh.userData;
        if (attrs) { inspectNode(attrs); updateVisualizer(attrs); }

        // Highlight selected
        mesh.scale.setScalar(2.0);
        mesh.material.color.set(0xffffff);

        // Highlight neighbors, dim the rest
        const neighbors = neighborCache[id] || new Set();
        nodeObjects.forEach(m => {
          if (m === mesh) return;
          if (neighbors.has(m.userData.id)) {
            m.material.transparent = false;
            m.material.opacity = 1;
            m.scale.setScalar(1.2);
          } else {
            m.material.transparent = true;
            m.material.opacity = 0.12;
            m.scale.setScalar(0.6);
          }
        });
        // Highlight connected edges
        scene.children.forEach(c => {
          if (c.isLine && c.userData.source) {
            if (c.userData.source === id || c.userData.target === id) {
              c.material.opacity = 0.7;
              c.material.color.set(0xff3148);
            } else {
              c.material.opacity = 0.03;
            }
          }
        });

        // Fly camera toward selected node
        const targetPos = mesh.position.clone();
        const flyDist = 350;
        const dir = camera.position.clone().sub(targetPos).normalize();
        const dest = targetPos.clone().add(dir.multiplyScalar(flyDist));
        const startPos = camera.position.clone();
        const startTarget = cameraTarget.clone();
        let flyT = 0;
        const flyInterval = setInterval(() => {
          flyT += 0.025;
          if (flyT >= 1) { flyT = 1; clearInterval(flyInterval); }
          const ease = 1 - Math.pow(1 - flyT, 3);
          camera.position.lerpVectors(startPos, dest, ease);
          cameraTarget.lerpVectors(startTarget, targetPos, ease);
          camera.lookAt(cameraTarget);
          // Update spherical from new position for continued orbit
          if (flyT >= 1) {
            const p = camera.position;
            sph.r = p.length();
            sph.phi = Math.acos(Math.max(-1, Math.min(1, p.y / sph.r)));
            sph.theta = Math.atan2(p.x, p.z);
          }
        }, 16);
      } else {
        // Click empty space — deselect
        selectedMesh = null;
        refs.detailTitle.textContent = "Select a node";
        refs.detailSubtitle.textContent = "Select any node on the graph to view detailed intelligence.";
        refs.detailContent.innerHTML = "";
        refs.detailPane?.classList.remove("is-active");
        // Reset camera target
        cameraTarget.set(0, 0, 0);
      }
    });

    // ── Resize ──────────────────────────────────────────────────────────────
    const onResize = () => {
      const r2 = container.getBoundingClientRect();
      camera.aspect = r2.width / r2.height;
      camera.updateProjectionMatrix();
      renderer3d.setSize(r2.width, r2.height);
    };
    window.addEventListener("resize", onResize);

    // ── Animate ─────────────────────────────────────────────────────────────
    let animId;
    let _t = 0;
    function animate3d() {
      animId = requestAnimationFrame(animate3d);
      _t += 0.016;

      if (!dragging) {
        sph.theta += 0.0003;
        applyCamera();
      }

      // Breathing pulse on halos + inner glow
      nodeObjects.forEach((mesh, i) => {
        const pulse = Math.sin(_t * 1.4 + i * 0.37);
        // Outer halo
        if (mesh.children[1]) {
          mesh.children[1].material.opacity = 0.06 + 0.05 * pulse;
        }
        // Inner glow
        if (mesh.children[0]) {
          mesh.children[0].material.opacity = 0.28 + 0.12 * pulse;
        }
      });

      // Ambient light drift
      ambientGlow.position.x = 400 * Math.sin(_t * 0.3);
      ambientGlow.position.z = 400 * Math.cos(_t * 0.2);

      // Update label position if hovering
      if (hoveredMesh && labelEl.style.opacity === "1") {
        const r2 = container.getBoundingClientRect();
        const projected = hoveredMesh.position.clone().project(camera);
        labelEl.style.left = ((projected.x * 0.5 + 0.5) * r2.width) + "px";
        labelEl.style.top = ((-projected.y * 0.5 + 0.5) * r2.height) + "px";
      }

      renderer3d.render(scene, camera);
    }
    animate3d();

    console.log("AISIGNALGRAPH: 3D mode initialized — " + nodeObjects.length + " nodes rendered.");
    return { renderer3d, canvas3d, animId, scene, camera, onResize, onMouseUp, onHoverMove, labelEl };
  }

  // Wire 3D toggle button
  const mode3dBtn = document.getElementById("mode-3d-button");
  if (mode3dBtn) mode3dBtn.addEventListener("click", toggle3DMode);

  // ── Expose globally ───────────────────────────────────────────────────────
  window.aisignalgraph = { selectNode: selectNodeById, toggle3D: toggle3DMode };

  loadGraphData().then(rebuildFromFilters).then(() => {
    console.log("AISIGNALGRAPH: Starting animation loop...");
    _animationFrameId = requestAnimationFrame(animate);
  });
})();
