function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const normalized = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  const parsed = Number.parseInt(normalized, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function mixColor(a, b, amount) {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  const t = clamp(amount, 0, 1);
  const r = Math.round(left.r + (right.r - left.r) * t);
  const g = Math.round(left.g + (right.g - left.g) * t);
  const bChannel = Math.round(left.b + (right.b - left.b) * t);
  return `rgb(${r}, ${g}, ${bChannel})`;
}

const BLUE_GROUPS = new Set(["model", "year", "timeline", "model-release"]);
const PINK_GROUPS = new Set(["risk", "policy", "people", "impact"]);
const PURPLE_GROUPS = new Set(["keyword", "agents", "strategy", "analysis"]);
const RED_GROUPS = new Set(["company", "business", "infrastructure", "collapse"]);
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function themeForNode(node) {
  const group = node.group || "";

  if (node.emphasis === "model") {
    return {
      base: "#82a8ff",
      accent: "#f8fbff",
      halo: "rgba(130, 168, 255, 0.14)",
      edge: "rgba(102, 136, 255, 0.92)",
    };
  }

  if ((node.degree || 0) <= 1 || group === "year" || BLUE_GROUPS.has(group)) {
    return {
      base: "#4f7fff",
      accent: "#cdddff",
      halo: "rgba(79, 127, 255, 0.12)",
      edge: "rgba(83, 122, 255, 0.9)",
    };
  }

  if (PINK_GROUPS.has(group)) {
    return {
      base: "#ff7fb1",
      accent: "#ffd6e7",
      halo: "rgba(255, 127, 177, 0.12)",
      edge: "rgba(255, 107, 166, 0.9)",
    };
  }

  if (PURPLE_GROUPS.has(group)) {
    return {
      base: "#9567ff",
      accent: "#e2d5ff",
      halo: "rgba(149, 103, 255, 0.12)",
      edge: "rgba(149, 103, 255, 0.88)",
    };
  }

  if (RED_GROUPS.has(group)) {
    return {
      base: "#d85167",
      accent: "#ffd7de",
      halo: "rgba(216, 81, 103, 0.12)",
      edge: "rgba(216, 81, 103, 0.9)",
    };
  }

  if (node.node_type === "story") {
    return {
      base: "#e1e8f2",
      accent: "#ffffff",
      halo: "rgba(225, 232, 242, 0.08)",
      edge: "rgba(225, 232, 242, 0.7)",
    };
  }

  return {
    base: "#d85167",
    accent: "#ffd7de",
    halo: "rgba(216, 81, 103, 0.12)",
    edge: "rgba(216, 81, 103, 0.9)",
  };
}

function colorForNode(node) {
  const theme = themeForNode(node);
  const heat = clamp(((node.degree || 0) / 18) * 0.5 + (node.heat || 0) * 0.8, 0, 1);
  return mixColor(theme.base, theme.accent, heat * 0.52);
}

function compareTimelineMonth(left, right) {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return left.localeCompare(right);
}

function formatTimelineMonth(monthKey) {
  if (!monthKey) {
    return "Full graph";
  }
  const [year, month] = monthKey.split("-");
  const monthIndex = Number.parseInt(month, 10) - 1;
  return `${MONTH_LABELS[monthIndex] || month} ${year}`;
}

async function refreshOverview() {
  const response = await fetch("/api/overview", { headers: { Accept: "application/json" } });
  if (!response.ok) {
    return;
  }

  const payload = await response.json();
  const stats = payload.stats || {};
  const job = payload.job || {};

  document.querySelectorAll("[data-stat]").forEach((element) => {
    const key = element.dataset.stat;
    if (key in stats) {
      element.textContent = stats[key];
    }
  });

  const pill = document.getElementById("job-state-pill");
  if (pill) {
    pill.textContent = job.status || "idle";
    pill.classList.toggle("is-running", Boolean(job.active));
  }
}

function bootGraph() {
  const canvas = document.getElementById("graph-canvas");
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const graph3dHost = document.getElementById("graph-3d");
  const searchInput = document.getElementById("graph-search");
  const filterInput = document.getElementById("graph-filter");
  const connectionStrengthInput = document.getElementById("connection-strength");
  const connectionStrengthValue = document.getElementById("connection-strength-value");
  const imageToggleButton = document.getElementById("graph-image-toggle");
  const groupFilterButtons = [...document.querySelectorAll("[data-group-filter]")];
  const edgeFilterButtons = [...document.querySelectorAll("[data-edge-filter]")];
  const pinnedOnlyToggle = document.getElementById("pinned-only-toggle");
  const clusterOnlyToggle = document.getElementById("cluster-only-toggle");
  const clearGraphFiltersButton = document.getElementById("clear-graph-filters");
  const timelinePlayToggle = document.getElementById("timeline-play-toggle");
  const timelineFullReset = document.getElementById("timeline-full-reset");
  const timelineRange = document.getElementById("timeline-range");
  const timelineCurrentLabel = document.getElementById("timeline-current-label");
  const timelineSpeed = document.getElementById("timeline-speed");
  const interactionModeButtons = [...document.querySelectorAll("[data-interaction]")];
  const paintBrushSizeInput = document.getElementById("paint-brush-size");
  const paintBrushSizeValue = document.getElementById("paint-brush-size-value");
  const clearBarriersButton = document.getElementById("clear-barriers-button");
  const clearPinsButton = document.getElementById("clear-pins-button");
  const viewModeButtons = [...document.querySelectorAll("[data-mode]")];
  const focusButton = document.getElementById("focus-node-button");
  const pinButton = document.getElementById("pin-node-button");
  const resetButton = document.getElementById("reset-view-button");
  const detailTitle = document.getElementById("detail-title");
  const detailSubtitle = document.getElementById("detail-subtitle");
  const detailDescription = document.getElementById("detail-description");
  const detailType = document.getElementById("detail-type");
  const detailConnections = document.getElementById("detail-connections");
  const detailHeat = document.getElementById("detail-heat");
  const detailLink = document.getElementById("detail-link");
  const detailPanel = document.getElementById("graph-detail");
  const DEFAULT_GROUP_FILTERS = ["stories", "models", "labs", "policy", "agents", "infra"];
  const DEFAULT_EDGE_FILTERS = ["mentions", "context", "co-mentioned"];

  const state = {
    allNodes: [],
    allEdges: [],
    nodes: [],
    edges: [],
    nodeMap: new Map(),
    hoveredId: null,
    selectedId: null,
    dragNodeId: null,
    panOrigin: null,
    transform: { x: canvas.width / 2, y: canvas.height / 2, k: 0.68 },
    time: 0,
    mode: "2d",
    connectionStrength: 1,
    showImages: true,
    pinnedIds: new Set(),
    focusNodeId: null,
    graph3d: null,
    activeGroupFilters: new Set(DEFAULT_GROUP_FILTERS),
    activeEdgeKinds: new Set(DEFAULT_EDGE_FILTERS),
    pinnedOnly: false,
    clusterOnly: false,
    timeline: {
      months: [],
      currentIndex: 0,
      playing: false,
      lastStepAt: 0,
      speedMultiplier: 1,
    },
    interactionMode: "move",
    brushRadius: 120,
    brushPoint: null,
    paintStrokes: [],
    paintStrokeActive: false,
    activePaintStroke: null,
    suppressClick: false,
    dragMoved: false,
  };
  const nodeImageCache = new Map();

  function updateImageToggleUI() {
    if (!imageToggleButton) {
      return;
    }
    imageToggleButton.textContent = state.showImages ? "Images on" : "Images off";
    imageToggleButton.classList.toggle("is-active", state.showImages);
    imageToggleButton.setAttribute("aria-pressed", String(state.showImages));
  }

  function getNodeInitials(label) {
    const words = (label || "")
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .slice(0, 2);
    if (words.length === 0) {
      return "?";
    }
    return words.map((word) => word[0].toUpperCase()).join("");
  }

  function buildNodeImage(node, size = 128) {
    const canvasImage = document.createElement("canvas");
    canvasImage.width = size;
    canvasImage.height = size;
    const imageCtx = canvasImage.getContext("2d");
    const theme = themeForNode(node);
    const label = getNodeInitials(node.label);
    const groupLabel = (node.group || node.node_type || "").slice(0, 10).toUpperCase();

    imageCtx.clearRect(0, 0, size, size);

    const gradient = imageCtx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, mixColor(theme.base, "#ffffff", 0.18));
    gradient.addColorStop(1, mixColor(theme.base, "#05080c", 0.22));

    imageCtx.fillStyle = "#091017";
    imageCtx.beginPath();
    imageCtx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    imageCtx.fill();

    imageCtx.save();
    imageCtx.beginPath();
    imageCtx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
    imageCtx.clip();
    imageCtx.fillStyle = gradient;
    imageCtx.fillRect(size * 0.06, size * 0.06, size * 0.88, size * 0.88);

    imageCtx.fillStyle = "rgba(255,255,255,0.08)";
    imageCtx.fillRect(size * 0.08, size * 0.08, size * 0.84, size * 0.14);
    imageCtx.restore();

    imageCtx.strokeStyle = "rgba(255,255,255,0.18)";
    imageCtx.lineWidth = size * 0.024;
    imageCtx.beginPath();
    imageCtx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
    imageCtx.stroke();

    imageCtx.fillStyle = "#ffffff";
    imageCtx.font = `600 ${Math.round(size * 0.26)}px IBM Plex Sans, sans-serif`;
    imageCtx.textAlign = "center";
    imageCtx.textBaseline = "middle";
    imageCtx.fillText(label, size / 2, size / 2 - size * 0.02);

    imageCtx.fillStyle = "rgba(7, 11, 16, 0.58)";
    imageCtx.beginPath();
    imageCtx.roundRect(size * 0.22, size * 0.72, size * 0.56, size * 0.14, size * 0.07);
    imageCtx.fill();

    imageCtx.fillStyle = "rgba(255,255,255,0.82)";
    imageCtx.font = `500 ${Math.round(size * 0.09)}px IBM Plex Sans, sans-serif`;
    imageCtx.fillText(groupLabel || "NODE", size / 2, size * 0.79);

    return canvasImage;
  }

  function getNodeImage(node) {
    if (nodeImageCache.has(node.id)) {
      return nodeImageCache.get(node.id);
    }
    const image = buildNodeImage(node);
    nodeImageCache.set(node.id, image);
    return image;
  }

  function shouldDrawNodeImage(node, radius, zoom, isHovered, isSelected) {
    if (!state.showImages) {
      return false;
    }
    if (radius < 5.5) {
      return false;
    }
    if (isHovered || isSelected) {
      return true;
    }
    if (node.emphasis === "model") {
      return true;
    }
    if (node.node_type === "entity" && !node.peripheral && zoom > 1.1) {
      return true;
    }
    return false;
  }

  function updateSelectionActions() {
    const selected = state.selectedId ? state.nodeMap.get(state.selectedId) : null;
    const canAct = Boolean(selected);

    if (focusButton) {
      focusButton.disabled = !canAct;
      focusButton.textContent = canAct && state.focusNodeId === selected.id ? "Unfocus" : "Focus";
    }

    if (pinButton) {
      pinButton.disabled = !canAct;
      pinButton.textContent = canAct && state.pinnedIds.has(selected.id) ? "Unpin" : "Pin";
    }

    if (clusterOnlyToggle) {
      const canCluster = Boolean(selected);
      clusterOnlyToggle.disabled = !canCluster;
      clusterOnlyToggle.classList.toggle("is-active", canCluster && state.clusterOnly);
      clusterOnlyToggle.setAttribute("aria-pressed", String(canCluster && state.clusterOnly));
      if (!canCluster) {
        clusterOnlyToggle.classList.remove("is-active");
      }
    }
  }

  function updateInteractionUI() {
    interactionModeButtons.forEach((button) => {
      const isActive = button.dataset.interaction === state.interactionMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (paintBrushSizeValue) {
      paintBrushSizeValue.textContent = `${Math.round(state.brushRadius)}`;
    }
    if (paintBrushSizeInput) {
      paintBrushSizeInput.value = String(Math.round(state.brushRadius));
    }
    canvas.style.cursor = state.interactionMode === "paint" ? "crosshair" : "default";
  }

  function pinNodePosition(node) {
    state.pinnedIds.add(node.id);
    node.pinned = true;
    node.vx = 0;
    node.vy = 0;
    if (state.graph3d) {
      const graphNode = state.graph3d.graphData().nodes.find((item) => item.id === node.id);
      if (graphNode) {
        graphNode.fx = node.x;
        graphNode.fy = node.y;
        graphNode.fz = graphNode.z || 0;
      }
    }
  }

  function releaseAllPins() {
    state.pinnedIds.clear();
    for (const node of state.nodes) {
      node.pinned = false;
    }
    if (state.graph3d) {
      state.graph3d.graphData().nodes.forEach((node) => {
        node.fx = undefined;
        node.fy = undefined;
        node.fz = undefined;
      });
    }
    updateSelectionActions();
    if (state.pinnedOnly) {
      applyFilters();
    } else {
      refresh3DGraph();
    }
  }

  function getCurrentTimelineMonth() {
    if (!state.timeline.months.length) {
      return null;
    }
    return state.timeline.months[clamp(state.timeline.currentIndex, 0, state.timeline.months.length - 1)];
  }

  function updateTimelineUI() {
    const monthCount = state.timeline.months.length;
    const currentMonth = getCurrentTimelineMonth();
    const atEnd = monthCount <= 1 || state.timeline.currentIndex >= monthCount - 1;

    if (timelineRange) {
      timelineRange.disabled = monthCount <= 1;
      timelineRange.min = "0";
      timelineRange.max = String(Math.max(0, monthCount - 1));
      timelineRange.value = String(clamp(state.timeline.currentIndex, 0, Math.max(0, monthCount - 1)));
    }

    if (timelineCurrentLabel) {
      timelineCurrentLabel.textContent = currentMonth ? formatTimelineMonth(currentMonth) : "Loading";
    }

    if (timelinePlayToggle) {
      if (state.timeline.playing) {
        timelinePlayToggle.textContent = "Pause build";
      } else if (atEnd) {
        timelinePlayToggle.textContent = "Replay build";
      } else {
        timelinePlayToggle.textContent = "Play build";
      }
      timelinePlayToggle.disabled = monthCount <= 1;
    }

    if (timelineFullReset) {
      timelineFullReset.disabled = monthCount <= 1 || atEnd;
    }
  }

  function clearBarrierStrokes() {
    state.paintStrokes = [];
    state.activePaintStroke = null;
    state.paintStrokeActive = false;
    state.brushPoint = null;
  }

  function appendPaintPoint(point) {
    state.brushPoint = point;
    if (!state.activePaintStroke) {
      return;
    }
    const points = state.activePaintStroke.points;
    const previous = points[points.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= Math.max(10, state.brushRadius * 0.14)) {
      points.push({ x: point.x, y: point.y });
      state.activePaintStroke.width = state.brushRadius;
    }
  }

  function startPaintStroke(point) {
    state.paintStrokeActive = true;
    state.activePaintStroke = {
      width: state.brushRadius,
      points: [{ x: point.x, y: point.y }],
    };
    state.paintStrokes.push(state.activePaintStroke);
    state.dragMoved = false;
    appendPaintPoint(point);
  }

  function endPaintStroke() {
    state.paintStrokeActive = false;
    if (state.activePaintStroke && state.activePaintStroke.points.length === 1) {
      const [point] = state.activePaintStroke.points;
      state.activePaintStroke.points.push({ x: point.x + 0.1, y: point.y + 0.1 });
    }
    state.activePaintStroke = null;
    state.brushPoint = null;
    state.dragMoved = false;
  }

  function closestPointOnSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLengthSquared = dx * dx + dy * dy;
    if (segmentLengthSquared <= 0.0001) {
      return { x: start.x, y: start.y, t: 0 };
    }
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / segmentLengthSquared, 0, 1);
    return {
      x: start.x + dx * t,
      y: start.y + dy * t,
      t,
    };
  }

  function applyBarrierForces(node) {
    for (const stroke of state.paintStrokes) {
      const thickness = Math.max(18, stroke.width * 0.42);
      const influence = thickness + 26;
      for (let index = 1; index < stroke.points.length; index += 1) {
        const start = stroke.points[index - 1];
        const end = stroke.points[index];
        const nearest = closestPointOnSegment(node, start, end);
        let dx = node.x - nearest.x;
        let dy = node.y - nearest.y;
        let distance = Math.hypot(dx, dy);
        if (distance > influence) {
          continue;
        }
        if (distance < 0.001) {
          const sx = end.x - start.x;
          const sy = end.y - start.y;
          const length = Math.hypot(sx, sy) || 1;
          dx = -sy / length;
          dy = sx / length;
          distance = 0.001;
        }
        const nx = dx / distance;
        const ny = dy / distance;
        const penetration = influence - distance;
        const push = (penetration / influence) * (distance < thickness ? 0.16 : 0.05);
        node.vx += nx * push;
        node.vy += ny * push;

        const inwardVelocity = node.vx * -nx + node.vy * -ny;
        if (inwardVelocity > 0) {
          node.vx += nx * inwardVelocity * 0.42;
          node.vy += ny * inwardVelocity * 0.42;
        }
      }
    }
  }

  function setTimelineIndex(nextIndex, { stop = false } = {}) {
    if (!state.timeline.months.length) {
      return;
    }
    state.timeline.currentIndex = clamp(nextIndex, 0, state.timeline.months.length - 1);
    if (stop) {
      state.timeline.playing = false;
      state.timeline.lastStepAt = 0;
    }
    applyFilters();
  }

  function stepTimelineForward() {
    if (!state.timeline.months.length) {
      return;
    }
    const lastIndex = state.timeline.months.length - 1;
    if (state.timeline.currentIndex >= lastIndex) {
      state.timeline.playing = false;
      state.timeline.lastStepAt = 0;
      updateTimelineUI();
      return;
    }
    state.timeline.currentIndex += 1;
    applyFilters();
    if (state.timeline.currentIndex >= lastIndex) {
      state.timeline.playing = false;
      state.timeline.lastStepAt = 0;
      updateTimelineUI();
    }
  }

  function advanceTimeline(now) {
    if (!state.timeline.playing || state.timeline.months.length <= 1) {
      return;
    }
    if (!state.timeline.lastStepAt) {
      state.timeline.lastStepAt = now;
      return;
    }
    const delay = 760 / Math.max(0.5, state.timeline.speedMultiplier);
    if (now - state.timeline.lastStepAt < delay) {
      return;
    }
    state.timeline.lastStepAt = now;
    stepTimelineForward();
  }

  function updateFilterButtonState(buttons, activeSet, attributeName) {
    buttons.forEach((button) => {
      const value = button.dataset[attributeName];
      const isActive = activeSet.has(value);
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function updateScopeToggleState(button, isActive) {
    if (!button) {
      return;
    }
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  function syncFilterControls() {
    updateFilterButtonState(groupFilterButtons, state.activeGroupFilters, "groupFilter");
    updateFilterButtonState(edgeFilterButtons, state.activeEdgeKinds, "edgeFilter");
    updateScopeToggleState(pinnedOnlyToggle, state.pinnedOnly);
    updateSelectionActions();
  }

  function nodeMatchesSection(node) {
    if (node.node_type === "story") {
      return state.activeGroupFilters.has("stories");
    }

    const group = node.group || "";
    if (BLUE_GROUPS.has(group)) {
      return state.activeGroupFilters.has("models");
    }
    if (group === "company" || group === "business" || group === "collapse") {
      return state.activeGroupFilters.has("labs");
    }
    if (group === "infrastructure") {
      return state.activeGroupFilters.has("infra");
    }
    if (PINK_GROUPS.has(group) || group === "person") {
      return state.activeGroupFilters.has("policy");
    }
    if (PURPLE_GROUPS.has(group) || group === "topic") {
      return state.activeGroupFilters.has("agents");
    }
    return false;
  }

  function updateDetailPanel(detail) {
    if (!detailTitle) {
      return;
    }

    if (!detail) {
      detailPanel?.style.setProperty("--detail-accent", "#e1e8f2");
      detailTitle.textContent = "AI Signal Graph";
      detailSubtitle.textContent = "Pick a node to inspect its cluster.";
      detailDescription.textContent = "The graph mixes story nodes with entity nodes so you can follow how labs, models, risks, capital, labor, and policy intersect over time.";
      detailType.textContent = "graph";
      detailConnections.textContent = "0";
      detailHeat.textContent = "0%";
      detailLink.classList.add("detail-link--disabled");
      detailLink.removeAttribute("href");
      updateSelectionActions();
      return;
    }

    detailTitle.textContent = detail.label;
    detailPanel?.style.setProperty("--detail-accent", themeForNode(detail).base);
    detailSubtitle.textContent = detail.subtitle || "";
    detailDescription.textContent = detail.description || "";
    detailType.textContent = detail.node_type === "story" ? `story / ${detail.group}` : `${detail.group} / ${detail.node_type}`;
    detailConnections.textContent = String(detail.degree || 0);
    detailHeat.textContent = `${Math.round(clamp(detail.heat || 0, 0, 1) * 100)}%`;
    detailLink.href = detail.route;
    detailLink.classList.remove("detail-link--disabled");
    updateSelectionActions();
  }

  function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function resize3DGraph() {
    if (!state.graph3d || !graph3dHost) {
      return;
    }
    const rect = graph3dHost.getBoundingClientRect();
    state.graph3d.width(rect.width).height(rect.height);
  }

  function rebuildNodeMap() {
    state.nodeMap = new Map(state.nodes.map((node) => [node.id, node]));
  }

  function getFocusSet() {
    if (!state.focusNodeId || !state.nodeMap.has(state.focusNodeId)) {
      return null;
    }

    const focused = new Set([state.focusNodeId]);
    for (const edge of state.edges) {
      if (edge.source === state.focusNodeId) focused.add(edge.target);
      if (edge.target === state.focusNodeId) focused.add(edge.source);
    }
    return focused;
  }

  function applyPinnedState() {
    for (const node of state.nodes) {
      node.pinned = state.pinnedIds.has(node.id);
    }
  }

  function applyFilters() {
    const query = (searchInput?.value || "").trim().toLowerCase();
    const filter = filterInput?.value || "all";
    const timelineMonth = getCurrentTimelineMonth();

    let baseNodes = state.allNodes
      .filter((node) => nodeMatchesSection(node))
      .filter((node) => !timelineMonth || !node.timeline_month || compareTimelineMonth(node.timeline_month, timelineMonth) <= 0);
    if (filter !== "all") {
      baseNodes = baseNodes.filter((node) => {
        if (filter === "story") return node.node_type === "story";
        if (filter === "entity") return node.node_type === "entity";
        return node.group === filter;
      });
    }

    if (state.pinnedOnly) {
      baseNodes = baseNodes.filter((node) => state.pinnedIds.has(node.id));
    }

    const allowed = new Map(baseNodes.map((node) => [node.id, node]));
    const edgePool = state.allEdges.filter((edge) => {
      if (!state.activeEdgeKinds.has(edge.kind)) {
        return false;
      }
      if (!timelineMonth || !edge.timeline_month) {
        return true;
      }
      return compareTimelineMonth(edge.timeline_month, timelineMonth) <= 0;
    });
    if (query) {
      const keep = new Map();
      for (const node of baseNodes) {
        if (`${node.label} ${node.subtitle} ${node.description}`.toLowerCase().includes(query)) {
          keep.set(node.id, node);
        }
      }
      for (const edge of edgePool) {
        if (keep.has(edge.source) || keep.has(edge.target)) {
          if (allowed.has(edge.source)) keep.set(edge.source, allowed.get(edge.source));
          if (allowed.has(edge.target)) keep.set(edge.target, allowed.get(edge.target));
        }
      }
      state.nodes = [...keep.values()];
    } else {
      state.nodes = [...allowed.values()];
    }

    const visibleIds = new Set(state.nodes.map((node) => node.id));
    state.edges = edgePool.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));

    if (state.clusterOnly && state.selectedId) {
      const clusterIds = new Set([state.selectedId]);
      for (const edge of state.edges) {
        if (edge.source === state.selectedId) clusterIds.add(edge.target);
        if (edge.target === state.selectedId) clusterIds.add(edge.source);
      }
      state.nodes = state.nodes.filter((node) => clusterIds.has(node.id));
      const clusteredIds = new Set(state.nodes.map((node) => node.id));
      state.edges = state.edges.filter((edge) => clusteredIds.has(edge.source) && clusteredIds.has(edge.target));
    }

    const degree = new Map();
    for (const edge of state.edges) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    }
    for (const node of state.nodes) {
      node.degree = degree.get(node.id) || 0;
      node.mass = 1 + node.radius * 0.09;
      node.peripheral = (node.degree || 0) <= 1;
    }

    applyPinnedState();
    rebuildNodeMap();
    const nextVisibleIds = new Set(state.nodes.map((node) => node.id));

    if (state.selectedId && !nextVisibleIds.has(state.selectedId)) {
      state.selectedId = null;
      state.clusterOnly = false;
      updateDetailPanel(null);
    }
    if (state.focusNodeId && !nextVisibleIds.has(state.focusNodeId)) {
      state.focusNodeId = null;
    }

    syncFilterControls();
    updateTimelineUI();
    refresh3DGraph();
  }

  function initializeGraph(payload) {
    const timelineMonths = [...(payload.timeline?.months || [])].sort(compareTimelineMonth);
    state.timeline.months = timelineMonths;
    state.timeline.currentIndex = Math.max(0, timelineMonths.length - 1);
    state.timeline.playing = false;
    state.timeline.lastStepAt = 0;

    const sorted = [...payload.nodes].sort((a, b) => {
      const av = (a.degree || 0) + (a.importance || 0) * 2;
      const bv = (b.degree || 0) + (b.importance || 0) * 2;
      return bv - av;
    });

    state.allNodes = sorted.map((node, index) => {
      const isPeripheral = (node.story_count || 0) <= 1 && node.node_type === "entity" && node.group !== "model";
      const angle = index * 0.37;
      const hubCount = Math.max(18, Math.floor(sorted.length * 0.07));
      const isHub = index < hubCount;
      let x = 0;
      let y = 0;

      if (isPeripheral) {
        const ring = 660 + (index % 48) * 10;
        x = Math.cos(angle) * ring;
        y = Math.sin(angle) * ring;
      } else if (isHub) {
        const clusterAngle = index * 0.58;
        const clusterRadius = 24 + (index % 8) * 11;
        const anchorY = index % 2 === 0 ? -118 : 132;
        x = Math.cos(clusterAngle) * clusterRadius * 0.95;
        y = anchorY + Math.sin(clusterAngle) * clusterRadius * 0.8;
      } else {
        const ring = 36 + Math.sqrt(index - hubCount + 1) * 17;
        x = Math.cos(angle) * ring * 0.92;
        y = Math.sin(angle) * ring * 1.18;
      }

      return {
        ...node,
        x,
        y,
        vx: 0,
        vy: 0,
        pinned: state.pinnedIds.has(node.id),
      };
    });

    state.allEdges = payload.edges.map((edge, index) => ({
      ...edge,
      edge_id: `${edge.source}->${edge.target}:${index}`,
    }));

    applyFilters();
    updateDetailPanel(null);
    updateTimelineUI();
  }

  function worldFromScreen(x, y) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (x - rect.left - state.transform.x) / state.transform.k,
      y: (y - rect.top - state.transform.y) / state.transform.k,
    };
  }

  function viewportBounds(rect, padding = 140) {
    const pad = padding / state.transform.k;
    return {
      minX: (-state.transform.x) / state.transform.k - pad,
      maxX: (rect.width - state.transform.x) / state.transform.k + pad,
      minY: (-state.transform.y) / state.transform.k - pad,
      maxY: (rect.height - state.transform.y) / state.transform.k + pad,
    };
  }

  function isNodeInBounds(node, bounds, extra = 0) {
    return (
      node.x + extra >= bounds.minX &&
      node.x - extra <= bounds.maxX &&
      node.y + extra >= bounds.minY &&
      node.y - extra <= bounds.maxY
    );
  }

  function findNodeAt(x, y) {
    const point = worldFromScreen(x, y);
    for (let i = state.nodes.length - 1; i >= 0; i -= 1) {
      const node = state.nodes[i];
      if (Math.hypot(point.x - node.x, point.y - node.y) <= node.radius + 5) {
        return node;
      }
    }
    return null;
  }

  function centerOnNode2d(node) {
    if (!node) {
      state.transform.x = canvas.clientWidth / 2;
      state.transform.y = canvas.clientHeight / 2;
      state.transform.k = 0.68;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const targetZoom = clamp(node.emphasis === "model" ? 1.45 : 1.2, 0.68, 2.4);
    state.transform.k = targetZoom;
    state.transform.x = rect.width / 2 - node.x * targetZoom;
    state.transform.y = rect.height / 2 - node.y * targetZoom;
  }

  function focusCameraOnNode3d(nodeId) {
    if (!state.graph3d) {
      return;
    }
    const node = state.graph3d.graphData().nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }
    const distance = 140;
    const norm = Math.hypot(node.x || 0, node.y || 0, node.z || 0) || 1;
    const ratio = 1 + distance / norm;
    state.graph3d.cameraPosition(
      {
        x: (node.x || 0) * ratio,
        y: (node.y || 0) * ratio,
        z: (node.z || 0) * ratio,
      },
      node,
      1100
    );
  }

  function selectNode(node) {
    state.selectedId = node ? node.id : null;
    updateDetailPanel(node || null);
    refresh3DGraph();
  }

  function build3dData() {
    return {
      nodes: state.nodes.map((node) => {
        const copy = { ...node };
        if (state.pinnedIds.has(node.id)) {
          copy.fx = node.x;
          copy.fy = node.y;
          copy.fz = copy.z || 0;
        }
        return copy;
      }),
      links: state.edges.map((edge) => ({ ...edge })),
    };
  }

  function apply3dStyles() {
    if (!state.graph3d) {
      return;
    }

    const focusSet = getFocusSet();
    const strength = state.connectionStrength;
    state.graph3d
      .backgroundColor("#05080c")
      .nodeRelSize(3.4)
      .nodeVal((node) => Math.max(1.4, node.radius * (node.emphasis === "model" ? 0.56 : 0.32)))
      .nodeLabel((node) => node.label)
      .nodeColor((node) => {
        if (focusSet && !focusSet.has(node.id) && node.id !== state.selectedId) {
          return "rgba(78, 88, 105, 0.18)";
        }
        return colorForNode(node);
      })
      .linkWidth((link) => {
        const focused = !focusSet || focusSet.has(link.source.id || link.source) || focusSet.has(link.target.id || link.target);
        const base = link.kind === "context" ? 0.38 : link.kind === "mentions" ? 0.7 : 0.54;
        return focused ? base * strength * Math.max(0.8, link.weight || 1) : 0.08;
      })
      .linkColor((link) => {
        const sourceId = link.source.id || link.source;
        const targetId = link.target.id || link.target;
        if (focusSet && !(focusSet.has(sourceId) || focusSet.has(targetId))) {
          return "rgba(70, 78, 92, 0.14)";
        }
        if (link.kind === "context") {
          return "rgba(149, 103, 255, 0.32)";
        }
        return "rgba(216, 81, 103, 0.54)";
      })
      .linkOpacity(0.9)
      .linkDirectionalParticles((link) => {
        const sourceId = link.source.id || link.source;
        const targetId = link.target.id || link.target;
        return state.selectedId && (sourceId === state.selectedId || targetId === state.selectedId) ? 2 : 0;
      })
      .linkDirectionalParticleWidth((link) => (link.kind === "context" ? 1.1 : 1.6));

    const linkForce = state.graph3d.d3Force("link");
    if (linkForce && typeof linkForce.strength === "function") {
      linkForce.strength((link) => {
        const base = link.kind === "context" ? 0.08 : link.kind === "mentions" ? 0.18 : 0.12;
        return base * strength * Math.max(0.8, link.weight || 1);
      });
    }
  }

  function refresh3DGraph() {
    if (state.mode !== "3d" || !graph3dHost || !window.ForceGraph3D) {
      return;
    }

    if (!state.graph3d) {
      state.graph3d = window.ForceGraph3D()(graph3dHost)
        .showNavInfo(false)
        .enableNodeDrag(true)
        .onNodeClick((node) => {
          const resolved = state.nodeMap.get(node.id);
          if (resolved) {
            selectNode(resolved);
            focusCameraOnNode3d(node.id);
          }
        });
      resize3DGraph();
    }

    state.graph3d.graphData(build3dData());
    apply3dStyles();
  }

  function setMode(mode) {
    state.mode = mode;
    viewModeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === mode);
    });

    const show3d = mode === "3d";
    canvas.style.display = show3d ? "none" : "block";
    if (graph3dHost) {
      graph3dHost.classList.toggle("graph-3d-shell--hidden", !show3d);
      graph3dHost.setAttribute("aria-hidden", String(!show3d));
    }

    if (show3d) {
      refresh3DGraph();
      if (state.selectedId) {
        focusCameraOnNode3d(state.selectedId);
      }
    }
  }

  function toggleFocus() {
    if (!state.selectedId) {
      return;
    }
    state.focusNodeId = state.focusNodeId === state.selectedId ? null : state.selectedId;
    updateSelectionActions();
    if (state.mode === "3d") {
      refresh3DGraph();
      if (state.focusNodeId) {
        focusCameraOnNode3d(state.focusNodeId);
      }
    } else if (state.focusNodeId) {
      centerOnNode2d(state.nodeMap.get(state.focusNodeId));
    }
  }

  function togglePin() {
    if (!state.selectedId) {
      return;
    }
    const selected = state.nodeMap.get(state.selectedId);
    if (!selected) {
      return;
    }

    if (state.pinnedIds.has(selected.id)) {
      state.pinnedIds.delete(selected.id);
      selected.pinned = false;
      if (state.graph3d) {
        const node = state.graph3d.graphData().nodes.find((item) => item.id === selected.id);
        if (node) {
          node.fx = undefined;
          node.fy = undefined;
          node.fz = undefined;
        }
      }
    } else {
      state.pinnedIds.add(selected.id);
      selected.pinned = true;
      if (state.graph3d) {
        const node = state.graph3d.graphData().nodes.find((item) => item.id === selected.id);
        if (node) {
          node.fx = node.x;
          node.fy = node.y;
          node.fz = node.z;
        }
      }
    }

    updateSelectionActions();
    refresh3DGraph();
  }

  function resetView() {
    state.focusNodeId = null;
    if (state.mode === "3d") {
      refresh3DGraph();
      if (state.graph3d) {
        state.graph3d.cameraPosition({ x: 0, y: 0, z: 600 }, { x: 0, y: 0, z: 0 }, 1000);
      }
    } else {
      centerOnNode2d(null);
    }
    updateSelectionActions();
  }

  function applyFluidForces(node, time) {
    const field = node.peripheral ? 0.0024 : 0.0034;
    const curlX = Math.sin(node.y * field + time * 0.00015) + Math.cos(node.x * field * 0.62 - time * 0.00012);
    const curlY = Math.cos(node.x * field + time * 0.00014) - Math.sin(node.y * field * 0.62 - time * 0.00011);
    node.vx += curlX * (node.peripheral ? 0.0028 : 0.0038);
    node.vy += curlY * (node.peripheral ? 0.0028 : 0.0038);
    const swirl = node.peripheral ? 0.000005 : 0.000014;
    node.vx += -node.y * swirl;
    node.vy += node.x * swirl;
  }

  function tick() {
    state.time += 0.14;
    const nodes = state.nodes;
    const edges = state.edges;
    const interactionRadius = 172;
    const interactionRadius2 = interactionRadius * interactionRadius;
    const grid = new Map();
    const linkStrengthFactor = state.connectionStrength;

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const cellX = Math.floor(node.x / interactionRadius);
      const cellY = Math.floor(node.y / interactionRadius);
      const key = `${cellX}:${cellY}`;
      const bucket = grid.get(key);
      if (bucket) {
        bucket.push(i);
      } else {
        grid.set(key, [i]);
      }
    }

    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      const cellX = Math.floor(a.x / interactionRadius);
      const cellY = Math.floor(a.y / interactionRadius);

      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const bucket = grid.get(`${cellX + offsetX}:${cellY + offsetY}`);
          if (!bucket) {
            continue;
          }

          for (const j of bucket) {
            if (j <= i) {
              continue;
            }
            const b = nodes[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dist2 = dx * dx + dy * dy + 0.01;
            if (dist2 > interactionRadius2) {
              continue;
            }
            const repel = clamp(680 / dist2, 0, 0.22);
            const fx = dx * repel * 0.0032;
            const fy = dy * repel * 0.0032;
            a.vx += fx / a.mass;
            a.vy += fy / a.mass;
            b.vx -= fx / b.mass;
            b.vy -= fy / b.mass;
          }
        }
      }
    }

    for (const edge of edges) {
      const source = state.nodeMap.get(edge.source);
      const target = state.nodeMap.get(edge.target);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const desired = edge.kind === "context" ? 108 : edge.kind === "mentions" ? 72 : 90;
      const stretch = dist - desired;
      const relativeVx = target.vx - source.vx;
      const relativeVy = target.vy - source.vy;
      const along = (relativeVx * dx + relativeVy * dy) / dist;
      const spring = stretch * (edge.kind === "context" ? 0.00022 : 0.00042) * Math.max(1, edge.weight) * linkStrengthFactor;
      const damper = along * 0.0105;
      const force = spring - damper;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    }

    for (const node of nodes) {
      if (node.pinned || state.dragNodeId === node.id) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      applyFluidForces(node, state.time);
      applyBarrierForces(node);
      const centerPull = node.peripheral ? 0.000003 : node.emphasis === "model" ? 0.00012 : 0.00008;
      node.vx += -node.x * centerPull;
      node.vy += -node.y * centerPull;
      node.vx *= node.peripheral ? 0.984 : 0.972;
      node.vy *= node.peripheral ? 0.984 : 0.972;
      node.vx = clamp(node.vx, -1.55, 1.55);
      node.vy = clamp(node.vy, -1.55, 1.55);
      node.x += node.vx;
      node.y += node.vy;
    }
  }

  function drawBackground(width, height) {
    ctx.fillStyle = "#05080c";
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 10; i += 1) {
      const x = (Math.sin(state.time * 0.00045 + i * 5.8) * 0.5 + 0.5) * width;
      const y = (Math.cos(state.time * 0.00042 + i * 4.7) * 0.5 + 0.5) * height;
      const radius = 160 + (i % 4) * 54;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, "rgba(86, 98, 116, 0.022)");
      glow.addColorStop(1, "rgba(5, 8, 12, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    drawBackground(rect.width, rect.height);
    const bounds = viewportBounds(rect);
    const visibleNodes = [];
    const visibleNodeIds = new Set();
    const focusSet = getFocusSet();

    for (const node of state.nodes) {
      const alwaysKeep = node.id === state.hoveredId || node.id === state.selectedId;
      const sizeFactor = node.peripheral ? 0.38 : node.emphasis === "model" ? 1.18 : node.node_type === "story" ? 0.62 : 0.7;
      const radius = Math.max(1.4, node.radius * sizeFactor + (alwaysKeep ? 1.3 : 0));
      if (alwaysKeep || isNodeInBounds(node, bounds, radius * 3.1)) {
        visibleNodes.push({ node, radius });
        visibleNodeIds.add(node.id);
      }
    }

    ctx.save();
    ctx.translate(state.transform.x, state.transform.y);
    ctx.scale(state.transform.k, state.transform.k);

    for (const stroke of state.paintStrokes) {
      if (!stroke.points.length) {
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let index = 1; index < stroke.points.length; index += 1) {
        ctx.lineTo(stroke.points[index].x, stroke.points[index].y);
      }
      ctx.lineWidth = Math.max(8, stroke.width * 0.22);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(149, 103, 255, 0.28)";
      ctx.stroke();

      ctx.lineWidth = Math.max(2, stroke.width * 0.06);
      ctx.strokeStyle = "rgba(220, 212, 255, 0.72)";
      ctx.stroke();
    }

    for (const edge of state.edges) {
      const source = state.nodeMap.get(edge.source);
      const target = state.nodeMap.get(edge.target);
      if (!source || !target) continue;
      if (!(visibleNodeIds.has(source.id) || visibleNodeIds.has(target.id))) continue;

      const focused = !focusSet || focusSet.has(source.id) || focusSet.has(target.id);
      if (!focused && edge.kind !== "mentions") {
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);

      const edgeAlpha = focused ? (edge.kind === "context" ? 0.2 : 0.16 + Math.min(edge.weight * 0.025, 0.12)) : 0.045;
      ctx.strokeStyle = edge.kind === "context" ? `rgba(149, 103, 255, ${edgeAlpha})` : `rgba(216, 81, 103, ${edgeAlpha})`;
      ctx.lineWidth = (edge.kind === "mentions" ? 0.62 : 0.42 + edge.weight * 0.06) * state.connectionStrength;
      ctx.stroke();
    }

    for (const { node, radius } of visibleNodes) {
      const isHovered = node.id === state.hoveredId;
      const isSelected = node.id === state.selectedId;
      const focused = !focusSet || focusSet.has(node.id) || isSelected;
      const fill = colorForNode(node);
      const theme = themeForNode(node);

      if (node.emphasis === "model") {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius * 2.3, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? "rgba(255,255,255,0.18)" : theme.halo;
        ctx.fill();
      }

      if (!node.peripheral) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? "rgba(255,255,255,0.12)" : focused ? "rgba(255,255,255,0.018)" : "rgba(255,255,255,0.01)";
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.globalAlpha = isHovered || isSelected ? 1 : focused ? (node.peripheral ? 0.96 : 0.9) : 0.18;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (shouldDrawNodeImage(node, radius, state.transform.k, isHovered, isSelected)) {
        const image = getNodeImage(node);
        const imageRadius = radius * (node.emphasis === "model" ? 0.95 : 0.9);
        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, imageRadius, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalAlpha = focused ? 0.96 : 0.25;
        ctx.drawImage(image, node.x - imageRadius, node.y - imageRadius, imageRadius * 2, imageRadius * 2);
        ctx.globalAlpha = 1;
        ctx.restore();

        ctx.beginPath();
        ctx.arc(node.x, node.y, imageRadius, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(255,255,255,0.16)";
        ctx.stroke();
      }

      if (state.pinnedIds.has(node.id)) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 3.2, 0, Math.PI * 2);
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.36)";
        ctx.stroke();
      }

      if (isHovered || isSelected) {
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }
    }

    if (state.interactionMode === "paint" && state.brushPoint) {
      ctx.beginPath();
      ctx.arc(state.brushPoint.x, state.brushPoint.y, state.brushRadius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(149, 103, 255, 0.05)";
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(149, 103, 255, 0.48)";
      ctx.stroke();
    }

    const zoom = state.transform.k;
    ctx.font = "12px IBM Plex Sans, sans-serif";
    ctx.textAlign = "left";
    for (const { node } of visibleNodes) {
      const focused = !focusSet || focusSet.has(node.id) || node.id === state.selectedId;
      const alwaysShow = node.id === state.hoveredId || node.id === state.selectedId;
      const showAtMedium = zoom > 0.95 && (node.emphasis === "model" || (!node.peripheral && (node.radius >= 16 || node.degree >= 12)));
      const showAtClose = zoom > 1.6 && !node.peripheral && (node.radius >= 13 || node.degree >= 7);
      if (!(alwaysShow || showAtMedium || showAtClose) || !focused) {
        continue;
      }
      ctx.fillStyle = "rgba(243, 247, 251, 0.9)";
      ctx.fillText(node.label, node.x + node.radius + 6, node.y + 4);
    }
    ctx.restore();
  }

  function loop(now = window.performance.now()) {
    advanceTimeline(now);
    if (state.mode === "2d") {
      tick();
      draw();
    }
    window.requestAnimationFrame(loop);
  }

  canvas.addEventListener("mousemove", (event) => {
    if (state.mode !== "2d") {
      return;
    }

    const point = worldFromScreen(event.clientX, event.clientY);
    const node = findNodeAt(event.clientX, event.clientY);
    state.hoveredId = state.interactionMode === "paint" ? null : node ? node.id : null;

    if (state.interactionMode === "paint") {
      state.brushPoint = point;
      canvas.style.cursor = "crosshair";
      if (state.paintStrokeActive) {
        state.dragMoved = true;
        appendPaintPoint(point);
      }
      return;
    }

    canvas.style.cursor = node ? "pointer" : state.panOrigin ? "grabbing" : "default";

    if (state.dragNodeId) {
      const dragged = state.nodeMap.get(state.dragNodeId);
      if (dragged) {
        dragged.x = point.x;
        dragged.y = point.y;
        pinNodePosition(dragged);
        state.dragMoved = true;
      }
      return;
    }

    if (state.panOrigin) {
      state.transform.x = event.clientX - state.panOrigin.offsetX;
      state.transform.y = event.clientY - state.panOrigin.offsetY;
    }
  });

  canvas.addEventListener("mousedown", (event) => {
    if (state.mode !== "2d") {
      return;
    }

    const point = worldFromScreen(event.clientX, event.clientY);
    if (state.interactionMode === "paint") {
      state.suppressClick = true;
      startPaintStroke(point);
      return;
    }

    const node = findNodeAt(event.clientX, event.clientY);
    if (node) {
      state.dragNodeId = node.id;
      state.dragMoved = false;
      state.suppressClick = false;
      selectNode(node);
      return;
    }

    state.dragMoved = false;
    state.panOrigin = {
      offsetX: event.clientX - state.transform.x,
      offsetY: event.clientY - state.transform.y,
    };
  });

  window.addEventListener("mouseup", () => {
    if (state.paintStrokeActive) {
      state.suppressClick = true;
      endPaintStroke();
    } else if (state.dragNodeId && state.dragMoved) {
      state.suppressClick = true;
    }
    state.dragNodeId = null;
    state.panOrigin = null;
    state.dragMoved = false;
    updateSelectionActions();
    canvas.style.cursor = state.interactionMode === "paint" ? "crosshair" : "default";
  });

  canvas.addEventListener("click", (event) => {
    if (state.mode !== "2d") {
      return;
    }
    if (state.suppressClick) {
      state.suppressClick = false;
      return;
    }
    if (state.interactionMode === "paint") {
      return;
    }
    const node = findNodeAt(event.clientX, event.clientY);
    selectNode(node || null);
  });

  canvas.addEventListener("dblclick", (event) => {
    if (state.mode !== "2d") {
      return;
    }
    if (state.interactionMode === "paint") {
      return;
    }
    const node = findNodeAt(event.clientX, event.clientY);
    if (node?.route) {
      window.location.href = node.route;
    }
  });

  canvas.addEventListener("wheel", (event) => {
    if (state.mode !== "2d") {
      return;
    }
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const wx = (px - state.transform.x) / state.transform.k;
    const wy = (py - state.transform.y) / state.transform.k;
    const scale = event.deltaY < 0 ? 1.1 : 0.9;
    state.transform.k = clamp(state.transform.k * scale, 0.06, 10);
    state.transform.x = px - wx * state.transform.k;
    state.transform.y = py - wy * state.transform.k;
  }, { passive: false });

  searchInput?.addEventListener("input", applyFilters);
  filterInput?.addEventListener("change", applyFilters);
  groupFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.groupFilter;
      if (!value) {
        return;
      }
      if (state.activeGroupFilters.has(value)) {
        state.activeGroupFilters.delete(value);
      } else {
        state.activeGroupFilters.add(value);
      }
      applyFilters();
    });
  });

  edgeFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.edgeFilter;
      if (!value) {
        return;
      }
      if (state.activeEdgeKinds.has(value)) {
        state.activeEdgeKinds.delete(value);
      } else {
        state.activeEdgeKinds.add(value);
      }
      applyFilters();
    });
  });

  pinnedOnlyToggle?.addEventListener("click", () => {
    state.pinnedOnly = !state.pinnedOnly;
    applyFilters();
  });

  clusterOnlyToggle?.addEventListener("click", () => {
    if (!state.selectedId) {
      return;
    }
    state.clusterOnly = !state.clusterOnly;
    applyFilters();
  });

  clearGraphFiltersButton?.addEventListener("click", () => {
    if (searchInput) {
      searchInput.value = "";
    }
    if (filterInput) {
      filterInput.value = "all";
    }
    state.activeGroupFilters = new Set(DEFAULT_GROUP_FILTERS);
    state.activeEdgeKinds = new Set(DEFAULT_EDGE_FILTERS);
    state.pinnedOnly = false;
    state.clusterOnly = false;
    applyFilters();
  });

  timelinePlayToggle?.addEventListener("click", () => {
    if (state.timeline.months.length <= 1) {
      return;
    }
    const lastIndex = state.timeline.months.length - 1;
    if (state.timeline.playing) {
      state.timeline.playing = false;
      state.timeline.lastStepAt = 0;
      updateTimelineUI();
      return;
    }
    if (state.timeline.currentIndex >= lastIndex) {
      state.timeline.currentIndex = 0;
      applyFilters();
    }
    state.timeline.playing = true;
    state.timeline.lastStepAt = 0;
    updateTimelineUI();
  });

  timelineFullReset?.addEventListener("click", () => {
    if (state.timeline.months.length <= 1) {
      return;
    }
    setTimelineIndex(state.timeline.months.length - 1, { stop: true });
  });

  timelineRange?.addEventListener("input", () => {
    const nextIndex = Number.parseInt(timelineRange.value, 10) || 0;
    setTimelineIndex(nextIndex, { stop: true });
  });

  timelineSpeed?.addEventListener("change", () => {
    const nextSpeed = Number.parseFloat(timelineSpeed.value);
    state.timeline.speedMultiplier = Number.isFinite(nextSpeed) ? nextSpeed : 1;
  });

  interactionModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.interactionMode = button.dataset.interaction || "move";
      state.paintStrokeActive = false;
      state.activePaintStroke = null;
      state.brushPoint = null;
      updateInteractionUI();
    });
  });

  paintBrushSizeInput?.addEventListener("input", () => {
    const nextRadius = Number.parseInt(paintBrushSizeInput.value, 10);
    state.brushRadius = clamp(nextRadius, 40, 240);
    updateInteractionUI();
  });

  clearPinsButton?.addEventListener("click", () => {
    releaseAllPins();
  });

  clearBarriersButton?.addEventListener("click", () => {
    clearBarrierStrokes();
  });

  connectionStrengthInput?.addEventListener("input", () => {
    const raw = Number.parseInt(connectionStrengthInput.value, 10);
    state.connectionStrength = clamp(raw / 100, 0.2, 1.8);
    if (connectionStrengthValue) {
      connectionStrengthValue.textContent = `${raw}%`;
    }
    refresh3DGraph();
  });

  imageToggleButton?.addEventListener("click", () => {
    state.showImages = !state.showImages;
    updateImageToggleUI();
    refresh3DGraph();
  });

  viewModeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode || "2d"));
  });

  focusButton?.addEventListener("click", toggleFocus);
  pinButton?.addEventListener("click", togglePin);
  resetButton?.addEventListener("click", resetView);

  window.addEventListener("resize", () => {
    resizeCanvas();
    resize3DGraph();
  });

  resizeCanvas();
  updateImageToggleUI();
  syncFilterControls();
  updateInteractionUI();

  fetch("/api/graph", { headers: { Accept: "application/json" } })
    .then((response) => response.json())
    .then((payload) => {
      initializeGraph(payload);
      if (connectionStrengthValue && connectionStrengthInput) {
        connectionStrengthValue.textContent = `${connectionStrengthInput.value}%`;
      }
      setMode("2d");
      loop();
    });
}

if (document.getElementById("stats-grid")) {
  refreshOverview().catch(() => {});
  window.setInterval(() => {
    refreshOverview().catch(() => {});
  }, 5000);
}

bootGraph();
