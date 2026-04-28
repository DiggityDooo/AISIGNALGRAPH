"use strict";

(function bootstrapGraph() {
  const appRoot = document.getElementById("app-root");
  if (!appRoot || typeof d3 === "undefined") {
    return;
  }

  window.__AISIGNALGRAPH_DEBUG = { stage: "boot" };

  const CONFIG = {
    nodeBaseRadius: 6,
    nodeMaxRadius: 32,
    linkDistance: 140,
    chargeStrength: -110,
    alphaDecay: 0.02,
    alphaMin: 0.001,
    velocityDecay: 0.6,
    signalSpawnRate: 400,
    maxSignals: navigator.maxTouchPoints > 0 ? 20 : 80,
    attentionDecay: 0.97,
    mobile: navigator.maxTouchPoints > 0,
  };

  const NODE_COLORS = {
    story: "#FF3148", // Alert Red
    lab: "#8B5CF6", // Neural Purple
    model: "#22D3EE", // Cyber Cyan
    person: "#F59E0B", // Amber
    risk: "#10B981", // Success Green
    year: "#64748B", // Slate
    topic: "#F43F5E", // Rose
    product: "#3B82F6", // Blue
    concept: "#D946EF", // Fuchsia
    event: "#14B8A6", // Teal
  };

  const NODE_LABELS = {
    story: "Stories",
    lab: "Labs",
    model: "Models",
    person: "People",
    risk: "Risks",
    year: "Years",
    topic: "Topics",
    product: "Products",
    concept: "Concepts",
    event: "Events",
  };

  const EDGE_STYLE_MAP = {
    story_to_lab: { color: "#FF3148", dash: null, distance: 160, strength: 0.15 },
    story_to_model: { color: "#FF5568", dash: null, distance: 150, strength: 0.15 },
    story_to_person: { color: "#FFD0D5", dash: "4,4", distance: 180, strength: 0.1 },
    story_to_risk: { color: "#FF142D", dash: "2,6", distance: 200, strength: 0.08 },
    year_to_story: { color: "#FF9C73", dash: null, distance: 220, strength: 0.05 },
    story_context: { color: "#7B5F63", dash: "1,8", distance: 200, strength: 0.05 },
    mentions: { color: "#FF3148", dash: null, distance: 160, strength: 0.1 },
    context: { color: "#7B5F63", dash: "1,8", distance: 200, strength: 0.05 },
    related: { color: "#7B5F63", dash: "6,4", distance: 170, strength: 0.08 },
  };

  const refs = {
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
    detailLink: document.getElementById("detail-link"),
    detailClose: document.getElementById("detail-close"),
  };

  const nodeCtx = refs.nodeCanvas.getContext("2d");
  const signalCtx = refs.signalCanvas.getContext("2d");
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";
  const debugMode = new URLSearchParams(window.location.search).has("debug");
  const debugTarget = document.querySelector(".hud-canvas-hint");

  const state = {
    allNodes: [],
    allEdges: [],
    nodes: [],
    edges: [],
    nodeById: new Map(),
    linksByNode: new Map(),
    attention: {},
    activeSignals: [],
    simulation: null,
    root: null,
    edgeLayer: null,
    rippleLayer: null,
    hitLayer: null,
    edgeSelection: null,
    nodeSelection: null,
    currentTransform: d3.zoomIdentity,
    zoomBehavior: null,
    selectedId: null,
    highlightedIds: new Set(),
    activeNodeTypes: new Set(Object.keys(NODE_COLORS)),
    activeEdgeKinds: new Set(["mentions", "context", "related"]),
    query: "",
    activeYear: 2026,
    minYear: 2020,
    maxYear: 2026,
    signalSpeed: 1,
    signalTimer: null,
    isPaused: false,
    initialFitPending: true,
    is3DMode: false,
    threeGraph: null,
    monthFloor: 2020 * 12 + 1,
    monthCeiling: 2026 * 12 + 12,
  };

  function fail(error, stage = "error") {
    window.__AISIGNALGRAPH_DEBUG = {
      stage,
      message: String(error?.stack || error || "unknown error"),
    };
    writeDebug();
    if (refs.detailCopy && refs.hudRight) {
      refs.detailCopy.textContent = String(error?.message || error || "The graph failed to initialize.");
      refs.hudRight.classList.add("is-open");
    }
  }

  function writeDebug(extra = {}) {
    const snapshot = {
      ...window.__AISIGNALGRAPH_DEBUG,
      ...extra,
      svgRect: refs.svg?.node()?.getBoundingClientRect ? {
        width: Math.round(refs.svg.node().getBoundingClientRect().width),
        height: Math.round(refs.svg.node().getBoundingClientRect().height),
      } : null,
      nodeCanvas: refs.nodeCanvas ? { width: refs.nodeCanvas.width, height: refs.nodeCanvas.height } : null,
      signalCanvas: refs.signalCanvas ? { width: refs.signalCanvas.width, height: refs.signalCanvas.height } : null,
      nodeCount: state.nodes.length,
      edgeCount: state.edges.length,
      firstNode: state.nodes[0] ? {
        id: state.nodes[0].id,
        x: Number.isFinite(state.nodes[0].x) ? Math.round(state.nodes[0].x) : null,
        y: Number.isFinite(state.nodes[0].y) ? Math.round(state.nodes[0].y) : null,
      } : null,
      transform: {
        x: Math.round(state.currentTransform.x || 0),
        y: Math.round(state.currentTransform.y || 0),
        k: Number((state.currentTransform.k || 1).toFixed(3)),
      },
    };
    window.__AISIGNALGRAPH_DEBUG = snapshot;
    if (debugTarget && debugMode) {
      debugTarget.style.whiteSpace = "pre-wrap";
      debugTarget.style.maxWidth = "520px";
      debugTarget.textContent = JSON.stringify(snapshot, null, 2);
    }
  }

  class SignalPulse {
    constructor(sourceNode, targetNode, edgeType) {
      this.source = sourceNode;
      this.target = targetNode;
      this.progress = 0;
      this.speed = (0.008 + Math.random() * 0.006) * state.signalSpeed;
      this.color = edgeStyle({ kind: edgeType, type: edgeType }).color;
      this.size = 3 + Math.random() * 2;
      this.trail = [];
      this.trailLen = 12;
      this.alive = true;
    }

    update() {
      if (state.isPaused) {
        return;
      }
      this.progress += this.speed;
      const x = this.source.x + (this.target.x - this.source.x) * this.progress;
      const y = this.source.y + (this.target.y - this.source.y) * this.progress;
      this.trail.unshift({ x, y });
      if (this.trail.length > this.trailLen) {
        this.trail.pop();
      }
      if (this.progress >= 1) {
        this.alive = false;
        activateNode(this.target);
      }
    }

    draw(ctx) {
      this.trail.forEach((point, index) => {
        const alpha = (1 - index / this.trailLen) * 0.8;
        const radius = this.size * (1 - index / this.trailLen);
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(this.color, alpha);
        ctx.fill();
      });
      if (!this.trail.length) {
        return;
      }
      const head = this.trail[0];
      const gradient = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, this.size * 4);
      gradient.addColorStop(0, hexToRgba(this.color, 0.6));
      gradient.addColorStop(1, hexToRgba(this.color, 0));
      ctx.beginPath();
      ctx.arc(head.x, head.y, this.size * 4, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }

  function hexToRgba(hex, alpha) {
    const value = hex.replace("#", "");
    const normalized = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
    const parsed = Number.parseInt(normalized, 16);
    const r = (parsed >> 16) & 255;
    const g = (parsed >> 8) & 255;
    const b = parsed & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function sanitizeType(value) {
    return NODE_COLORS[value] ? value : "topic";
  }

  function seedNodePositions(nodes) {
    const rect = refs.svg.node().getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    const centerX = width / 2;
    const centerY = height / 2;
    nodes.forEach((node, index) => {
      if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
        return;
      }
      const angle = index * 0.37;
      const spread = 40 + Math.sqrt(index + 1) * 18;
      node.x = centerX + Math.cos(angle) * spread;
      node.y = centerY + Math.sin(angle) * spread;
    });
  }

  function syncCanvasSize(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.floor(rect.width * ratio);
    const height = Math.floor(rect.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return rect;
  }

  function displayKind(kind) {
    if (kind === "mentions") {
      return "Mentions";
    }
    if (kind === "context") {
      return "Context";
    }
    return "Related";
  }

  function edgeKind(edge) {
    if (edge.kind === "mentions") {
      return "mentions";
    }
    if (edge.kind === "context") {
      return "context";
    }
    return "related";
  }

  function edgeStyle(edge) {
    return EDGE_STYLE_MAP[edge.type] || EDGE_STYLE_MAP[edge.kind] || EDGE_STYLE_MAP.related;
  }

  function storyIdFromNodeId(nodeId) {
    return nodeId.replace(/^story:/, "");
  }

  function nodeYear(node) {
    if (node.year) {
      return Number.parseInt(node.year, 10) || state.maxYear;
    }
    const source = node.timeline_month || "";
    return Number.parseInt(source.slice(0, 4), 10) || state.maxYear;
  }

  function monthIndexFromKey(monthKey) {
    if (!monthKey) {
      return null;
    }
    const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
    if (!match) {
      return null;
    }
    return Number.parseInt(match[1], 10) * 12 + Number.parseInt(match[2], 10);
  }

  function monthIndexForNode(node) {
    if (node.timeline_month) {
      const timelineIndex = monthIndexFromKey(node.timeline_month);
      if (timelineIndex) {
        return timelineIndex;
      }
    }
    const year = nodeYear(node);
    return Number.isFinite(year) ? year * 12 + 1 : state.monthFloor;
  }

  function typeRowIndex(type) {
    const orderedTypes = ["year", "story", "lab", "model", "person", "product", "topic", "risk"];
    const index = orderedTypes.indexOf(type);
    return index >= 0 ? index : orderedTypes.indexOf("topic");
  }

  function clusterCenters(width, height, compact = false) {
    const centerX = width / 2;
    const centerY = height / 2;
    const spreadX = compact ? width * 0.18 : width * 0.3;
    const spreadY = compact ? height * 0.16 : height * 0.24;

    return {
      year: { x: centerX - spreadX * 1.25, y: centerY - spreadY * 1.45 },
      story: { x: centerX - spreadX * 1.15, y: centerY + spreadY * 0.1 },
      lab: { x: centerX - spreadX * 0.12, y: centerY - spreadY * 1.1 },
      model: { x: centerX - spreadX * 0.04, y: centerY + spreadY * 1.08 },
      person: { x: centerX + spreadX * 0.95, y: centerY - spreadY * 1.05 },
      product: { x: centerX + spreadX * 0.92, y: centerY + spreadY * 0.38 },
      topic: { x: centerX + spreadX * 0.38, y: centerY - spreadY * 0.08 },
      risk: { x: centerX + spreadX * 1.22, y: centerY + spreadY * 1.08 },
    };
  }

  function buildLayoutTargets(width, height) {
    const targets = new Map();
    const orphanIds = new Set();

    if (state.lens === "chronological") {
      const minIndex = state.monthFloor;
      const maxIndex = Math.max(state.monthCeiling, minIndex + 1);
      const usableWidth = Math.max(width - 180, 240);
      const leftPad = 90;
      const rowCount = 8;
      const topPad = 92;
      const rowGap = rowCount > 1 ? (height - topPad * 2) / (rowCount - 1) : 0;

      state.nodes.forEach((node) => {
        const monthIndex = Math.min(Math.max(monthIndexForNode(node), minIndex), maxIndex);
        const ratio = (monthIndex - minIndex) / Math.max(maxIndex - minIndex, 1);
        targets.set(node.id, {
          x: leftPad + usableWidth * ratio,
          y: topPad + rowGap * typeRowIndex(node.type),
        });
      });

      return { targets, orphanIds };
    }

    if (state.lens === "orphans") {
      const compactCenters = clusterCenters(width, height, true);
      const orphanNodes = state.nodes
        .filter((node) => Math.min(node.degree || 0, node.globalDegree || 0) <= 1)
        .sort((left, right) => (left.label || "").localeCompare(right.label || ""));
      const orphanCount = Math.max(orphanNodes.length, 1);
      const ringRadius = Math.min(width, height) * 0.42;

      orphanNodes.forEach((node, index) => {
        orphanIds.add(node.id);
        const angle = (Math.PI * 2 * index) / orphanCount - Math.PI / 2;
        targets.set(node.id, {
          x: width / 2 + Math.cos(angle) * ringRadius,
          y: height / 2 + Math.sin(angle) * ringRadius,
        });
      });

      state.nodes.forEach((node) => {
        if (!targets.has(node.id)) {
          targets.set(node.id, compactCenters[node.type] || compactCenters.topic);
        }
      });

      return { targets, orphanIds };
    }

    const centers = clusterCenters(width, height, state.lens === "clusters" || state.lens === "local");
    state.nodes.forEach((node) => {
      targets.set(node.id, centers[node.type] || centers.topic);
    });

    return { targets, orphanIds };
  }

  function layoutStrength(node, axis, orphanIds) {
    if (state.lens === "chronological") {
      return axis === "x" ? 0.24 : 0.1;
    }
    if (state.lens === "orphans") {
      return orphanIds.has(node.id) ? 0.18 : axis === "x" ? 0.08 : 0.07;
    }
    if (state.lens === "clusters") {
      return 0.14;
    }
    if (state.lens === "signal") {
      return 0.12;
    }
    if (state.lens === "local") {
      return state.highlightedIds.has(node.id) ? 0.18 : 0.08;
    }
    return 0.1;
  }

  function linkDistanceForLayout(edge) {
    const sourceId = typeof edge.source === "object" ? edge.source.id : edge.sourceId || edge.source;
    const targetId = typeof edge.target === "object" ? edge.target.id : edge.targetId || edge.target;
    const source = state.nodeById.get(sourceId);
    const target = state.nodeById.get(targetId);
    let distance = edgeStyle(edge).distance || CONFIG.linkDistance;

    if (source && target) {
      if (source.type === target.type) {
        distance *= 0.72;
      } else {
        distance *= 1.38;
      }
      if (source.type === "story" && target.type === "story") {
        distance *= 0.84;
      }
      if (source.type === "year" || target.type === "year") {
        distance *= 1.18;
      }
      if (state.lens === "chronological") {
        const delta = Math.abs(monthIndexForNode(source) - monthIndexForNode(target));
        distance += Math.min(120, delta * 3);
      }
      if (state.lens === "local" && state.selectedId) {
        const touchesSelection = source.id === state.selectedId || target.id === state.selectedId;
        distance *= touchesSelection ? 0.8 : 1.08;
      }
    }

    return distance / Math.log((edge.weight || 1) + 1.2);
  }

  function linkStrengthForLayout(edge) {
    const sourceId = typeof edge.source === "object" ? edge.source.id : edge.sourceId || edge.source;
    const targetId = typeof edge.target === "object" ? edge.target.id : edge.targetId || edge.target;
    const source = state.nodeById.get(sourceId);
    const target = state.nodeById.get(targetId);
    let strength = edgeStyle(edge).strength + Math.min((edge.weight || 1) * 0.04, 0.18);

    if (source && target) {
      if (source.type === target.type) {
        strength += 0.06;
      } else {
        strength -= 0.03;
      }
      if (state.lens === "chronological" && source.type !== target.type) {
        strength -= 0.02;
      }
    }

    return Math.max(0.04, strength);
  }

  function nodeRadius(node) {
    const degree = state.linksByNode.get(node.id)?.length || 0;
    return Math.min(CONFIG.nodeBaseRadius + Math.sqrt(degree) * 3.5, CONFIG.nodeMaxRadius);
  }

  function buildIndexes(nodes, edges) {
    state.nodeById = new Map(nodes.map((node) => [node.id, node]));
    state.linksByNode = new Map(nodes.map((node) => [node.id, []]));

    edges.forEach((edge) => {
      const sourceId = typeof edge.source === "object" ? edge.source.id : edge.source;
      const targetId = typeof edge.target === "object" ? edge.target.id : edge.target;
      edge.sourceId = sourceId;
      edge.targetId = targetId;
      edge.filterKind = edgeKind(edge);
      const sourceNode = state.nodeById.get(sourceId);
      const targetNode = state.nodeById.get(targetId);
      if (!sourceNode || !targetNode) {
        return;
      }
      state.linksByNode.get(sourceId)?.push(edge);
      state.linksByNode.get(targetId)?.push(edge);
      edge.type = edge.type || `${sourceNode.type || "topic"}_to_${targetNode.type || "topic"}`;
    });

    nodes.forEach((node) => {
      node.type = sanitizeType(node.type || (node.node_type === "story" ? "story" : "topic"));
      node.color = NODE_COLORS[node.type];
      node.degree = state.linksByNode.get(node.id)?.length || 0;
      node.renderRadius = nodeRadius(node);
    });
  }

  function currentViewNodes() {
    const query = state.query.trim().toLowerCase();
    let nodes = state.allNodes.filter((node) => state.activeNodeTypes.has(node.type));
    nodes = nodes.filter((node) => nodeYear(node) <= state.activeYear);

    if (query) {
      nodes = nodes.filter((node) => `${node.label} ${node.subtitle || ""} ${node.description || ""}`.toLowerCase().includes(query));
    }

    if (state.lens === "signal") {
      nodes = nodes.filter((node) => node.importance >= 3 || node.type === "model" || node.heat >= 0.2 || (node.globalDegree || 0) >= 3);
    } else if (state.lens === "local") {
      if (state.selectedId) {
        const neighborIds = new Set([state.selectedId]);
        state.allEdges.forEach((edge) => {
          if (edge.source === state.selectedId || edge.sourceId === state.selectedId) {
            neighborIds.add(edge.targetId || edge.target);
          }
          if (edge.target === state.selectedId || edge.targetId === state.selectedId) {
            neighborIds.add(edge.sourceId || edge.source);
          }
        });
        nodes = nodes.filter((node) => neighborIds.has(node.id));
      }
    }
    return nodes;
  }

  function sortNodes(nodes) {
    const sortMode = state.sortMode;
    const score = (node) => (node.degree || 0) * 2 + (node.importance || 0) * 3 + (node.heat || 0) * 8;
    if (state.lens === "chronological") {
      return [...nodes].sort((left, right) => monthIndexForNode(left) - monthIndexForNode(right) || typeRowIndex(left.type) - typeRowIndex(right.type) || (left.label || "").localeCompare(right.label || ""));
    }
    return [...nodes].sort((left, right) => {
      if (sortMode === "alphabetical") {
        return (left.label || "").localeCompare(right.label || "");
      }
      if (sortMode === "newest") {
        return nodeYear(right) - nodeYear(left) || score(right) - score(left);
      }
      if (sortMode === "oldest") {
        return nodeYear(left) - nodeYear(right) || score(right) - score(left);
      }
      if (sortMode === "connected") {
        return (right.degree || right.globalDegree || 0) - (left.degree || left.globalDegree || 0) || score(right) - score(left);
      }
      return score(right) - score(left) || (right.degree || right.globalDegree || 0) - (left.degree || left.globalDegree || 0);
    });
  }

  function applyFilters() {
    window.__AISIGNALGRAPH_DEBUG = { stage: "applyFilters:start" };
    state.query = refs.search.value || "";
    state.lens = refs.lens.value || "global";
    state.sortMode = refs.sort.value || "signal";
    state.activeYear = Number.parseInt(refs.yearFilter.value, 10) || state.maxYear;

    let nodes = currentViewNodes();
    const visibleIds = new Set(nodes.map((node) => node.id));
    let edges = state.allEdges.filter((edge) => {
      const sourceId = edge.sourceId || edge.source;
      const targetId = edge.targetId || edge.target;
      const timelineYear = Number.parseInt((edge.timeline_month || "").slice(0, 4), 10) || state.maxYear;
      return visibleIds.has(sourceId) && visibleIds.has(targetId) && state.activeEdgeKinds.has(edgeKind(edge)) && timelineYear <= state.activeYear;
    });

    buildIndexes(nodes, edges);
    nodes = sortNodes(nodes);
    seedNodePositions(nodes);
    state.nodes = nodes;
    state.edges = edges;

    if (state.selectedId && !state.nodeById.has(state.selectedId)) {
      clearSelection();
    } else if (state.selectedId) {
      updateSelectionState(state.selectedId);
    }

    refs.yearValue.textContent = String(state.activeYear);
    updateStats();
    updateGraphLayers();
    rebuildSimulation();
    if (state.is3DMode) {
      update3DGraph();
    }
    window.__AISIGNALGRAPH_DEBUG = { stage: "applyFilters:done", nodes: state.nodes.length, edges: state.edges.length };
    writeDebug();
  }

  function updateStats() {
    refs.statNodes.textContent = String(state.nodes.length);
    refs.statEdges.textContent = String(state.edges.length);
    refs.statSignals.textContent = String(state.activeSignals.length);
  }

  function isCompactViewport() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function syncPanelButtons() {
    if (refs.filtersToggle) {
      refs.filtersToggle.setAttribute("aria-expanded", refs.hudLeft.classList.contains("is-open") ? "true" : "false");
    }
    if (refs.inspectorToggle) {
      refs.inspectorToggle.setAttribute("aria-expanded", refs.hudRight.classList.contains("is-open") ? "true" : "false");
    }
  }

  function setPanelState(panelName, isOpen) {
    const panel = panelName === "left" ? refs.hudLeft : refs.hudRight;
    if (!panel) {
      return;
    }

    if (isOpen && isCompactViewport()) {
      const opposite = panelName === "left" ? refs.hudRight : refs.hudLeft;
      opposite?.classList.remove("is-open");
    }

    panel.classList.toggle("is-open", isOpen);
    syncPanelButtons();
  }

  function syncResponsivePanels() {
    if (isCompactViewport()) {
      refs.hudLeft.classList.remove("is-open");
      if (!state.selectedId) {
        refs.hudRight.classList.remove("is-open");
      }
    } else {
      refs.hudLeft.classList.add("is-open");
      if (!state.selectedId) {
        refs.hudRight.classList.remove("is-open");
      }
    }
    syncPanelButtons();
  }

  function buildZoom(root) {
    return d3.zoom()
      .scaleExtent([0.05, 8])
      .on("zoom", (event) => {
        state.currentTransform = event.transform;
        root.attr("transform", event.transform);
        drawNodesCanvas();
        drawSignalsCanvas();
      });
  }

  function buildDrag() {
    return d3.drag()
      .on("start", (event, node) => {
        if (!event.active && state.simulation) {
          state.simulation.alphaTarget(0.3).restart();
        }
        node.fx = node.x;
        node.fy = node.y;
      })
      .on("drag", (event, node) => {
        node.fx = event.x;
        node.fy = event.y;
      })
      .on("end", (event, node) => {
        if (!event.active && state.simulation) {
          state.simulation.alphaTarget(0);
        }
        node.fx = null;
        node.fy = null;
      });
  }

  function setupSVG() {
    const svgNode = refs.svg.node();
    const rect = svgNode.getBoundingClientRect();
    state.currentTransform = d3.zoomIdentity;
    refs.svg.attr("viewBox", `0 0 ${Math.max(rect.width, 1)} ${Math.max(rect.height, 1)}`);
    refs.svg.selectAll("*").remove();

    const defs = refs.svg.append("defs");
    const glowFilter = defs.append("filter").attr("id", "glow");
    glowFilter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "blur");
    const merge = glowFilter.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    state.root = refs.svg.append("g").attr("id", "graph-root");
    state.edgeLayer = state.root.append("g").attr("id", "edges-layer");
    state.rippleLayer = state.root.append("g").attr("id", "ripple-layer");
    state.hitLayer = state.root.append("g").attr("id", "nodes-layer");

    state.zoomBehavior = buildZoom(state.root);
    refs.svg.call(state.zoomBehavior);
  }

  function updateGraphLayers() {
    const nodeJoin = state.hitLayer.selectAll("g.graph-node").data(state.nodes, (d) => d.id);
    nodeJoin.exit().remove();

    const nodeEnter = nodeJoin.enter()
      .append("g")
      .attr("class", "graph-node")
      .attr("id", (d) => `node-${d.id}`)
      .call(buildDrag())
      .on("click", (_event, d) => onNodeClick(d))
      .on("mouseenter", (_event, d) => onNodeHover(d))
      .on("mouseleave", () => onNodeLeave());

    nodeEnter.append("circle")
      .attr("class", "graph-node-hit")
      .attr("fill", "transparent")
      .attr("stroke", "transparent")
      .style("pointer-events", "all");

    nodeEnter.append("text")
      .attr("class", "graph-node-label")
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("font-family", "var(--font-mono)")
      .attr("fill", "rgba(241,245,249,0.7)")
      .style("pointer-events", "none");

    state.nodeSelection = nodeEnter.merge(nodeJoin);
    state.nodeSelection.select("circle").attr("r", (d) => d.renderRadius + 10);
    state.nodeSelection.select("text")
      .text((d) => (d.label || "").slice(0, 22))
      .attr("dy", (d) => -(d.renderRadius + 12));

    const edgeJoin = state.edgeLayer.selectAll("line.graph-edge").data(state.edges, (d) => `${d.sourceId || d.source}->${d.targetId || d.target}:${d.kind}`);
    edgeJoin.exit().remove();
    const edgeEnter = edgeJoin.enter().append("line").attr("class", "graph-edge");
    state.edgeSelection = edgeEnter.merge(edgeJoin);

    applySelectionVisuals();
  }

  function rebuildSimulation() {
    window.__AISIGNALGRAPH_DEBUG = { stage: "rebuildSimulation:start", nodes: state.nodes.length, edges: state.edges.length };
    if (state.simulation) {
      state.simulation.stop();
    }

    const svgNode = refs.svg.node();
    const rect = svgNode.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    const { targets, orphanIds } = buildLayoutTargets(width, height);
    const ringRadius = Math.min(width, height) * 0.42;

    state.simulation = d3.forceSimulation(state.nodes)
      .force("link", d3.forceLink(state.edges)
        .id((d) => d.id)
        .distance(linkDistanceForLayout)
        .strength(linkStrengthForLayout))
      .force("charge", d3.forceManyBody()
        .strength((d) => {
          const degree = state.linksByNode.get(d.id)?.length || 0;
          let base = CONFIG.chargeStrength - degree * 16;
          if (state.lens === "chronological") {
            base -= 18;
          }
          if (orphanIds.has(d.id)) {
            base -= 24;
          }
          return base;
        })
        .theta(0.9)
        .distanceMax(state.lens === "orphans" ? 760 : 640))
      .force("x", d3.forceX((d) => targets.get(d.id)?.x ?? width / 2)
        .strength((d) => layoutStrength(d, "x", orphanIds)))
      .force("y", d3.forceY((d) => targets.get(d.id)?.y ?? height / 2)
        .strength((d) => layoutStrength(d, "y", orphanIds)))
      .force("radial", state.lens === "orphans"
        ? d3.forceRadial((d) => (orphanIds.has(d.id) ? ringRadius : Math.min(width, height) * 0.16), width / 2, height / 2)
          .strength((d) => (orphanIds.has(d.id) ? 0.12 : 0.03))
        : null)
      .force("collide", d3.forceCollide()
        .radius((d) => d.renderRadius + 8)
        .strength(0.85)
        .iterations(state.nodes.length > 500 ? 1 : 2))
      .alphaDecay(CONFIG.alphaDecay)
      .alphaMin(CONFIG.alphaMin)
      .velocityDecay(CONFIG.velocityDecay)
      .on("tick", renderTick);

    const warmupTicks = state.nodes.length > 500 ? 32 : 20;
    for (let index = 0; index < warmupTicks; index += 1) {
      state.simulation.tick();
    }
    renderTick();

    if (state.initialFitPending) {
      window.setTimeout(() => {
        zoomToFitAll();
        state.initialFitPending = false;
        writeDebug({ stage: "initialFit:done" });
      }, 700);
    }
    if (state.is3DMode) {
      state.simulation.stop();
    }
    window.__AISIGNALGRAPH_DEBUG = { stage: "rebuildSimulation:done" };
    writeDebug();
  }

  function renderTick() {
    window.__AISIGNALGRAPH_DEBUG.tickCount = (window.__AISIGNALGRAPH_DEBUG.tickCount || 0) + 1;
    if (!state.edgeSelection || !state.nodeSelection) {
      return;
    }
    
    // Auto-pause simulation to save CPU when settled
    if (state.simulation && state.simulation.alpha() < 0.05 && !state.isPaused) {
      state.simulation.stop();
    }
    state.edgeSelection
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    state.nodeSelection.attr("transform", (d) => `translate(${d.x},${d.y})`);

    const zoomLevel = state.currentTransform.k || 1;
    state.nodeSelection.select("text")
      .attr("opacity", (d) => {
        if (d.id === state.selectedId || state.highlightedIds.has(d.id)) {
          return 0.96;
        }
        if (zoomLevel > 1.8 || d.degree >= 18 || d.type === "model") {
          return 0.72;
        }
        return 0;
      });

    drawNodesCanvas();
    applySelectionVisuals();
    if (debugMode && window.__AISIGNALGRAPH_DEBUG.tickCount % 12 === 0) {
      writeDebug({ stage: "renderTick" });
    }
  }

  function drawNodesCanvas() {
    const rect = syncCanvasSize(refs.nodeCanvas, nodeCtx);
    nodeCtx.clearRect(0, 0, rect.width, rect.height);
    nodeCtx.save();
    nodeCtx.translate(state.currentTransform.x, state.currentTransform.y);
    nodeCtx.scale(state.currentTransform.k, state.currentTransform.k);

    const nodes = [...state.nodes].sort((left, right) => left.renderRadius - right.renderRadius);
    for (const node of nodes) {
      const attentionScore = state.attention[node.id] || 0;
      const highlighted = !state.highlightedIds.size || state.highlightedIds.has(node.id);
      const alpha = highlighted ? 0.9 : 0.2;
      const flash = node.flashUntil && node.flashUntil > performance.now() ? 1 : 0;
      const outerGlow = 10 + attentionScore * 20 + flash * 18;

      nodeCtx.save();
      nodeCtx.globalAlpha = alpha;
      nodeCtx.shadowColor = node.color;
      nodeCtx.shadowBlur = outerGlow;
      nodeCtx.beginPath();
      nodeCtx.arc(node.x, node.y, node.renderRadius, 0, Math.PI * 2);
      nodeCtx.fillStyle = node.color;
      nodeCtx.fill();
      nodeCtx.restore();

      nodeCtx.beginPath();
      nodeCtx.arc(node.x, node.y, node.renderRadius, 0, Math.PI * 2);
      nodeCtx.fillStyle = hexToRgba(node.color, alpha * (node.type === "story" ? 0.72 : 0.82));
      nodeCtx.fill();

      if (node.id === state.selectedId) {
        nodeCtx.beginPath();
        nodeCtx.arc(node.x, node.y, node.renderRadius + 6, 0, Math.PI * 2);
        nodeCtx.strokeStyle = hexToRgba(node.color, 0.96);
        nodeCtx.lineWidth = 2;
        nodeCtx.stroke();
      }
    }

    nodeCtx.restore();
  }

  function drawSignalsCanvas() {
    const rect = syncCanvasSize(refs.signalCanvas, signalCtx);
    signalCtx.clearRect(0, 0, rect.width, rect.height);
    signalCtx.save();
    signalCtx.translate(state.currentTransform.x, state.currentTransform.y);
    signalCtx.scale(state.currentTransform.k, state.currentTransform.k);
    state.activeSignals.forEach((signal) => signal.draw(signalCtx));
    signalCtx.restore();
  }

  function animate() {
    updateAttention();
    if (!state.isPaused) {
      state.activeSignals.forEach((signal) => signal.update());
      state.activeSignals = state.activeSignals.filter((signal) => signal.alive);
    }
    updateStats();
    drawNodesCanvas();
    drawSignalsCanvas();
    window.requestAnimationFrame(animate);
  }

  function activateNode(node) {
    node.flashUntil = performance.now() + 420;
    state.attention[node.id] = Math.min(1, (state.attention[node.id] || 0) + 0.28);
    const ripple = state.rippleLayer.append("circle")
      .attr("cx", node.x)
      .attr("cy", node.y)
      .attr("r", node.renderRadius)
      .attr("fill", "none")
      .attr("stroke", node.color)
      .attr("stroke-width", 2)
      .attr("class", "node-ripple");
    window.setTimeout(() => ripple.remove(), 1200);
  }

  function updateAttention() {
    Object.keys(state.attention).forEach((id) => {
      state.attention[id] *= CONFIG.attentionDecay;
      if (state.attention[id] < 0.01) {
        delete state.attention[id];
      }
    });
    state.activeSignals.forEach((signal) => {
      state.attention[signal.source.id] = Math.min(1, (state.attention[signal.source.id] || 0) + 0.15);
      state.attention[signal.target.id] = Math.min(1, (state.attention[signal.target.id] || 0) + 0.08);
    });
  }

  function weightedRandomEdge(edges) {
    if (!edges.length) {
      return null;
    }
    const totalWeight = edges.reduce((sum, edge) => sum + (edge.weight || 1), 0);
    let random = Math.random() * totalWeight;
    for (const edge of edges) {
      random -= edge.weight || 1;
      if (random <= 0) {
        return edge;
      }
    }
    return edges[edges.length - 1];
  }

  function scheduleSignals() {
    window.clearTimeout(state.signalTimer);
    const tick = () => {
      if (!state.isPaused) {
        const edge = weightedRandomEdge(state.edges);
        if (edge && state.activeSignals.length < CONFIG.maxSignals) {
          const sourceId = typeof edge.source === "object" ? edge.source.id : edge.sourceId || edge.source;
          const targetId = typeof edge.target === "object" ? edge.target.id : edge.targetId || edge.target;
          const source = state.nodeById.get(sourceId);
          const target = state.nodeById.get(targetId);
          if (source && target) {
            state.activeSignals.push(new SignalPulse(source, target, edgeKind(edge)));
          }
        } else if (state.activeSignals.length >= CONFIG.maxSignals) {
          state.activeSignals.shift();
        }
      }
      const nextDelay = -Math.log(1 - Math.random()) * CONFIG.signalSpawnRate / Math.max(state.signalSpeed, 0.25);
      state.signalTimer = window.setTimeout(tick, nextDelay);
    };
    tick();
  }

  function updateSelectionState(nodeId) {
    state.selectedId = nodeId;
    const related = new Set([nodeId]);
    state.edges.forEach((edge) => {
      const sourceId = typeof edge.source === "object" ? edge.source.id : edge.sourceId || edge.source;
      const targetId = typeof edge.target === "object" ? edge.target.id : edge.targetId || edge.target;
      if (sourceId === nodeId) {
        related.add(targetId);
      }
      if (targetId === nodeId) {
        related.add(sourceId);
      }
    });
    state.highlightedIds = related;
    applySelectionVisuals();
  }

  function clearSelection() {
    state.selectedId = null;
    state.highlightedIds = new Set();
    setPanelState("right", false);
    refs.detailBadge.textContent = "Graph";
    refs.detailTitle.textContent = "AI Signal Graph";
    refs.detailSubtitle.textContent = "Select a node to inspect it.";
    refs.detailCopy.textContent = "The graph combines stories, labs, models, people, and risks into one animated field.";
    refs.detailMeta.innerHTML = "";
    refs.detailTags.innerHTML = "";
    refs.detailEntities.innerHTML = "";
    refs.detailRelated.innerHTML = "";
    refs.detailLink.href = "/stories";
    applySelectionVisuals();
  }

  function applySelectionVisuals() {
    if (!state.edgeSelection || !state.nodeSelection) {
      return;
    }
    state.edgeSelection
      .attr("stroke", (edge) => edgeStyle(edge).color)
      .attr("stroke-width", (edge) => 0.5 + (edge.weight || 1) * 0.3)
      .attr("stroke-dasharray", (edge) => edgeStyle(edge).dash || null)
      .attr("stroke-opacity", (edge) => {
        if (!state.highlightedIds.size) {
          return edge.kind === "context" ? 0.18 : 0.38;
        }
        const sourceId = typeof edge.source === "object" ? edge.source.id : edge.sourceId || edge.source;
        const targetId = typeof edge.target === "object" ? edge.target.id : edge.targetId || edge.target;
        return state.highlightedIds.has(sourceId) && state.highlightedIds.has(targetId) ? 0.82 : 0.08;
      });

    state.nodeSelection.select("circle")
      .attr("stroke", (d) => d.id === state.selectedId ? hexToRgba(d.color, 0.94) : "transparent")
      .attr("stroke-width", (d) => (d.id === state.selectedId ? 1.6 : 0));

    state.nodeSelection.select("text")
      .attr("fill", (d) => (!state.highlightedIds.size || state.highlightedIds.has(d.id) ? "rgba(241,245,249,0.8)" : "rgba(241,245,249,0.2)"));

    drawNodesCanvas();
  }

  function renderEntityPanel(node) {
    refs.detailBadge.textContent = (node.type || "node").toUpperCase();
    refs.detailTitle.textContent = node.label;
    refs.detailSubtitle.textContent = node.subtitle || "";
    refs.detailCopy.textContent = node.description || "";
    refs.detailMeta.innerHTML = `
      <div><span class="label">Type</span><div>${node.type}</div></div>
      <div><span class="label">Connections</span><div>${node.degree || 0}</div></div>
      <div><span class="label">Stories</span><div>${node.story_count || 0}</div></div>
    `;
    refs.detailTags.innerHTML = `
      <span class="hud-badge" style="border-color:${hexToRgba(node.color, 0.35)}; color:${node.color};">${node.group || node.type}</span>
    `;
    refs.detailEntities.innerHTML = "";
    refs.detailRelated.innerHTML = "";
    const related = state.edges
      .filter((edge) => (edge.sourceId || edge.source.id || edge.source) === node.id || (edge.targetId || edge.target.id || edge.target) === node.id)
      .slice(0, 8)
      .map((edge) => {
        const otherId = (edge.sourceId || edge.source.id || edge.source) === node.id ? (edge.targetId || edge.target.id || edge.target) : (edge.sourceId || edge.source.id || edge.source);
        return state.nodeById.get(otherId);
      })
      .filter(Boolean);

    if (related.length) {
      refs.detailRelated.innerHTML = `<div class="label">Connected nodes</div>${related.map((item) => `<a href="#" data-node-id="${item.id}">${item.label}</a>`).join("")}`;
      refs.detailRelated.querySelectorAll("[data-node-id]").forEach((link) => {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          const next = state.nodeById.get(link.dataset.nodeId);
          if (next) {
            onNodeClick(next);
          }
        });
      });
    } else {
      refs.detailRelated.innerHTML = `<div class="graph-empty">No connected nodes in the current view.</div>`;
    }

    refs.detailLink.href = node.route || "/entities";
    refs.detailLink.textContent = "OPEN RECORD";
    if (isCompactViewport()) {
      setPanelState("left", false);
    }
    setPanelState("right", true);
  }

  async function renderStoryPanel(node) {
    const storyId = storyIdFromNodeId(node.id);
    const response = await fetch(`/api/story/${storyId}`, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      renderEntityPanel(node);
      return;
    }
    const story = await response.json();
    refs.detailBadge.textContent = "STORY";
    refs.detailTitle.textContent = story.title;
    refs.detailSubtitle.textContent = `${story.kind} | ${story.event_date}`;
    refs.detailCopy.innerHTML = story.content_html || `<p>${story.summary}</p>`;
    refs.detailMeta.innerHTML = `
      <div><span class="label">Year</span><div>${story.year || "—"}</div></div>
      <div><span class="label">Status</span><div>${story.status}</div></div>
      <div><span class="label">Entities</span><div>${story.entities.length}</div></div>
    `;
    refs.detailTags.innerHTML = (story.tags || []).map((tag) => `<span class="hud-badge">${tag}</span>`).join("");
    refs.detailEntities.innerHTML = (story.entities || []).map((entity) => {
      const type = sanitizeType(entity.type || entity.entity_type || "topic");
      return `<span class="hud-badge" style="border-color:${hexToRgba(NODE_COLORS[type], 0.34)}; color:${NODE_COLORS[type]};">${entity.name}</span>`;
    }).join("");
    refs.detailRelated.innerHTML = (story.related_stories || []).length
      ? `<div class="label">Related stories</div>${story.related_stories.map((item) => `<a href="/stories/${item.id}">${item.title}</a>`).join("")}`
      : `<div class="graph-empty">No related stories in the current source.</div>`;
    refs.detailLink.href = story.route;
    refs.detailLink.textContent = "OPEN STORY";
    if (isCompactViewport()) {
      setPanelState("left", false);
    }
    setPanelState("right", true);
  }

  function onNodeClick(node) {
    updateSelectionState(node.id);
    if (state.lens === "local") {
      applyFilters();
    }
    const nextNode = state.nodeById.get(node.id) || node;
    if (nextNode.type === "story") {
      renderStoryPanel(nextNode).catch(() => renderEntityPanel(nextNode));
      return;
    }
    renderEntityPanel(nextNode);
  }

  function onNodeHover(node) {
    state.attention[node.id] = Math.min(1, (state.attention[node.id] || 0) + 0.12);
    drawNodesCanvas();
  }

  function onNodeLeave() {
    drawNodesCanvas();
  }

  function zoomToFitAll() {
    if (!state.nodes.length) {
      return;
    }
    const bounds = {
      minX: Math.min(...state.nodes.map((node) => node.x - node.renderRadius)),
      maxX: Math.max(...state.nodes.map((node) => node.x + node.renderRadius)),
      minY: Math.min(...state.nodes.map((node) => node.y - node.renderRadius)),
      maxY: Math.max(...state.nodes.map((node) => node.y + node.renderRadius)),
    };
    const rect = refs.svg.node().getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    const fullW = bounds.maxX - bounds.minX + 160;
    const fullH = bounds.maxY - bounds.minY + 160;
    const scale = Math.min(width / fullW, height / fullH, 1);
    const tx = (width - scale * (bounds.minX + bounds.maxX)) / 2;
    const ty = (height - scale * (bounds.minY + bounds.maxY)) / 2;
    refs.svg.transition().duration(800).call(
      state.zoomBehavior.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }

  async function rebuildGraph() {
    refs.rebuildButton.disabled = true;
    refs.rebuildButton.textContent = "… REBUILDING";
    try {
      const response = await fetch("/api/rebuild", {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrfToken,
          Accept: "text/event-stream",
        },
      });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((item) => item.startsWith("data: "));
          if (!line) {
            continue;
          }
          const payload = JSON.parse(line.slice(6));
          if (payload.status === "done") {
            refs.rebuildButton.textContent = "✓ REBUILT";
            await loadGraph();
          } else if (payload.status === "error") {
            refs.rebuildButton.textContent = "⚠ REBUILD FAILED";
          } else if (payload.status === "busy") {
            refs.rebuildButton.textContent = "… BUSY";
          }
        }
      }
    } catch (_error) {
      refs.rebuildButton.textContent = "⚠ REBUILD FAILED";
    } finally {
      window.setTimeout(() => {
        refs.rebuildButton.disabled = false;
        refs.rebuildButton.textContent = "⟳ REBUILD";
      }, 1500);
    }
  }

  function toggleSimulation() {
    state.isPaused = !state.isPaused;
    if (state.isPaused) {
      state.simulation?.stop();
      state.threeGraph?.pauseAnimation?.();
      refs.simulationToggle.textContent = "▶ RESUME";
    } else {
      if (!state.is3DMode) {
        state.simulation?.alpha(0.18).restart();
      }
      state.threeGraph?.resumeAnimation?.();
      refs.simulationToggle.textContent = "⏸ PAUSE";
    }
  }

  function resizeLayers() {
    const rect = refs.svg.node().getBoundingClientRect();
    refs.svg.attr("viewBox", `0 0 ${Math.max(rect.width, 1)} ${Math.max(rect.height, 1)}`);
    drawNodesCanvas();
    drawSignalsCanvas();
    state.threeGraph?.width(window.innerWidth).height(window.innerHeight);
    syncResponsivePanels();
    writeDebug({ stage: "resize" });
  }

  function setupFilterControls() {
    refs.nodeTypeFilters.innerHTML = Object.entries(NODE_LABELS).map(([type, label]) => `
      <label class="hud-check">
        <input type="checkbox" value="${type}" checked>
        <span style="color:${NODE_COLORS[type]};">${label}</span>
      </label>
    `).join("");
    refs.nodeTypeFilters.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) {
          state.activeNodeTypes.add(input.value);
        } else {
          state.activeNodeTypes.delete(input.value);
        }
        applyFilters();
      });
    });

    const edgeKinds = ["mentions", "context", "related"];
    refs.edgeTypeFilters.innerHTML = edgeKinds.map((kind) => `
      <label class="hud-check">
        <input type="checkbox" value="${kind}" checked>
        <span>${displayKind(kind)}</span>
      </label>
    `).join("");
    refs.edgeTypeFilters.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) {
          state.activeEdgeKinds.add(input.value);
        } else {
          state.activeEdgeKinds.delete(input.value);
        }
        applyFilters();
      });
    });
  }

  function bindUI() {
    refs.search.addEventListener("input", applyFilters);
    refs.lens.addEventListener("change", applyFilters);
    refs.sort.addEventListener("change", applyFilters);
    refs.yearFilter.addEventListener("input", applyFilters);
    refs.signalSpeed.addEventListener("input", () => {
      state.signalSpeed = Number.parseFloat(refs.signalSpeed.value) || 1;
      refs.signalSpeedValue.textContent = `${state.signalSpeed.toFixed(1)}x`;
    });
    refs.rebuildButton.addEventListener("click", rebuildGraph);
    refs.simulationToggle.addEventListener("click", toggleSimulation);
    refs.fitButton.addEventListener("click", zoomToFitAll);
    refs.mode3dToggle?.addEventListener("click", () => {
      set3DMode(!state.is3DMode);
    });
    refs.detailClose.addEventListener("click", clearSelection);
    refs.filtersToggle?.addEventListener("click", () => {
      setPanelState("left", !refs.hudLeft.classList.contains("is-open"));
    });
    refs.inspectorToggle?.addEventListener("click", () => {
      setPanelState("right", !refs.hudRight.classList.contains("is-open"));
    });
    window.addEventListener("resize", resizeLayers);
  }

  async function loadGraph() {
    window.__AISIGNALGRAPH_DEBUG = { stage: "loadGraph:start" };
    const response = await fetch("/api/graph", { headers: { Accept: "application/json" } });
    const payload = await response.json();
    state.allNodes = payload.nodes.map((node) => ({
      ...node,
      type: sanitizeType(node.type || "topic"),
      color: NODE_COLORS[sanitizeType(node.type || "topic")],
    }));
    state.allEdges = payload.edges.map((edge, index) => ({
      ...edge,
      sourceId: edge.source,
      targetId: edge.target,
      id: `${edge.source}->${edge.target}:${index}`,
    }));

    const globalDegree = new Map();
    state.allEdges.forEach((edge) => {
      globalDegree.set(edge.sourceId, (globalDegree.get(edge.sourceId) || 0) + 1);
      globalDegree.set(edge.targetId, (globalDegree.get(edge.targetId) || 0) + 1);
    });
    state.allNodes.forEach((node) => {
      node.globalDegree = globalDegree.get(node.id) || 0;
    });

    const startYear = Number.parseInt((payload.timeline?.start || "2020").slice(0, 4), 10) || 2020;
    const endYear = Number.parseInt((payload.timeline?.end || "2026").slice(0, 4), 10) || 2026;
    state.minYear = startYear;
    state.maxYear = endYear;
    state.activeYear = endYear;
    state.monthFloor = monthIndexFromKey(payload.timeline?.start || `${startYear}-01`) || startYear * 12 + 1;
    state.monthCeiling = monthIndexFromKey(payload.timeline?.end || `${endYear}-12`) || endYear * 12 + 12;

    refs.yearFilter.min = String(startYear);
    refs.yearFilter.max = String(endYear);
    refs.yearFilter.value = String(endYear);
    refs.yearValue.textContent = String(endYear);

    setupSVG();
    applyFilters();
    window.__AISIGNALGRAPH_DEBUG = { stage: "loadGraph:done", nodes: state.allNodes.length, edges: state.allEdges.length };
    writeDebug();
  }

  window.addEventListener("error", (event) => {
    fail(event.error || event.message, "window:error");
  });

  // Quality of Life Keyboard Shortcuts
  document.addEventListener("keydown", (event) => {
    if (event.target.tagName === "INPUT" || event.target.tagName === "SELECT") return;
    if (event.code === "Space") {
      event.preventDefault();
      toggleSimulation();
    } else if (event.code === "KeyF") {
      zoomToFitAll();
    } else if (event.code === "Escape") {
      clearSelection();
    }
  });

  setupFilterControls();
  bindUI();
  syncResponsivePanels();
  loadGraph().then(() => {
    scheduleSignals();
    animate();
    window.__AISIGNALGRAPH_DEBUG = { stage: "animate:started", nodes: state.nodes.length, edges: state.edges.length };
  }).catch((error) => {
    fail(error || "The graph failed to load.", "loadGraph:catch");
  });

  window.rebuildGraph = rebuildGraph;
  window.toggleSimulation = toggleSimulation;
  window.zoomToFit = zoomToFitAll;

  function build3DGraphData() {
    const nodes = state.nodes.map((node) => ({
      id: node.id,
      name: node.label,
      val: Math.max(4, node.renderRadius),
      color: node.color,
      type: node.type,
      level: node.type === "year" ? 0 : node.type === "story" ? 1 : 2,
    }));
    const links = [];
    const seen = new Set();

    const addLink = (source, target, color) => {
      const key = `${source}->${target}`;
      if (seen.has(key) || source === target) {
        return;
      }
      seen.add(key);
      links.push({ source, target, color });
    };

    state.nodes.forEach((node) => {
      if (node.type !== "story" || !node.year) {
        return;
      }
      const yearId = `entity:year-${node.year}`;
      if (state.nodeById.has(yearId)) {
        addLink(yearId, node.id, NODE_COLORS.year);
      }
    });

    state.edges.forEach((edge) => {
      const sourceId = edge.sourceId || edge.source;
      const targetId = edge.targetId || edge.target;
      const source = state.nodeById.get(sourceId);
      const target = state.nodeById.get(targetId);
      if (!source || !target) {
        return;
      }

      if (edge.kind === "mentions" && (source.type === "story" || target.type === "story")) {
        addLink(sourceId, targetId, edgeStyle(edge).color);
        return;
      }

      if (edge.kind === "context" && source.type === "story" && target.type === "story") {
        const ordered = monthIndexForNode(source) <= monthIndexForNode(target)
          ? [sourceId, targetId]
          : [targetId, sourceId];
        addLink(ordered[0], ordered[1], edgeStyle(edge).color);
      }
    });

    return { nodes, links };
  }

  function ensure3DGraph() {
    if (state.threeGraph || typeof ForceGraph3D === "undefined") {
      return state.threeGraph;
    }

    state.threeGraph = ForceGraph3D()(refs.container3d)
      .width(window.innerWidth)
      .height(window.innerHeight)
      .nodeLabel("name")
      .nodeColor("color")
      .nodeRelSize(5)
      .linkColor("color")
      .linkOpacity(0.28)
      .linkWidth(0.7)
      .backgroundColor("#050505")
      .onNodeClick((node) => {
        const originalNode = state.nodeById.get(node.id);
        if (originalNode) {
          onNodeClick(originalNode);
        }
      });

    return state.threeGraph;
  }

  function update3DGraph() {
    const graph3D = ensure3DGraph();
    if (!graph3D) {
      return;
    }

    const graphData = build3DGraphData();
    graph3D
      .dagMode(state.lens === "chronological" ? "td" : "radialout")
      .dagLevelDistance(state.lens === "chronological" ? 160 : 220)
      .graphData(graphData);

    graph3D.d3Force("charge").strength(-120);
    graph3D.d3Force("collide", d3.forceCollide((node) => (node.val || 4) + 2));
    graph3D.d3ReheatSimulation();
  }

  function set3DMode(nextValue) {
    state.is3DMode = Boolean(nextValue);
    refs.mode3dToggle?.classList.toggle("is-active", state.is3DMode);
    refs.container3d.style.display = state.is3DMode ? "block" : "none";
    refs.svg.node().style.display = state.is3DMode ? "none" : "block";
    refs.nodeCanvas.style.display = state.is3DMode ? "none" : "block";
    refs.signalCanvas.style.display = state.is3DMode ? "none" : "block";

    if (state.is3DMode) {
      refs.svg.interrupt();
      state.simulation?.stop();
      update3DGraph();
      return;
    }

    if (!state.isPaused) {
      state.simulation?.alpha(0.18).restart();
    }
    drawNodesCanvas();
    drawSignalsCanvas();
  }
})();
