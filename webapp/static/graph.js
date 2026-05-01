"use strict";

(function bootstrapGephiLite() {
  console.log("Gephi Lite: Initializing...");
  const appRoot = document.getElementById("app-root");
  const SigmaLib = window.Sigma || window.sigma?.Sigma || window.sigma;
  const GraphologyLib = window.graphology;

  if (!appRoot) {
    console.error("Gephi Lite: #app-root not found.");
    return;
  }
  if (!SigmaLib || typeof SigmaLib !== "function") {
    console.error("Gephi Lite: Sigma library not found.");
    return;
  }
  if (!GraphologyLib) {
    console.error("Gephi Lite: Graphology library not found.");
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
    console.error("Gephi Lite: Required render elements are missing.");
    return;
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
    const nodeType = node.semanticType || node.node_type || "entity";
    const detailUrl = node.route || ((nodeType === "story" || nodeType === "topic") 
      ? `/stories/${node.id.split(':').pop()}` 
      : `/entities/${node.id.split(':').pop()}`);

    refs.detailTitle.innerHTML = `<a href="${detailUrl}" class="detail-title-link" title="Open full dossier">${node.label || node.id}</a>`;
    refs.detailSubtitle.textContent = (nodeType).toUpperCase();
    const neighbors = state.graph ? state.graph.neighbors(node.id) : [];
    const neighborLinks = neighbors.map(nid => {
      const n = state.graph.getNodeAttributes(nid);
      return `<button class="neighbor-chip" onclick="window.gephiLite.selectNode('${nid}')">${n.label || nid}</button>`;
    }).join("");

    refs.detailContent.innerHTML = `
      <div class="detail-section">
        ${node.summary || node.description || "No further intelligence available for this node."}
      </div>
      <div class="detail-community">
        <label class="detail-community-label">COMMUNITY</label>
        <div class="detail-community-value">
          ${node.community_name || 'Global Cluster'}
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
  window.gephiLite = { selectNode: selectNodeById };

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

  function rebuildFromFilters() {
    state.filteredNodes = filteredNodesByState();
    const visibleIds = new Set(state.filteredNodes.map((node) => node.id));
    state.filteredEdges = filteredEdgesByNodes(visibleIds);
    buildGraph();
  }

  // --- Graph Engine ---
  async function loadGraphData() {
    try {
      const dataset = appRoot.dataset.datasetName || "";
      console.log(`Gephi Lite: Fetching graph data for dataset: ${dataset}`);
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
      console.log(`Gephi Lite: Data loaded. Nodes: ${state.nodes.length}, Edges: ${state.edges.length}`);
      return data;
    } catch (err) {
      console.error("Gephi Lite: Failed to load graph data:", err);
      return { nodes: [], edges: [] };
    }
  }

  function buildGraph() {
    console.log("Gephi Lite: Building graph...");
    if (!state.filteredNodes.length) {
      console.warn("Gephi Lite: No nodes to render.");
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
      console.log("Gephi Lite: Running ForceAtlas2 layout...");
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
      window.forceAtlas2.assign(graph, { iterations: 1200, settings: spreadSettings });
      console.timeEnd("FA2-Layout");

      // Post-layout aggressive spread
      graph.forEachNode((node, attrs) => {
        graph.setNodeAttribute(node, "x", attrs.x * 4);
        graph.setNodeAttribute(node, "y", attrs.y * 4);
      });

      // Render
      console.log("Gephi Lite: Initializing Sigma renderer...");
      state.renderer = new SigmaLib(graph, refs.container, {
        renderLabels: true,
        labelSize: 11,
        labelFont: "Outfit, Inter, system-ui, sans-serif",
        labelColor: { color: "#ffe7e9" },
        defaultEdgeColor: "rgba(180, 180, 180, 0.04)",
        edgeColor: "default",
        labelGridCellSize: 180,
        labelDensity: 0.25
      });

      // Declutter logic: Reducers
      state.renderer.setSetting("nodeReducer", (node, data) => {
        const res = { ...data };
        const activeId = state.hoveredNode || state.selectedNode?.id;
        if (activeId) {
          const isTarget = node === activeId;
          const isNeighbor = graph.neighbors(activeId).includes(node);
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
        const hovered = graph.getNodeAttributes(node);
        const hoverType = hovered.semanticType || hovered.node_type || "entity";
        appRoot.style.setProperty("--node-glow-color", CONFIG.nodeColors[hoverType] || "#3793ff");
        state.renderer.refresh();
      });
      state.renderer.on("leaveNode", () => {
        state.hoveredNode = null;
        const selectedType = state.selectedNode?.semanticType || state.selectedNode?.node_type || "story";
        appRoot.style.setProperty("--node-glow-color", CONFIG.nodeColors[selectedType] || "#ff3148");
        state.renderer.refresh();
      });
    } catch (error) {
      console.error("Gephi Lite: Failed to initialize layout/renderer:", error);
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

    console.log("Gephi Lite: Build complete.");
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
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = this.c;
      ctx.shadowBlur = 5;
      ctx.shadowColor = this.c;
      ctx.fill();
    }
  }

  function spawnSignal() {
    if (state.activeSignals.length >= CONFIG.maxSignals || !state.graph) return;
    const edges = state.graph.edges();
    if (!edges.length) return;
    const edge = edges[Math.floor(Math.random() * edges.length)];
    const s = state.graph.getNodeAttributes(state.graph.source(edge));
    const t = state.graph.getNodeAttributes(state.graph.target(edge));
    state.activeSignals.push(new Signal(s, t, s.color));
  }

  function animate() {
    syncCanvasSize();
    drawBackgroundFlow();
    ctx.clearRect(0, 0, refs.canvas.width, refs.canvas.height);
    if (state.renderer) {
      ctx.shadowBlur = 0;
      state.activeSignals = state.activeSignals.filter(s => {
        const alive = s.update();
        if (alive) s.draw(ctx, state.renderer);
        return alive;
      });
      if (Math.random() < 0.15) spawnSignal();
      updateStats();
    }
    requestAnimationFrame(animate);
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
    const count = 420;
    for (let i = 0; i < count; i += 1) {
      bgFlow.particles.push({
        x: Math.random(),
        y: Math.random(),
        vx: 0.00035 + Math.random() * 0.00085,
        size: 0.5 + Math.random() * 1.6,
        alpha: 0.03 + Math.random() * 0.08
      });
    }
    appRoot.addEventListener("mousemove", (event) => {
      const rect = appRoot.getBoundingClientRect();
      bgFlow.mouseX = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
      bgFlow.mouseY = (event.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
      appRoot.style.setProperty("--hud-pointer-x", `${(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100).toFixed(2)}%`);
      appRoot.style.setProperty("--hud-pointer-y", `${(((event.clientY - rect.top) / Math.max(1, rect.height)) * 100).toFixed(2)}%`);
    });
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
      const p = bgFlow.particles[i];
      p.x += p.vx;
      p.y += (bgFlow.mouseY * 0.0008 - (p.y - 0.5) * 0.00004);
      if (p.x > 1.03) {
        p.x = -0.03;
        p.y = Math.random();
      }
      if (p.y < -0.05) p.y = 1.05;
      if (p.y > 1.05) p.y = -0.05;
      bgCtx.beginPath();
      bgCtx.arc(p.x * width, p.y * height, p.size * (window.devicePixelRatio || 1), 0, Math.PI * 2);
      bgCtx.fillStyle = `rgba(255, 96, 114, ${p.alpha})`;
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
  loadGraphData().then(rebuildFromFilters).then(() => {
    console.log("Gephi Lite: Starting animation loop...");
    animate();
  });
})();
