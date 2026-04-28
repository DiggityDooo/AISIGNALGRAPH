function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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

function visualRadiusForNode(node) {
  const sizeFactor = node.peripheral ? 0.38 : node.emphasis === "model" ? 1.18 : node.node_type === "story" ? 0.62 : 0.7;
  return Math.max(1.4, node.radius * sizeFactor);
}

function hitRadiusForNode(node) {
  const base = visualRadiusForNode(node);
  const padding = node.emphasis === "model" ? 7 : node.node_type === "story" ? 4 : 5;
  return base + padding;
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

function timelineScore(monthKey) {
  if (!monthKey) {
    return 0;
  }
  const [yearText, monthText] = monthKey.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return 0;
  }
  return year * 12 + month;
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
  const lensInput = document.getElementById("graph-lens");
  const sortInput = document.getElementById("graph-sort");
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
    graph3dRuntime: null,
    lens: "global",
    sortMode: "signal",
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
    dragPinnedBeforeMove: false,
    simulation: {
      lastInteractionAt: window.performance.now(),
      settleDurationMs: 16000,
      minEnergy: 0.06,
    },
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

  function markSimulationActive() {
    state.simulation.lastInteractionAt = window.performance.now();
  }

  function currentSimulationEnergy(now = window.performance.now()) {
    const elapsed = Math.max(0, now - state.simulation.lastInteractionAt);
    const progress = clamp(elapsed / state.simulation.settleDurationMs, 0, 1);
    const eased = 1 - (1 - progress) * (1 - progress);
    return lerp(1, state.simulation.minEnergy, eased);
  }

  function pinNodePosition(node) {
    state.pinnedIds.add(node.id);
    node.pinned = true;
    node.vx = 0;
    node.vy = 0;
    markSimulationActive();
  }

  function releaseAllPins() {
    state.pinnedIds.clear();
    for (const node of state.nodes) {
      node.pinned = false;
    }
    markSimulationActive();
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
    markSimulationActive();
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
      markSimulationActive();
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
    markSimulationActive();
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
    markSimulationActive();
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
    markSimulationActive();
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
    markSimulationActive();
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

  function nodeSortScore(node) {
    return (node.degree || 0) * 2 + (node.importance || 0) * 3 + (node.heat || 0) * 10 + (node.story_count || 0) * 0.3;
  }

  function compareNodes(left, right, sortMode = state.sortMode) {
    if (sortMode === "alphabetical") {
      return (left.label || "").localeCompare(right.label || "");
    }
    if (sortMode === "newest") {
      return timelineScore(right.timeline_month) - timelineScore(left.timeline_month) || nodeSortScore(right) - nodeSortScore(left);
    }
    if (sortMode === "oldest") {
      return timelineScore(left.timeline_month) - timelineScore(right.timeline_month) || nodeSortScore(right) - nodeSortScore(left);
    }
    if (sortMode === "connected") {
      return (right.degree || 0) - (left.degree || 0) || nodeSortScore(right) - nodeSortScore(left);
    }
    return nodeSortScore(right) - nodeSortScore(left) || (right.degree || 0) - (left.degree || 0);
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
    const runtime = state.graph3dRuntime;
    if (!runtime || !graph3dHost) {
      return;
    }
    const rect = graph3dHost.getBoundingClientRect();
    runtime.camera.aspect = rect.width / Math.max(1, rect.height);
    runtime.camera.updateProjectionMatrix();
    runtime.renderer.setSize(rect.width, rect.height, false);
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
    markSimulationActive();
    const query = (searchInput?.value || "").trim().toLowerCase();
    const previousLens = state.lens;
    const lens = lensInput?.value || state.lens || "global";
    const sortMode = sortInput?.value || state.sortMode || "signal";
    const filter = filterInput?.value || "all";
    const timelineMonth = getCurrentTimelineMonth();
    state.lens = lens;
    state.sortMode = sortMode;

    if (previousLens === "local" && lens !== "local") {
      state.clusterOnly = false;
    }

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

    if (lens === "signal") {
      baseNodes = baseNodes.filter((node) => (node.degree || 0) >= 2 || (node.heat || 0) >= 0.2 || node.emphasis === "model");
    } else if (lens === "local") {
      state.clusterOnly = Boolean(state.selectedId);
    } else if (lens === "orphans") {
      baseNodes = baseNodes.filter((node) => (node.degree || 0) <= 1 || node.peripheral || (node.story_count || 0) <= 1);
    } else if (lens === "clusters") {
      baseNodes = baseNodes.filter((node) => (node.degree || 0) >= 2 && node.group !== "year");
    } else if (lens === "writing") {
      baseNodes = baseNodes.filter((node) => {
        if (node.node_type === "story") {
          return true;
        }
        const group = node.group || "";
        return group === "model" || group === "company" || PINK_GROUPS.has(group) || group === "keyword" || group === "people";
      });
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
      node.hitRadius = hitRadiusForNode(node);
    }

    if (lens === "signal") {
      state.nodes = state.nodes.filter((node) => (node.degree || 0) >= 2 || (node.heat || 0) >= 0.2 || node.emphasis === "model");
      const visibleIdsAfterSignal = new Set(state.nodes.map((node) => node.id));
      state.edges = state.edges.filter((edge) => visibleIdsAfterSignal.has(edge.source) && visibleIdsAfterSignal.has(edge.target));
    } else if (lens === "orphans") {
      state.nodes = state.nodes.filter((node) => (node.degree || 0) <= 1 || node.peripheral);
      const orphanIds = new Set(state.nodes.map((node) => node.id));
      state.edges = state.edges.filter((edge) => orphanIds.has(edge.source) && orphanIds.has(edge.target));
    }

    state.nodes.sort((left, right) => compareNodes(left, right, sortMode));

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
      const depthSeed = hashString(node.id || `${node.label}:${index}`) / 4294967295;
      const depthSpan = isPeripheral ? 560 : isHub ? 180 : node.emphasis === "model" ? 260 : 340;
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
        z: (depthSeed - 0.5) * depthSpan,
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
    markSimulationActive();
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
    const runtime = state.graph3dRuntime;
    if (!runtime) {
      return;
    }
    const node = state.nodeMap.get(nodeId);
    if (!node) {
      return;
    }
    runtime.orbit.target.set(node.x || 0, node.y || 0, node.z || 0);
    runtime.orbit.distance = clamp(node.emphasis === "model" ? 260 : 360, 220, 2200);
    runtime.orbit.lastInteractionAt = window.performance.now();
  }

  function selectNode(node) {
    state.selectedId = node ? node.id : null;
    updateDetailPanel(node || null);
    refresh3DGraph();
  }

  function create3DNodeMaterial(node, focused) {
    const color = colorForNode(node);
    const opacity = focused ? 0.96 : 0.18;
    return new window.THREE.MeshStandardMaterial({
      color,
      emissive: new window.THREE.Color(color).multiplyScalar(node.emphasis === "model" ? 0.28 : 0.12),
      transparent: true,
      opacity,
      roughness: 0.44,
      metalness: 0.08,
    });
  }

  function disposeThreeObject(object) {
    if (!object) {
      return;
    }
    if (object.geometry && typeof object.geometry.dispose === "function") {
      object.geometry.dispose();
    }
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material?.dispose?.());
    } else if (object.material && typeof object.material.dispose === "function") {
      object.material.dispose();
    }
  }

  function clear3DScene(runtime) {
    if (!runtime) {
      return;
    }
    while (runtime.graphRoot.children.length) {
      const child = runtime.graphRoot.children[runtime.graphRoot.children.length - 1];
      runtime.graphRoot.remove(child);
      disposeThreeObject(child);
    }
    runtime.nodeMeshes.clear();
    runtime.pickables = [];
    runtime.edgeLine = null;
  }

  function edgeColorFor3D(edge, focused) {
    if (!focused) {
      return new window.THREE.Color("#464e5c");
    }
    return new window.THREE.Color(edge.kind === "context" ? "#9567ff" : "#d85167");
  }

  function render3DPick(event) {
    const runtime = state.graph3dRuntime;
    if (!runtime || !runtime.pickables.length) {
      return null;
    }
    const rect = runtime.renderer.domElement.getBoundingClientRect();
    runtime.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    runtime.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    runtime.raycaster.setFromCamera(runtime.pointer, runtime.camera);
    const [hit] = runtime.raycaster.intersectObjects(runtime.pickables, false);
    if (!hit?.object?.userData?.nodeId) {
      return null;
    }
    return state.nodeMap.get(hit.object.userData.nodeId) || null;
  }

  function rebuild3DGraph() {
    const runtime = state.graph3dRuntime;
    if (!runtime || !window.THREE) {
      return;
    }

    clear3DScene(runtime);
    const focusSet = getFocusSet();
    const edgePositions = [];
    const edgeColors = [];

    for (const edge of state.edges) {
      const source = state.nodeMap.get(edge.source);
      const target = state.nodeMap.get(edge.target);
      if (!source || !target) {
        continue;
      }
      const focused = !focusSet || focusSet.has(source.id) || focusSet.has(target.id);
      const color = edgeColorFor3D(edge, focused);
      edgePositions.push(source.x, source.y, source.z || 0, target.x, target.y, target.z || 0);
      edgeColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }

    if (edgePositions.length) {
      const geometry = new window.THREE.BufferGeometry();
      geometry.setAttribute("position", new window.THREE.Float32BufferAttribute(edgePositions, 3));
      geometry.setAttribute("color", new window.THREE.Float32BufferAttribute(edgeColors, 3));
      const material = new window.THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: clamp(0.24 + state.connectionStrength * 0.22, 0.18, 0.7),
      });
      runtime.edgeLine = new window.THREE.LineSegments(geometry, material);
      runtime.graphRoot.add(runtime.edgeLine);
    }

    for (const node of state.nodes) {
      const focused = !focusSet || focusSet.has(node.id) || node.id === state.selectedId;
      const radius = Math.max(1.8, node.radius * (node.emphasis === "model" ? 0.52 : 0.3));
      const geometry = new window.THREE.SphereGeometry(radius, 18, 18);
      const mesh = new window.THREE.Mesh(geometry, create3DNodeMaterial(node, focused));
      mesh.position.set(node.x, node.y, node.z || 0);
      mesh.userData.nodeId = node.id;
      runtime.graphRoot.add(mesh);
      const entry = { mesh, radius, halo: null };
      runtime.nodeMeshes.set(node.id, entry);
      runtime.pickables.push(mesh);

      if (node.emphasis === "model") {
        const haloGeometry = new window.THREE.SphereGeometry(radius * 1.6, 18, 18);
        const haloMaterial = new window.THREE.MeshBasicMaterial({
          color: themeForNode(node).accent,
          transparent: true,
          opacity: node.id === state.selectedId ? 0.18 : 0.09,
        });
        const halo = new window.THREE.Mesh(haloGeometry, haloMaterial);
        halo.position.copy(mesh.position);
        runtime.graphRoot.add(halo);
        entry.halo = halo;
      }
    }
  }

  function ensure3DGraph() {
    if (state.graph3dRuntime || !graph3dHost || !window.THREE) {
      return state.graph3dRuntime;
    }

    let renderer;
    try {
      renderer = new window.THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch (error) {
      graph3dHost.textContent = "3D view could not initialize WebGL on this device.";
      return null;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x05080c, 1);
    graph3dHost.replaceChildren(renderer.domElement);

    const scene = new window.THREE.Scene();
    scene.fog = new window.THREE.FogExp2(0x05080c, 0.00085);
    const camera = new window.THREE.PerspectiveCamera(55, 1, 1, 6000);
    const graphRoot = new window.THREE.Group();
    scene.add(graphRoot);
    scene.add(new window.THREE.AmbientLight(0xf4f7fb, 1.15));
    const keyLight = new window.THREE.DirectionalLight(0x9fb9ff, 1.4);
    keyLight.position.set(420, -280, 560);
    scene.add(keyLight);
    const fillLight = new window.THREE.DirectionalLight(0xff8bb9, 0.85);
    fillLight.position.set(-300, 220, 320);
    scene.add(fillLight);

    state.graph3dRuntime = {
      renderer,
      scene,
      camera,
      graphRoot,
      edgeLine: null,
      nodeMeshes: new Map(),
      pickables: [],
      raycaster: new window.THREE.Raycaster(),
      pointer: new window.THREE.Vector2(),
      orbit: {
        yaw: 0.24,
        pitch: -0.18,
        distance: 980,
        target: new window.THREE.Vector3(0, 0, 0),
        dragging: false,
        moved: false,
        lastX: 0,
        lastY: 0,
        lastInteractionAt: window.performance.now(),
      },
      lastFrameAt: window.performance.now(),
    };

    renderer.domElement.addEventListener("mousedown", (event) => {
      const runtime = state.graph3dRuntime;
      if (!runtime) {
        return;
      }
      runtime.orbit.dragging = true;
      runtime.orbit.moved = false;
      runtime.orbit.lastX = event.clientX;
      runtime.orbit.lastY = event.clientY;
      runtime.orbit.lastInteractionAt = window.performance.now();
    });

    renderer.domElement.addEventListener("mousemove", (event) => {
      const runtime = state.graph3dRuntime;
      if (!runtime || !runtime.orbit.dragging) {
        return;
      }
      const dx = event.clientX - runtime.orbit.lastX;
      const dy = event.clientY - runtime.orbit.lastY;
      runtime.orbit.lastX = event.clientX;
      runtime.orbit.lastY = event.clientY;
      runtime.orbit.moved = runtime.orbit.moved || Math.abs(dx) > 1 || Math.abs(dy) > 1;
      runtime.orbit.yaw -= dx * 0.0055;
      runtime.orbit.pitch = clamp(runtime.orbit.pitch - dy * 0.0042, -1.25, 1.25);
      runtime.orbit.lastInteractionAt = window.performance.now();
    });

    const endOrbitDrag = (event) => {
      const runtime = state.graph3dRuntime;
      if (!runtime) {
        return;
      }
      const clickNode = !runtime.orbit.moved ? render3DPick(event) : null;
      runtime.orbit.dragging = false;
      runtime.orbit.lastInteractionAt = window.performance.now();
      if (clickNode) {
        selectNode(clickNode);
        focusCameraOnNode3d(clickNode.id);
      }
    };

    renderer.domElement.addEventListener("mouseup", endOrbitDrag);
    renderer.domElement.addEventListener("mouseleave", () => {
      const runtime = state.graph3dRuntime;
      if (runtime) {
        runtime.orbit.dragging = false;
      }
    });
    renderer.domElement.addEventListener(
      "wheel",
      (event) => {
        const runtime = state.graph3dRuntime;
        if (!runtime) {
          return;
        }
        event.preventDefault();
        const nextDistance = runtime.orbit.distance * (event.deltaY < 0 ? 0.92 : 1.08);
        runtime.orbit.distance = clamp(nextDistance, 180, 2400);
        runtime.orbit.lastInteractionAt = window.performance.now();
      },
      { passive: false }
    );

    resize3DGraph();
    rebuild3DGraph();
    return state.graph3dRuntime;
  }

  function refresh3DGraph() {
    if (!graph3dHost) {
      return;
    }
    const runtime = ensure3DGraph();
    if (runtime && state.mode === "3d") {
      rebuild3DGraph();
    }
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
    } else {
      state.pinnedIds.add(selected.id);
      selected.pinned = true;
      selected.vx = 0;
      selected.vy = 0;
    }

    markSimulationActive();
    updateSelectionActions();
    refresh3DGraph();
  }

  function resetView() {
    state.focusNodeId = null;
    if (state.mode === "3d") {
      refresh3DGraph();
      if (state.graph3dRuntime) {
        state.graph3dRuntime.orbit.target.set(0, 0, 0);
        state.graph3dRuntime.orbit.distance = 980;
        state.graph3dRuntime.orbit.yaw = 0.24;
        state.graph3dRuntime.orbit.pitch = -0.18;
        state.graph3dRuntime.orbit.lastInteractionAt = window.performance.now();
      }
    } else {
      centerOnNode2d(null);
    }
    updateSelectionActions();
  }

  function update3DScene(now = window.performance.now()) {
    const runtime = state.graph3dRuntime;
    if (!runtime || state.mode !== "3d") {
      return;
    }

    const delta = Math.max(0, now - runtime.lastFrameAt);
    runtime.lastFrameAt = now;
    const idleFor = now - runtime.orbit.lastInteractionAt;
    if (!runtime.orbit.dragging && idleFor > 1800) {
      runtime.orbit.yaw += delta * 0.00008;
    }

    const target = runtime.orbit.target;
    const distance = runtime.orbit.distance;
    const cosPitch = Math.cos(runtime.orbit.pitch);
    runtime.camera.position.set(
      target.x + Math.cos(runtime.orbit.yaw) * cosPitch * distance,
      target.y + Math.sin(runtime.orbit.pitch) * distance,
      target.z + Math.sin(runtime.orbit.yaw) * cosPitch * distance
    );
    runtime.camera.lookAt(target);

    const focusSet = getFocusSet();
    for (const node of state.nodes) {
      const entry = runtime.nodeMeshes.get(node.id);
      if (!entry) {
        continue;
      }
      const isSelected = node.id === state.selectedId;
      const focused = !focusSet || focusSet.has(node.id) || isSelected;
      entry.mesh.position.set(node.x, node.y, node.z || 0);
      entry.mesh.scale.setScalar(isSelected ? 1.22 : 1);
      entry.mesh.material.opacity = focused ? 0.96 : 0.18;
      if (entry.halo) {
        entry.halo.position.copy(entry.mesh.position);
        entry.halo.scale.setScalar(isSelected ? 1.15 : 1);
        entry.halo.material.opacity = isSelected ? 0.22 : 0.09;
      }
    }

    if (runtime.edgeLine) {
      const positions = runtime.edgeLine.geometry.attributes.position.array;
      let cursor = 0;
      for (const edge of state.edges) {
        const source = state.nodeMap.get(edge.source);
        const targetNode = state.nodeMap.get(edge.target);
        if (!source || !targetNode) {
          continue;
        }
        positions[cursor] = source.x;
        positions[cursor + 1] = source.y;
        positions[cursor + 2] = source.z || 0;
        positions[cursor + 3] = targetNode.x;
        positions[cursor + 4] = targetNode.y;
        positions[cursor + 5] = targetNode.z || 0;
        cursor += 6;
      }
      runtime.edgeLine.geometry.attributes.position.needsUpdate = true;
    }

    runtime.renderer.render(runtime.scene, runtime.camera);
  }

  function applyFluidForces(node, time, scale = 1) {
    const field = node.peripheral ? 0.0024 : 0.0034;
    const curlX = Math.sin(node.y * field + time * 0.00015) + Math.cos(node.x * field * 0.62 - time * 0.00012);
    const curlY = Math.cos(node.x * field + time * 0.00014) - Math.sin(node.y * field * 0.62 - time * 0.00011);
    node.vx += curlX * (node.peripheral ? 0.0028 : 0.0038) * scale;
    node.vy += curlY * (node.peripheral ? 0.0028 : 0.0038) * scale;
    const swirl = (node.peripheral ? 0.000005 : 0.000014) * scale;
    node.vx += -node.y * swirl;
    node.vy += node.x * swirl;
  }

  function tick(now = window.performance.now()) {
    state.time += 0.14;
    const nodes = state.nodes;
    const edges = state.edges;
    const interactionRadius = 172;
    const interactionRadius2 = interactionRadius * interactionRadius;
    const grid = new Map();
    const linkStrengthFactor = state.connectionStrength;
    const energy = currentSimulationEnergy(now);
    const repelScale = lerp(0.22, 1, energy);
    const springScale = lerp(0.24, 1, energy);
    const fluidScale = lerp(0.02, 1, energy);
    const centerScale = lerp(0.42, 1, energy);
    const speedCap = lerp(0.14, 1.55, energy);

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
            const dist = Math.sqrt(dist2);
            const minGap = (a.hitRadius || hitRadiusForNode(a)) + (b.hitRadius || hitRadiusForNode(b));
            if (dist < minGap) {
              const overlap = minGap - dist;
              const nx = dx / dist;
              const ny = dy / dist;
              const soften = clamp(0.18 + energy * 0.42, 0.18, 0.6);
              const separation = overlap * 0.5 * soften;
              const aLocked = a.pinned || state.dragNodeId === a.id;
              const bLocked = b.pinned || state.dragNodeId === b.id;

              if (!aLocked && !bLocked) {
                a.x += nx * separation;
                a.y += ny * separation;
                b.x -= nx * separation;
                b.y -= ny * separation;
                a.vx += nx * separation * 0.05;
                a.vy += ny * separation * 0.05;
                b.vx -= nx * separation * 0.05;
                b.vy -= ny * separation * 0.05;
              } else if (!aLocked) {
                a.x += nx * overlap * soften;
                a.y += ny * overlap * soften;
                a.vx += nx * overlap * 0.06;
                a.vy += ny * overlap * 0.06;
              } else if (!bLocked) {
                b.x -= nx * overlap * soften;
                b.y -= ny * overlap * soften;
                b.vx -= nx * overlap * 0.06;
                b.vy -= ny * overlap * 0.06;
              }
            }
            const repel = clamp(680 / dist2, 0, 0.22);
            const fx = dx * repel * 0.0032 * repelScale;
            const fy = dy * repel * 0.0032 * repelScale;
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
      const spring =
        stretch *
        (edge.kind === "context" ? 0.00022 : 0.00042) *
        Math.max(1, edge.weight) *
        linkStrengthFactor *
        springScale;
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
      applyFluidForces(node, state.time, fluidScale);
      applyBarrierForces(node);
      const centerPull = (node.peripheral ? 0.000003 : node.emphasis === "model" ? 0.00012 : 0.00008) * centerScale;
      node.vx += -node.x * centerPull;
      node.vy += -node.y * centerPull;
      const velocityDecay = node.peripheral ? lerp(0.76, 0.984, energy) : lerp(0.7, 0.972, energy);
      node.vx *= velocityDecay;
      node.vy *= velocityDecay;
      node.vx = clamp(node.vx, -speedCap, speedCap);
      node.vy = clamp(node.vy, -speedCap, speedCap);
      if (energy < 0.14 && Math.abs(node.vx) < 0.01) {
        node.vx = 0;
      }
      if (energy < 0.14 && Math.abs(node.vy) < 0.01) {
        node.vy = 0;
      }
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
      const radius = visualRadiusForNode(node) + (alwaysKeep ? 1.3 : 0);
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
    tick(now);
    if (state.mode === "2d") {
      draw();
    } else {
      update3DScene(now);
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
        if (state.dragPinnedBeforeMove && state.pinnedIds.has(dragged.id)) {
          state.pinnedIds.delete(dragged.id);
          dragged.pinned = false;
        }
        dragged.x = point.x;
        dragged.y = point.y;
        dragged.vx = 0;
        dragged.vy = 0;
        state.dragMoved = true;
        markSimulationActive();
      }
      return;
    }

    if (state.panOrigin) {
      state.transform.x = event.clientX - state.panOrigin.offsetX;
      state.transform.y = event.clientY - state.panOrigin.offsetY;
      markSimulationActive();
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
      state.dragPinnedBeforeMove = state.pinnedIds.has(node.id);
      state.dragMoved = false;
      state.suppressClick = false;
      markSimulationActive();
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
      const dragged = state.nodeMap.get(state.dragNodeId);
      if (dragged && state.dragPinnedBeforeMove) {
        pinNodePosition(dragged);
      } else if (dragged) {
        dragged.pinned = false;
      }
      state.suppressClick = true;
    }
    state.dragNodeId = null;
    state.dragPinnedBeforeMove = false;
    state.panOrigin = null;
    state.dragMoved = false;
    markSimulationActive();
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
    markSimulationActive();
  }, { passive: false });

  searchInput?.addEventListener("input", applyFilters);
  lensInput?.addEventListener("change", applyFilters);
  sortInput?.addEventListener("change", applyFilters);
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
    if (lensInput) {
      lensInput.value = "global";
    }
    if (sortInput) {
      sortInput.value = "signal";
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
    markSimulationActive();
  });

  interactionModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.interactionMode = button.dataset.interaction || "move";
      state.paintStrokeActive = false;
      state.activePaintStroke = null;
      state.brushPoint = null;
      markSimulationActive();
      updateInteractionUI();
    });
  });

  paintBrushSizeInput?.addEventListener("input", () => {
    const nextRadius = Number.parseInt(paintBrushSizeInput.value, 10);
    state.brushRadius = clamp(nextRadius, 40, 240);
    markSimulationActive();
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
    markSimulationActive();
    refresh3DGraph();
  });

  imageToggleButton?.addEventListener("click", () => {
    state.showImages = !state.showImages;
    markSimulationActive();
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
