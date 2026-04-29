"use strict";

(function bootstrapGraph() {
  const appRoot = document.getElementById("app-root");
  if (!appRoot || typeof d3 === "undefined") {
    return;
  }

  const CONFIG = {
    alphaDecay: 0.028,
    alphaMin: 0.0012,
    velocityDecay: 0.46,
    baseCharge: -170,
    maxSignals: navigator.maxTouchPoints > 0 ? 18 : 52,
    attentionDecay: 0.95,
    zoomExpandDebounceMs: 120,
    zoomExpandThreshold: 1.35,
    zoomCollapseThreshold: 1.1,
    denseExpansionThreshold: 20,
    primaryHubCount: 3,
    secondaryHubCount: 8,
    localLeaderCount: 4,
  };

  const NODE_COLORS = {
    story: "#ff4258",
    lab: "#ff8b72",
    model: "#ff6678",
    person: "#ffd3ca",
    risk: "#ff1e3a",
    year: "#9c6c71",
    topic: "#ff9f8a",
    product: "#ffb38e",
    community: "#ff304c",
  };

  const COMMUNITY_PALETTE = ["#ff304c", "#ff5a48", "#ff7756", "#ff5469", "#ff8f73", "#ff6b5a", "#ff4670", "#ff9b63"];
  const NODE_LABELS = {
    story: "Stories",
    lab: "Labs",
    model: "Models",
    person: "People",
    risk: "Risks",
    year: "Years",
    topic: "Topics",
    product: "Products",
  };
  const EDGE_LABELS = {
    timeline: "Timeline",
    mention: "Mentions",
    context: "Context",
    support: "Support",
  };
  const EDGE_STYLES = {
    timeline: { color: "#ff8b72", dash: null, opacity: 0.32, width: 1.2, distance: 150, strength: 0.15 },
    mention: { color: "#ff4258", dash: null, opacity: 0.32, width: 1.0, distance: 90, strength: 0.14 },
    context: { color: "#7d4a4f", dash: "4,8", opacity: 0.18, width: 0.85, distance: 180, strength: 0.07 },
    support: { color: "#5c363a", dash: "2,10", opacity: 0.12, width: 0.8, distance: 165, strength: 0.05 },
    membership: { color: "#431920", dash: "2,12", opacity: 0.09, width: 0.7, distance: 44, strength: 0.16 },
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
    detailActions: document.getElementById("detail-actions"),
    detailLink: document.getElementById("detail-link"),
    detailClose: document.getElementById("detail-close"),
    debugTarget: document.querySelector(".hud-canvas-hint"),
  };

  const nodeCtx = refs.nodeCanvas.getContext("2d");
  const signalCtx = refs.signalCanvas.getContext("2d");
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";
  const debugMode = new URLSearchParams(window.location.search).has("debug");

  const state = {
    rawNodes: [],
    rawEdges: [],
    rawCommunities: [],
    rawNodeById: new Map(),
    rawCommunityById: new Map(),
    rawNeighbors: new Map(),
    rawDirectedOut: new Map(),
    rawDirectedIn: new Map(),
    nodes: [],
    edges: [],
    nodeById: new Map(),
    linksByNode: new Map(),
    attentionNodes: {},
    attentionCommunities: {},
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
    query: "",
    lens: refs.lens?.value || "global",
    lastLens: refs.lens?.value || "global",
    sortMode: refs.sort?.value || "signal",
    activeYear: 2026,
    minYear: 2020,
    maxYear: 2026,
    monthFloor: 2020 * 12 + 1,
    monthCeiling: 2026 * 12 + 12,
    signalSpeed: 1,
    activeNodeTypes: new Set(Object.keys(NODE_LABELS)),
    activeEdgeKinds: new Set(Object.keys(EDGE_LABELS)),
    selectedId: null,
    highlightedIds: new Set(),
    pinnedCommunityId: null,
    autoExpandedCommunityId: null,
    selectedCommunityId: null,
    localSupportExpanded: false,
    zoomExpandTimer: null,
    isPaused: false,
    is3DMode: false,
    animationFrameId: null,
    pulseIntervalId: null,
    threeGraph: null,
    initialFitPending: true,
  };

  refs.localSupportToggle = null;

  class SignalPulse {
    constructor(sourceNode, targetNode, color) {
      this.source = sourceNode;
      this.target = targetNode;
      this.color = color;
      this.progress = 0;
      this.speed = 0.02 + Math.random() * 0.015;
      this.size = 2.8 + Math.random() * 1.8;
      this.trail = [];
      this.alive = true;
    }

    update() {
      this.progress += this.speed * Math.max(state.signalSpeed, 0.25);
      const x = this.source.x + (this.target.x - this.source.x) * this.progress;
      const y = this.source.y + (this.target.y - this.source.y) * this.progress;
      this.trail.unshift({ x, y });
      if (this.trail.length > 14) {
        this.trail.pop();
      }
      if (this.progress >= 1) {
        this.alive = false;
        activateNode(this.target);
      }
    }

    draw(ctx) {
      if (!this.trail.length) {
        return;
      }
      this.trail.forEach((point, index) => {
        const alpha = (1 - index / this.trail.length) * 0.8;
        const radius = this.size * (1 - index / this.trail.length * 0.85);
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(this.color, alpha);
        ctx.fill();
      });
    }
  }

  function fail(error, stage = "error") {
    window.__AISIGNALGRAPH_DEBUG = { stage, message: String(error?.stack || error || "unknown error") };
    writeDebug();
    refs.detailCopy.textContent = String(error?.message || error || "The graph failed to initialize.");
    refs.hudRight.classList.add("is-open");
  }

  function writeDebug(extra = {}) {
    if (!debugMode || !refs.debugTarget) {
      return;
    }
    const snapshot = {
      stage: window.__AISIGNALGRAPH_DEBUG?.stage || "unknown",
      nodes: state.nodes.length,
      edges: state.edges.length,
      rawNodes: state.rawNodes.length,
      rawEdges: state.rawEdges.length,
      lens: state.lens,
      selectedId: state.selectedId,
      pinnedCommunityId: state.pinnedCommunityId,
      autoExpandedCommunityId: state.autoExpandedCommunityId,
      is3DMode: state.is3DMode,
      paused: state.isPaused,
      transform: {
        x: Math.round(state.currentTransform.x || 0),
        y: Math.round(state.currentTransform.y || 0),
        k: Number((state.currentTransform.k || 1).toFixed(3)),
      },
      ...extra,
    };
    window.__AISIGNALGRAPH_DEBUG = snapshot;
    refs.debugTarget.style.whiteSpace = "pre-wrap";
    refs.debugTarget.textContent = JSON.stringify(snapshot, null, 2);
  }

  function communityNodeId(clusterId) {
    return `community:${clusterId}`;
  }

  function isCommunityNode(node) {
    return node?.node_type === "community";
  }

  function nodeCommunityId(node) {
    if (!node) {
      return null;
    }
    if (Number.isFinite(node.display_cluster_id)) {
      return node.display_cluster_id;
    }
    if (Number.isFinite(node.cluster_id)) {
      return node.cluster_id;
    }
    return null;
  }

  function communityColor(clusterId) {
    return COMMUNITY_PALETTE[Math.abs(Number(clusterId) || 0) % COMMUNITY_PALETTE.length];
  }

  function sanitizeType(value) {
    return NODE_COLORS[value] ? value : "topic";
  }

  function hexToRgba(hex, alpha) {
    const value = String(hex || "#ffffff").replace("#", "");
    const normalized = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
    const parsed = Number.parseInt(normalized, 16);
    const r = (parsed >> 16) & 255;
    const g = (parsed >> 8) & 255;
    const b = parsed & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
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

  function nodeMonthIndex(node) {
    return node?.month_index || monthIndexFromKey(node?.timeline_month) || state.monthFloor;
  }

  function nodeYear(node) {
    if (node?.year) {
      return Number.parseInt(node.year, 10) || state.maxYear;
    }
    const month = node?.timeline_month || "";
    return Number.parseInt(month.slice(0, 4), 10) || state.maxYear;
  }

  function edgeYear(edge) {
    return Number.parseInt((edge.timeline_month || "").slice(0, 4), 10) || state.maxYear;
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

  function currentSvgRect() {
    return refs.svg.node().getBoundingClientRect();
  }

  function edgeStyle(edge) {
    return EDGE_STYLES[edge.flow_kind] || EDGE_STYLES.membership;
  }

  function storyIdFromNodeId(nodeId) {
    return String(nodeId || "").replace(/^story:/, "");
  }

  function buildRawIndexes() {
    state.rawNodeById = new Map(state.rawNodes.map((node) => [node.id, node]));
    state.rawCommunityById = new Map(state.rawCommunities.map((community) => [community.id, community]));
    state.rawNeighbors = new Map(state.rawNodes.map((node) => [node.id, new Set()]));
    state.rawDirectedOut = new Map(state.rawNodes.map((node) => [node.id, []]));
    state.rawDirectedIn = new Map(state.rawNodes.map((node) => [node.id, []]));

    state.rawEdges.forEach((edge) => {
      if (!state.rawNeighbors.has(edge.sourceId)) {
        state.rawNeighbors.set(edge.sourceId, new Set());
      }
      if (!state.rawNeighbors.has(edge.targetId)) {
        state.rawNeighbors.set(edge.targetId, new Set());
      }
      state.rawNeighbors.get(edge.sourceId).add(edge.targetId);
      state.rawNeighbors.get(edge.targetId).add(edge.sourceId);
      if (edge.directed) {
        state.rawDirectedOut.get(edge.sourceId)?.push(edge);
        state.rawDirectedIn.get(edge.targetId)?.push(edge);
      }
    });
  }

  function ensureSupportToggle() {
    if (refs.localSupportToggle || !refs.detailActions) {
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-hud";
    button.textContent = "SUPPORT PATHS";
    button.style.display = "none";
    button.addEventListener("click", () => {
      state.localSupportExpanded = !state.localSupportExpanded;
      button.classList.toggle("is-active", state.localSupportExpanded);
      applyFilters();
    });
    refs.detailActions.insertBefore(button, refs.detailLink);
    refs.localSupportToggle = button;
  }

  function updateSupportToggle() {
    ensureSupportToggle();
    if (!refs.localSupportToggle) {
      return;
    }
    const shouldShow = state.lens === "local" && state.selectedId && !isCommunityNode(state.nodeById.get(state.selectedId));
    refs.localSupportToggle.style.display = shouldShow ? "inline-flex" : "none";
    refs.localSupportToggle.classList.toggle("is-active", state.localSupportExpanded);
  }

  function setupSVG() {
    const rect = currentSvgRect();
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

    state.zoomBehavior = d3.zoom()
      .scaleExtent([0.08, 7.5])
      .on("zoom", (event) => {
        state.currentTransform = event.transform;
        state.root.attr("transform", event.transform);
        drawNodesCanvas();
        drawSignalsCanvas();
        scheduleZoomExpansionUpdate();
      });

    refs.svg.call(state.zoomBehavior);
    refs.svg.on("click", (event) => {
      if (event.target === refs.svg.node()) {
        clearSelection();
      }
    });
  }

  function buildDrag() {
    return d3.drag()
      .on("start", (event, node) => {
        if (!event.active && state.simulation && !state.isPaused) {
          state.simulation.alphaTarget(0.22).restart();
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

  function sortCommunities(communityIds) {
    const communities = communityIds
      .map((communityId) => state.rawCommunityById.get(communityId))
      .filter(Boolean);

    if (state.sortMode === "alphabetical") {
      communities.sort((left, right) => left.label.localeCompare(right.label));
    } else if (state.sortMode === "newest") {
      communities.sort((left, right) => {
        const leftAnchor = left.anchor_story_ids[0] || "";
        const rightAnchor = right.anchor_story_ids[0] || "";
        return nodeMonthIndex(state.rawNodeById.get(rightAnchor)) - nodeMonthIndex(state.rawNodeById.get(leftAnchor));
      });
    } else if (state.sortMode === "connected") {
      communities.sort((left, right) => right.node_ids.length - left.node_ids.length || left.id - right.id);
    } else {
      communities.sort((left, right) => left.id - right.id);
    }
    return communities.map((community) => community.id);
  }

  function communityScore(communityId) {
    const community = state.rawCommunityById.get(communityId);
    if (!community) {
      return 0;
    }
    return community.story_count * 2 + community.entity_count + community.node_ids.length * 0.25;
  }

  function communityMembersFromRawNodes(rawNodes) {
    const byCommunity = new Map();
    rawNodes.forEach((node) => {
      const communityId = nodeCommunityId(node);
      if (communityId == null || node.cluster_role === "timeline") {
        return;
      }
      if (!byCommunity.has(communityId)) {
        byCommunity.set(communityId, []);
      }
      byCommunity.get(communityId).push(node);
    });
    return byCommunity;
  }

  function visibleNodeDegree(nodeId) {
    return (state.linksByNode.get(nodeId) || []).filter((edge) => !edge.synthetic).length;
  }

  function pickLeaderId(nodeId, leaderIds) {
    if (!leaderIds.length) {
      return null;
    }
    const links = state.linksByNode.get(nodeId) || [];
    let bestLeaderId = null;
    let bestWeight = -1;
    links.forEach((edge) => {
      const otherId = edge.sourceId === nodeId ? edge.targetId : edge.sourceId;
      if (!leaderIds.includes(otherId)) {
        return;
      }
      const weight = edge.weight_norm || edge.weight || 1;
      if (weight > bestWeight) {
        bestWeight = weight;
        bestLeaderId = otherId;
      }
    });
    return bestLeaderId || leaderIds[0];
  }

  function buildCommunitySpreadMap(membersByCommunity) {
    const spreadMap = new Map();
    membersByCommunity.forEach((members) => {
      const ranked = [...members].sort((left, right) => {
        return visibleNodeDegree(right.id) - visibleNodeDegree(left.id) ||
          (right.importance || 0) - (left.importance || 0) ||
          left.id.localeCompare(right.id);
      });

      const largeGroup = ranked.length >= CONFIG.denseExpansionThreshold;
      const primaryCount = largeGroup ? Math.min(CONFIG.primaryHubCount, ranked.length) : Math.min(2, ranked.length);
      const secondaryLimit = largeGroup
        ? Math.min(CONFIG.secondaryHubCount, ranked.length)
        : Math.min(primaryCount + 3, ranked.length);
      const primaryIds = ranked.slice(0, primaryCount).map((node) => node.id);
      const leaderPoolIds = ranked.slice(0, secondaryLimit).map((node) => node.id);

      ranked.forEach((node, index) => {
        let tier = "satellite";
        let indexWithinTier = index;
        if (index < primaryCount) {
          tier = "primary";
          indexWithinTier = index;
        } else if (index < secondaryLimit) {
          tier = "secondary";
          indexWithinTier = index - primaryCount;
        } else {
          indexWithinTier = index - secondaryLimit;
        }

        const leaderIds = tier === "secondary" ? primaryIds : leaderPoolIds;
        spreadMap.set(node.id, {
          largeGroup,
          tier,
          rank: index,
          degree: visibleNodeDegree(node.id),
          indexWithinTier,
          primaryCount,
          secondaryCount: Math.max(secondaryLimit - primaryCount, 0),
          leaderId: tier === "primary" ? node.id : pickLeaderId(node.id, leaderIds.filter((candidateId) => candidateId !== node.id)),
        });
      });
    });
    return spreadMap;
  }

  function strongestLinkedLeader(nodeId, leaderIds) {
    return pickLeaderId(nodeId, leaderIds);
  }

  function buildLocalFocusTargets(displayNodes, width, height) {
    if (state.lens !== "local" || !state.selectedId || String(state.selectedId).startsWith("community:")) {
      return null;
    }

    const selectedNode = state.nodeById.get(state.selectedId) || displayNodes.find((node) => node.id === state.selectedId);
    if (!selectedNode || isCommunityNode(selectedNode)) {
      return null;
    }

    const localNodes = displayNodes.filter((node) => !isCommunityNode(node) && node.type !== "year");
    if (!localNodes.length) {
      return null;
    }

    const focusTargets = new Map();
    const center = { x: width * 0.46, y: height * 0.5 };
    focusTargets.set(selectedNode.id, center);

    const visibleLinks = (state.linksByNode.get(selectedNode.id) || []).filter((edge) => !edge.synthetic);
    const firstHopIds = [...new Set(visibleLinks.map((edge) => edge.sourceId === selectedNode.id ? edge.targetId : edge.sourceId))]
      .filter((nodeId) => state.nodeById.has(nodeId));

    const rankedFirstHop = [...firstHopIds]
      .map((nodeId) => state.nodeById.get(nodeId))
      .filter(Boolean)
      .sort((left, right) => {
        return visibleNodeDegree(right.id) - visibleNodeDegree(left.id) ||
          (right.importance || 0) - (left.importance || 0) ||
          left.id.localeCompare(right.id);
      });

    const leaderNodes = rankedFirstHop.slice(0, Math.min(CONFIG.localLeaderCount, rankedFirstHop.length));
    const leaderIds = [selectedNode.id, ...leaderNodes.map((node) => node.id)];

    leaderNodes.forEach((node, index) => {
      const angle = (-Math.PI / 2) + (Math.PI * 2 * index) / Math.max(leaderNodes.length, 1);
      const radius = leaderNodes.length >= 3 ? 126 : 110;
      focusTargets.set(node.id, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius * 0.84,
      });
    });

    const remainingNodes = localNodes
      .filter((node) => node.id !== selectedNode.id && !focusTargets.has(node.id))
      .sort((left, right) => {
        const leftIsFirstHop = firstHopIds.includes(left.id) ? 0 : 1;
        const rightIsFirstHop = firstHopIds.includes(right.id) ? 0 : 1;
        return leftIsFirstHop - rightIsFirstHop ||
          visibleNodeDegree(right.id) - visibleNodeDegree(left.id) ||
          (right.importance || 0) - (left.importance || 0) ||
          left.id.localeCompare(right.id);
      });

    const orbitCounts = new Map();
    remainingNodes.forEach((node, index) => {
      const leaderId = strongestLinkedLeader(node.id, leaderIds.filter((candidateId) => candidateId !== node.id)) || selectedNode.id;
      const leaderTarget = focusTargets.get(leaderId) || center;
      const orbitIndex = orbitCounts.get(leaderId) || 0;
      orbitCounts.set(leaderId, orbitIndex + 1);

      const ringSize = firstHopIds.includes(node.id) ? 4 : 6;
      const angle = node.id === selectedNode.id
        ? 0
        : (-Math.PI / 2) + (Math.PI * 2 * (orbitIndex % ringSize)) / ringSize + index * 0.08;
      const ringStep = firstHopIds.includes(node.id) ? 18 : 12;
      const baseRadius = firstHopIds.includes(node.id) ? 46 : 28;
      const radius = baseRadius + Math.floor(orbitIndex / ringSize) * ringStep;

      focusTargets.set(node.id, {
        x: leaderTarget.x + Math.cos(angle) * radius,
        y: leaderTarget.y + Math.sin(angle) * radius * 0.9,
      });
    });

    return {
      selectedId: selectedNode.id,
      firstHopIds: new Set(firstHopIds),
      communityNodeIds: new Set(localNodes.map((node) => node.id)),
      targets: focusTargets,
    };
  }

  function filteredRawGraph() {
    state.query = refs.search.value || "";
    state.sortMode = refs.sort.value || "signal";
    state.activeYear = Number.parseInt(refs.yearFilter.value, 10) || state.maxYear;
    const query = state.query.trim().toLowerCase();

    let rawNodes = state.rawNodes.filter((node) => state.activeNodeTypes.has(node.type) && nodeYear(node) <= state.activeYear);
    if (query) {
      rawNodes = rawNodes.filter((node) => (node.search_text || "").includes(query));
    }

    const visibleIds = new Set(rawNodes.map((node) => node.id));
    const rawEdges = state.rawEdges.filter((edge) => {
      return visibleIds.has(edge.sourceId) &&
        visibleIds.has(edge.targetId) &&
        state.activeEdgeKinds.has(edge.flow_kind) &&
        edgeYear(edge) <= state.activeYear;
    });

    return { rawNodes, rawEdges };
  }

  function determineLocalNeighborhood(rawNodes, rawEdges) {
    const rawNodeById = new Map(rawNodes.map((node) => [node.id, node]));
    const edgesByNode = new Map(rawNodes.map((node) => [node.id, []]));
    rawEdges.forEach((edge) => {
      edgesByNode.get(edge.sourceId)?.push(edge);
      edgesByNode.get(edge.targetId)?.push(edge);
    });

    const expandedRawIds = new Set(rawNodes.filter((node) => node.type === "year").map((node) => node.id));
    const rawDegree = (nodeId) => (edgesByNode.get(nodeId) || []).filter((edge) => !edge.synthetic && edge.flow_kind !== "timeline").length;

    const findCommunitySeed = (communityId) => {
      if (communityId == null) {
        return null;
      }
      const community = state.rawCommunityById.get(communityId);
      for (const anchorId of community?.anchor_story_ids || []) {
        const anchorNode = rawNodeById.get(anchorId);
        if (anchorNode) {
          return anchorNode;
        }
      }
      return rawNodes
        .filter((node) => nodeCommunityId(node) === communityId && node.type !== "year")
        .sort((left, right) => {
          return (right.importance || 0) - (left.importance || 0) ||
            rawDegree(right.id) - rawDegree(left.id) ||
            left.id.localeCompare(right.id);
        })[0] || null;
    };

    let seedNode = null;
    if (state.selectedId && rawNodeById.has(state.selectedId)) {
      seedNode = rawNodeById.get(state.selectedId) || null;
    } else if (state.selectedCommunityId != null) {
      seedNode = findCommunitySeed(state.selectedCommunityId);
    }

    if (!seedNode || seedNode.type === "year" || isCommunityNode(seedNode)) {
      return { expandedRawIds, focusCommunityId: null };
    }

    const focusCommunityId = nodeCommunityId(seedNode);
    expandedRawIds.add(seedNode.id);

    const totalBudget = 28;
    const maxFirstHop = 10;
    const maxLeaderCount = CONFIG.localLeaderCount;

    const firstHopCandidates = new Map();
    (edgesByNode.get(seedNode.id) || []).forEach((edge) => {
      const otherId = edge.sourceId === seedNode.id ? edge.targetId : edge.sourceId;
      const otherNode = rawNodeById.get(otherId);
      if (!otherNode || otherNode.type === "year") {
        return;
      }
      const supportOnly = edge.flow_kind === "support";
      if (supportOnly && !state.localSupportExpanded) {
        return;
      }
      const current = firstHopCandidates.get(otherId) || {
        id: otherId,
        node: otherNode,
        directed: false,
        weight: 0,
        degree: rawDegree(otherId),
        importance: otherNode.importance || 0,
      };
      current.directed = current.directed || Boolean(edge.directed);
      current.weight = Math.max(current.weight, edge.weight_norm || edge.weight || 1);
      firstHopCandidates.set(otherId, current);
    });

    const rankedFirstHop = [...firstHopCandidates.values()].sort((left, right) => {
      return Number(right.directed) - Number(left.directed) ||
        right.weight - left.weight ||
        right.degree - left.degree ||
        right.importance - left.importance ||
        left.id.localeCompare(right.id);
    });
    const firstHop = rankedFirstHop.slice(0, maxFirstHop);
    firstHop.forEach((candidate) => expandedRawIds.add(candidate.id));

    const leaderIds = firstHop.slice(0, maxLeaderCount).map((candidate) => candidate.id);
    const secondHopBudget = Math.max(0, totalBudget - expandedRawIds.size);
    const secondHopCandidates = new Map();
    const leaderPool = leaderIds.length ? leaderIds : firstHop.map((candidate) => candidate.id);

    leaderPool.forEach((leaderId, leaderRank) => {
      (edgesByNode.get(leaderId) || []).forEach((edge) => {
        const otherId = edge.sourceId === leaderId ? edge.targetId : edge.sourceId;
        const otherNode = rawNodeById.get(otherId);
        if (!otherNode || otherNode.type === "year" || expandedRawIds.has(otherId)) {
          return;
        }
        if (edge.flow_kind === "support" && !state.localSupportExpanded) {
          return;
        }
        const current = secondHopCandidates.get(otherId) || {
          id: otherId,
          node: otherNode,
          directed: false,
          weight: 0,
          degree: rawDegree(otherId),
          importance: otherNode.importance || 0,
          leaderRank,
          inFocusCommunity: nodeCommunityId(otherNode) === focusCommunityId,
        };
        current.directed = current.directed || Boolean(edge.directed);
        current.weight = Math.max(current.weight, edge.weight_norm || edge.weight || 1);
        current.leaderRank = Math.min(current.leaderRank, leaderRank);
        current.inFocusCommunity = current.inFocusCommunity || nodeCommunityId(otherNode) === focusCommunityId;
        secondHopCandidates.set(otherId, current);
      });
    });

    [...secondHopCandidates.values()]
      .sort((left, right) => {
        return left.leaderRank - right.leaderRank ||
          Number(right.inFocusCommunity) - Number(left.inFocusCommunity) ||
          Number(right.directed) - Number(left.directed) ||
          right.weight - left.weight ||
          right.degree - left.degree ||
          right.importance - left.importance ||
          left.id.localeCompare(right.id);
      })
      .slice(0, secondHopBudget)
      .forEach((candidate) => expandedRawIds.add(candidate.id));

    return { expandedRawIds, focusCommunityId };
  }

  function buildDisplayGraph(rawNodes, rawEdges) {
    const byCommunity = communityMembersFromRawNodes(rawNodes);
    const visibleCommunityIds = sortCommunities([...byCommunity.keys()]);
    const expandedRawIds = new Set();
    let keepCommunityNodes = false;
    let focusCommunityId = null;

    if (state.lens === "global" || state.lens === "signal") {
      keepCommunityNodes = true;
      focusCommunityId = state.pinnedCommunityId ?? state.autoExpandedCommunityId;
      if (focusCommunityId != null) {
        (byCommunity.get(focusCommunityId) || []).forEach((node) => expandedRawIds.add(node.id));
      }
    } else if (state.lens === "local") {
      keepCommunityNodes = true;
      const neighborhood = determineLocalNeighborhood(rawNodes, rawEdges);
      focusCommunityId = neighborhood.focusCommunityId;
      neighborhood.expandedRawIds.forEach((nodeId) => expandedRawIds.add(nodeId));
    } else if (state.lens === "clusters") {
      keepCommunityNodes = true;
      rawNodes.forEach((node) => expandedRawIds.add(node.id));
    } else {
      rawNodes.forEach((node) => expandedRawIds.add(node.id));
    }

    const displayNodes = [];
    const displayNodeById = new Map();

    function addDisplayNode(node) {
      if (!displayNodeById.has(node.id)) {
        displayNodes.push(node);
        displayNodeById.set(node.id, node);
      }
    }

    if (keepCommunityNodes) {
      visibleCommunityIds.forEach((communityId) => {
        const community = state.rawCommunityById.get(communityId);
        const members = byCommunity.get(communityId) || [];
        if (!community || !members.length) {
          return;
        }
        const monthValues = members.map((member) => nodeMonthIndex(member)).filter(Number.isFinite);
        addDisplayNode({
          id: communityNodeId(communityId),
          label: community.label,
          node_type: "community",
          type: "community",
          group: "community",
          color: NODE_COLORS.community,
          community_color: communityColor(communityId),
          cluster_id: community.parent_cluster_id ?? communityId,
          display_cluster_id: communityId,
          display_cluster_label: community.label,
          cluster_role: "community",
          layer_index: 1,
          month_index: monthValues.length ? Math.min(...monthValues) : state.monthFloor,
          timeline_month: members[0]?.timeline_month || state.rawNodeById.get(community.anchor_story_ids[0])?.timeline_month || null,
          member_count: members.length,
          story_count: members.filter((member) => member.node_type === "story").length,
          entity_count: members.filter((member) => member.node_type === "entity").length,
          dominant_types: community.dominant_types,
          anchor_story_ids: community.anchor_story_ids,
          importance: 4 + Math.min(6, members.length / 12),
          route: community.anchor_story_ids[0] ? state.rawNodeById.get(community.anchor_story_ids[0])?.route || "/stories" : "/stories",
          subtitle: `${members.length} linked records`,
          description: `Collapsed community containing ${members.length} nodes.`,
          year: "",
        });
      });
    }

    rawNodes.forEach((node) => {
      const shouldExpand = expandedRawIds.has(node.id) || node.type === "year";
      if (!shouldExpand && nodeCommunityId(node) != null && node.cluster_role !== "timeline" && keepCommunityNodes) {
        return;
      }
      addDisplayNode({
        ...node,
        community_color: nodeCommunityId(node) != null ? communityColor(nodeCommunityId(node)) : NODE_COLORS.year,
        color: node.color || NODE_COLORS[node.type] || NODE_COLORS.topic,
      });
    });

    function displayIdForRaw(rawNode) {
      const communityId = nodeCommunityId(rawNode);
      if (rawNode.type === "year" || !keepCommunityNodes || communityId == null || rawNode.cluster_role === "timeline") {
        return rawNode.id;
      }
      return expandedRawIds.has(rawNode.id) ? rawNode.id : communityNodeId(communityId);
    }

    const aggregatedEdges = new Map();
    rawEdges.forEach((edge) => {
      const sourceRaw = state.rawNodeById.get(edge.sourceId);
      const targetRaw = state.rawNodeById.get(edge.targetId);
      if (!sourceRaw || !targetRaw) {
        return;
      }
      const sourceDisplayId = displayIdForRaw(sourceRaw);
      const targetDisplayId = displayIdForRaw(targetRaw);
      if (sourceDisplayId === targetDisplayId) {
        return;
      }

      const orderedPair = edge.directed
        ? [sourceDisplayId, targetDisplayId]
        : [sourceDisplayId, targetDisplayId].sort();
      const key = `${orderedPair[0]}->${orderedPair[1]}:${edge.flow_kind}:${edge.directed ? "d" : "u"}`;

      if (!aggregatedEdges.has(key)) {
        aggregatedEdges.set(key, {
          id: key,
          source: orderedPair[0],
          target: orderedPair[1],
          sourceId: orderedPair[0],
          targetId: orderedPair[1],
          kind: edge.flow_kind,
          flow_kind: edge.flow_kind,
          directed: edge.directed,
          weight: 0,
          weight_norm: 0,
          type: edge.type,
          timeline_month: edge.timeline_month,
          count: 0,
          synthetic: false,
        });
      }

      const aggregate = aggregatedEdges.get(key);
      aggregate.weight += edge.weight || 1;
      aggregate.weight_norm += edge.weight_norm || 1;
      aggregate.count += 1;
      if ((edge.timeline_month || "") > (aggregate.timeline_month || "")) {
        aggregate.timeline_month = edge.timeline_month;
      }
    });

    const displayEdges = [...aggregatedEdges.values()].map((edge) => ({
      ...edge,
      weight_norm: edge.count ? edge.weight_norm / edge.count : 1,
    }));

    if (keepCommunityNodes) {
      rawNodes.forEach((node) => {
        const communityId = nodeCommunityId(node);
        if (node.type === "year" || communityId == null || !expandedRawIds.has(node.id)) {
          return;
        }
        const collapsedCommunityNodeId = communityNodeId(communityId);
        if (!displayNodeById.has(collapsedCommunityNodeId)) {
          return;
        }
        displayEdges.push({
          id: `${collapsedCommunityNodeId}->${node.id}:membership`,
          source: collapsedCommunityNodeId,
          target: node.id,
          sourceId: collapsedCommunityNodeId,
          targetId: node.id,
          kind: "membership",
          flow_kind: "membership",
          directed: false,
          weight: 1,
          weight_norm: 1,
          type: "membership",
          timeline_month: node.timeline_month,
          synthetic: true,
        });
      });
    }

    return {
      nodes: displayNodes,
      edges: displayEdges,
      communityIds: visibleCommunityIds,
      focusCommunityId,
    };
  }

  function nodeRadius(node) {
    if (isCommunityNode(node)) {
      return Math.min(26 + Math.sqrt(node.member_count || 1) * 3.8, 54);
    }
    const degree = state.linksByNode.get(node.id)?.length || 0;
    return clamp(7 + Math.sqrt(degree) * 2.2 + (node.importance || 0) * 0.9, 8, 34);
  }

  function buildIndexes(nodes, edges) {
    state.nodeById = new Map(nodes.map((node) => [node.id, node]));
    state.linksByNode = new Map(nodes.map((node) => [node.id, []]));
    edges.forEach((edge) => {
      const sourceId = typeof edge.source === "object" ? edge.source.id : edge.source;
      const targetId = typeof edge.target === "object" ? edge.target.id : edge.target;
      edge.sourceId = sourceId;
      edge.targetId = targetId;
      const sourceNode = state.nodeById.get(sourceId);
      const targetNode = state.nodeById.get(targetId);
      if (!sourceNode || !targetNode) {
        return;
      }
      state.linksByNode.get(sourceId)?.push(edge);
      state.linksByNode.get(targetId)?.push(edge);
    });

    nodes.forEach((node) => {
      node.type = sanitizeType(node.type || (isCommunityNode(node) ? "community" : "topic"));
      node.renderRadius = nodeRadius(node);
      node.search_text = node.search_text || `${node.label || ""} ${node.subtitle || ""} ${node.description || ""}`.toLowerCase();
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
        node.x = null;
        node.y = null;
      }
    });
  }

  function communityCenters(width, height, communityIds, focusCommunityId = null) {
    const orderedIds = sortCommunities(communityIds);
    const centers = new Map();
    const count = Math.max(orderedIds.length, 1);
    const radiusX = width * 0.42;
    const radiusY = height * 0.36;
    orderedIds.forEach((communityId, index) => {
      let angle = (-Math.PI / 2) + (Math.PI * 2 * index) / count;
      let x = width / 2 + Math.cos(angle) * radiusX;
      let y = height / 2 + Math.sin(angle) * radiusY;
      if (focusCommunityId != null && communityId === focusCommunityId) {
        x = width * 0.47;
        y = height * 0.5;
      } else if (focusCommunityId != null) {
        angle = (-Math.PI / 2) + (Math.PI * 2 * index) / count;
        x = width * 0.72 + Math.cos(angle) * width * 0.16;
        y = height * 0.5 + Math.sin(angle) * height * 0.28;
      }
      centers.set(communityId, { x, y });
    });
    return centers;
  }

  function yearBandTarget(node, width) {
    const year = Number.parseInt(node.year || String(node.timeline_month || "").slice(0, 4), 10) || state.minYear;
    const ratio = (year - state.minYear) / Math.max(state.maxYear - state.minYear, 1);
    return { x: 90 + (width - 180) * ratio, y: 86 };
  }

  function memberOffset(node, siblings) {
    const ordered = [...siblings].sort((left, right) => {
      return nodeMonthIndex(left) - nodeMonthIndex(right) ||
        (left.node_type === "story" ? -1 : 1) - (right.node_type === "story" ? -1 : 1) ||
        left.id.localeCompare(right.id);
    });
    const index = Math.max(ordered.findIndex((candidate) => candidate.id === node.id), 0);
    const angle = (-Math.PI / 2) + index * 0.52;
    const band = node.node_type === "story" ? 0.58 : 1;
    const radius = 36 + Math.floor(index / 8) * 16;
    return {
      x: Math.cos(angle) * radius * band,
      y: Math.sin(angle) * radius * (node.node_type === "story" ? 0.75 : 1.1),
    };
  }

  function denseGroupOffset(node, spreadProfile, assignedTargets) {
    if (!spreadProfile?.largeGroup) {
      return null;
    }

    if (spreadProfile.tier === "primary") {
      const angle = (-Math.PI / 2) + (Math.PI * 2 * spreadProfile.indexWithinTier) / Math.max(spreadProfile.primaryCount, 1);
      const radius = 90 + spreadProfile.indexWithinTier * 18;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.82,
      };
    }

    const leaderTarget = spreadProfile.leaderId ? assignedTargets.get(spreadProfile.leaderId) : null;
    if (!leaderTarget) {
      return null;
    }

    if (spreadProfile.tier === "secondary") {
      const secondaryOrbit = Math.max(Math.min(spreadProfile.secondaryCount, 5), 3);
      const angle = (-Math.PI / 2) + (Math.PI * 2 * (spreadProfile.indexWithinTier % secondaryOrbit)) / secondaryOrbit;
      const radius = 44 + Math.floor(spreadProfile.indexWithinTier / secondaryOrbit) * 12;
      return {
        x: leaderTarget.x + Math.cos(angle) * radius,
        y: leaderTarget.y + Math.sin(angle) * radius * 0.86,
        absolute: true,
      };
    }

    const angle = spreadProfile.rank * 2.399963229728653;
    const radius = 18 + Math.floor(spreadProfile.indexWithinTier / 6) * 7;
    return {
      x: leaderTarget.x + Math.cos(angle) * radius,
      y: leaderTarget.y + Math.sin(angle) * radius * 0.9,
      absolute: true,
    };
  }

  function buildLayoutTargets(width, height, displayGraph) {
    const targets = new Map();
    const orphanIds = new Set();
    const communityIds = displayGraph.communityIds || [];
    const centers = communityCenters(width, height, communityIds, displayGraph.focusCommunityId);
    const displayNodes = displayGraph.nodes;
    const membersByCommunity = communityMembersFromRawNodes(
      displayNodes.filter((node) => nodeCommunityId(node) != null && !isCommunityNode(node))
    );
    const spreadMap = buildCommunitySpreadMap(membersByCommunity);
    const localFocusLayout = buildLocalFocusTargets(displayNodes, width, height);

    if (state.lens === "chronological") {
      const communities = sortCommunities(communityIds);
      const laneByCommunity = new Map(communities.map((communityId, index) => [communityId, index]));
      const laneCount = Math.max(communities.length, 1);
      const leftPad = 92;
      const topPad = 120;
      const usableWidth = Math.max(width - 170, 260);
      const usableHeight = Math.max(height - 180, 200);
      const rowGap = laneCount > 1 ? usableHeight / (laneCount - 1) : 0;
      displayNodes.forEach((node) => {
        if (node.type === "year") {
          targets.set(node.id, yearBandTarget(node, width));
          return;
        }
        const ratio = (nodeMonthIndex(node) - state.monthFloor) / Math.max(state.monthCeiling - state.monthFloor, 1);
        const laneIndex = laneByCommunity.get(nodeCommunityId(node)) ?? 0;
        const laneY = topPad + laneIndex * rowGap;
        targets.set(node.id, {
          x: leftPad + usableWidth * ratio,
          y: laneY + (node.node_type === "story" ? -18 : 18),
        });
      });
      return { targets, orphanIds };
    }

    if (state.lens === "orphans") {
      const orphanNodes = displayNodes.filter((node) => (state.linksByNode.get(node.id)?.filter((edge) => !edge.synthetic).length || 0) <= 1 && node.type !== "year");
      const orphanCount = Math.max(orphanNodes.length, 1);
      const ringRadius = Math.min(width, height) * 0.42;
      orphanNodes.forEach((node, index) => {
        orphanIds.add(node.id);
        const angle = (-Math.PI / 2) + (Math.PI * 2 * index) / orphanCount;
        targets.set(node.id, {
          x: width / 2 + Math.cos(angle) * ringRadius,
          y: height / 2 + Math.sin(angle) * ringRadius,
        });
      });
    }

    const positionedNodes = [...displayNodes].sort((left, right) => {
      const leftProfile = spreadMap.get(left.id);
      const rightProfile = spreadMap.get(right.id);
      const tierWeight = (profile) => {
        if (!profile?.largeGroup) {
          return 9;
        }
        if (profile.tier === "primary") {
          return 0;
        }
        if (profile.tier === "secondary") {
          return 1;
        }
        return 2;
      };
      return tierWeight(leftProfile) - tierWeight(rightProfile) ||
        (leftProfile?.rank ?? 999) - (rightProfile?.rank ?? 999) ||
        left.id.localeCompare(right.id);
    });

    positionedNodes.forEach((node) => {
      if (targets.has(node.id)) {
        return;
      }
      if (node.type === "year") {
        targets.set(node.id, yearBandTarget(node, width));
        return;
      }
      if (isCommunityNode(node)) {
        targets.set(node.id, centers.get(nodeCommunityId(node)) || { x: width / 2, y: height / 2 });
        return;
      }

      if (localFocusLayout?.targets.has(node.id)) {
        targets.set(node.id, localFocusLayout.targets.get(node.id));
        return;
      }

      const communityId = nodeCommunityId(node);
      const center = centers.get(communityId) || { x: width / 2, y: height / 2 };
      const siblings = membersByCommunity.get(communityId) || [node];
      const spreadProfile = spreadMap.get(node.id);
      const denseOffset = denseGroupOffset(node, spreadProfile, targets);
      const lensMultiplier = state.lens === "clusters" ? 1.22 : (state.lens === "local" ? 1.08 : 0.92);
      if (denseOffset?.absolute) {
        targets.set(node.id, {
          x: center.x + (denseOffset.x - center.x) * lensMultiplier,
          y: center.y + (denseOffset.y - center.y) * lensMultiplier,
        });
        return;
      }

      const offset = denseOffset || memberOffset(node, siblings);
      targets.set(node.id, {
        x: center.x + offset.x * lensMultiplier,
        y: center.y + offset.y * lensMultiplier,
      });
    });

    return { targets, orphanIds };
  }

  function seedNodePositions(nodes, targets) {
    nodes.forEach((node, index) => {
      // Ensure existing coordinates are valid
      if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
        return;
      }

      const target = targets.get(node.id) || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const angle = index * 2.39996;
      const scatterRadius = node.renderRadius > 24 ? 34 : 18;

      // Seed with target position plus a small organic scatter
      node.x = (target.x || window.innerWidth / 2) + Math.cos(angle) * scatterRadius;
      node.y = (target.y || window.innerHeight / 2) + Math.sin(angle) * scatterRadius;

      // Final NaN safety check
      if (!Number.isFinite(node.x)) node.x = window.innerWidth / 2;
      if (!Number.isFinite(node.y)) node.y = window.innerHeight / 2;
    });
  }

  function currentDisplayGraphSnapshot() {
    const communityIds = sortCommunities(
      [...new Set(
        state.nodes
          .filter((node) => isCommunityNode(node))
          .map((node) => nodeCommunityId(node))
          .filter((communityId) => communityId != null)
      )]
    );
    return {
      nodes: state.nodes,
      edges: state.edges,
      communityIds,
      focusCommunityId: state.selectedCommunityId ?? state.pinnedCommunityId ?? state.autoExpandedCommunityId ?? null,
    };
  }

  function reseedInvalidDisplayNodes(displayGraph) {
    const rect = currentSvgRect();
    const width = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : window.innerWidth;
    const height = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : window.innerHeight;
    const { targets } = buildLayoutTargets(width, height, displayGraph);
    state.nodes.forEach((node, index) => {
      if (Number.isFinite(node.x) && Number.isFinite(node.y) && Math.abs(node.x) <= 5000 && Math.abs(node.y) <= 5000) {
        return;
      }
      const target = targets.get(node.id) || { x: width / 2, y: height / 2 };
      const angle = index * 2.39996;
      const scatterRadius = isCommunityNode(node) ? 12 : Math.max(10, Math.min(node.renderRadius || 12, 18));
      node.x = target.x + Math.cos(angle) * scatterRadius;
      node.y = target.y + Math.sin(angle) * scatterRadius;
      node.vx = 0;
      node.vy = 0;
    });
  }

  function layoutStrength(node, axis, orphanIds) {
    if (state.lens === "chronological") {
      return axis === "x" ? 0.35 : 0.25;
    }
    if (state.lens === "orphans" && orphanIds.has(node.id)) {
      return 0.22;
    }
    if (isCommunityNode(node)) {
      return 0.22;
    }
    if (state.lens === "local") {
      if (node.id === state.selectedId) {
        return 0.45; // Stronger center pull
      }
      return nodeCommunityId(node) === state.selectedCommunityId ? 0.32 : 0.22;
    }
    if (state.lens === "signal") {
      return axis === "x" ? 0.16 : 0.14;
    }
    if (state.lens === "clusters") {
      return 0.18;
    }
    return 0.15;
  }

  function linkDistance(edge) {
    if (edge.synthetic) {
      return EDGE_STYLES.membership.distance;
    }
    const source = state.nodeById.get(edge.sourceId);
    const target = state.nodeById.get(edge.targetId);
    let distance = edgeStyle(edge).distance;
    if (isCommunityNode(source) || isCommunityNode(target)) {
      distance += 34;
    }
    const sourceCommunityId = nodeCommunityId(source);
    const targetCommunityId = nodeCommunityId(target);
    if (sourceCommunityId != null && sourceCommunityId === targetCommunityId) {
      distance *= 0.82;
    } else if (source && target && sourceCommunityId !== targetCommunityId) {
      distance *= 3.5;
    }

    if (source && target && sourceCommunityId != null && sourceCommunityId === targetCommunityId) {
      const sourceDegree = visibleNodeDegree(source.id);
      const targetDegree = visibleNodeDegree(target.id);
      const rankA = Math.min(sourceDegree, targetDegree);
      const rankB = Math.max(sourceDegree, targetDegree);
      if (rankA >= 8 && rankB >= 8) {
        distance *= 1.55;
      } else if (rankB >= 8) {
        distance *= 0.72;
      } else if (rankB >= 4) {
        distance *= 0.9;
      }
    }

    if (state.lens === "chronological") {
      distance += Math.min(140, Math.abs(nodeMonthIndex(source) - nodeMonthIndex(target)) * 2.1);
    }
    if (state.lens === "local" && source && target && (source.id === state.selectedId || target.id === state.selectedId)) {
      distance *= 0.68; // Tighter ego core
    }
    return distance / Math.max(0.78, edge.weight_norm || 1);
  }

  function linkStrength(edge) {
    if (edge.synthetic) {
      return EDGE_STYLES.membership.strength;
    }
    let strength = edgeStyle(edge).strength + Math.min(0.18, (edge.weight_norm || 1) * 0.08);
    if (state.lens === "chronological" && edge.flow_kind === "context") {
      strength += 0.05;
    }
    if (edge.flow_kind === "support") {
      strength -= 0.015;
    }
    const source = state.nodeById.get(edge.sourceId);
    const target = state.nodeById.get(edge.targetId);
    const sourceCommunityId = nodeCommunityId(source);
    const targetCommunityId = nodeCommunityId(target);
    if (source && target && sourceCommunityId !== targetCommunityId) {
      strength *= 0.08;
    } else if (source && target && sourceCommunityId != null && sourceCommunityId === targetCommunityId) {
      const sourceDegree = visibleNodeDegree(source.id);
      const targetDegree = visibleNodeDegree(target.id);
      const maxDegree = Math.max(sourceDegree, targetDegree);
      if (maxDegree >= 8) {
        strength *= 0.92;
      } else if (maxDegree <= 2) {
        strength *= 1.1;
      }
    }

    if (state.lens === "local" && source && target && (source.id === state.selectedId || target.id === state.selectedId)) {
      strength *= 1.16;
    }

    return Math.max(0.03, strength);
  }

  function rebuildSimulation(displayGraph) {
    if (state.simulation) {
      state.simulation.stop();
    }

    const rect = currentSvgRect();
    const width = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : window.innerWidth;
    const height = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : window.innerHeight;
    const { targets, orphanIds } = buildLayoutTargets(width, height, displayGraph);
    seedNodePositions(state.nodes, targets);

    state.simulation = d3.forceSimulation(state.nodes)
      .force("link", d3.forceLink(state.edges)
        .id((node) => node.id)
        .distance(linkDistance)
        .strength(linkStrength))
      .force("charge", d3.forceManyBody()
        .strength((node) => {
          const degree = visibleNodeDegree(node.id);
          let base = CONFIG.baseCharge - degree * 12;
          if (degree >= 10) {
            base -= 300;
          } else if (degree >= 6) {
            base -= 100;
          } else if (degree <= 2) {
            base += 90;
          }
          if (isCommunityNode(node)) {
            base *= 1.18;
          }
          if (state.lens === "chronological") {
            base -= 28;
          }
          if (state.lens === "orphans" && orphanIds.has(node.id)) {
            base -= 44;
          }
          return base;
        })
        .distanceMax(state.lens === "orphans" ? 820 : 640))
      .force("x", d3.forceX((node) => targets.get(node.id)?.x ?? width / 2).strength((node) => layoutStrength(node, "x", orphanIds)))
      .force("y", d3.forceY((node) => targets.get(node.id)?.y ?? height / 2).strength((node) => layoutStrength(node, "y", orphanIds)))
      .force("radial", state.lens === "orphans"
        ? d3.forceRadial((node) => (orphanIds.has(node.id) ? Math.min(width, height) * 0.42 : Math.min(width, height) * 0.18), width / 2, height / 2)
          .strength((node) => (orphanIds.has(node.id) ? 0.12 : 0.04))
        : null)
      .force("collide", d3.forceCollide()
        .radius((node) => {
          const degree = visibleNodeDegree(node.id);
          const spread = degree >= 10 ? 14 : degree >= 6 ? 10 : 6;
          return node.renderRadius + (isCommunityNode(node) ? 12 : spread);
        })
        .strength(0.88)
        .iterations(state.nodes.length > 420 ? 1 : 2))
      .alphaDecay(CONFIG.alphaDecay)
      .alphaMin(CONFIG.alphaMin)
      .velocityDecay(CONFIG.velocityDecay)
      .on("tick", renderTick);

    const warmupTicks = state.nodes.length > 360 ? 14 : 10;
    for (let index = 0; index < warmupTicks; index += 1) {
      state.simulation.tick();
    }
    renderTick();

    if (state.initialFitPending && !state.is3DMode) {
      window.setTimeout(() => {
        zoomToFitAll();
        state.initialFitPending = false;
      }, 420);
    }

    if (state.isPaused || state.is3DMode) {
      state.simulation.stop();
    }
  }

  function updateGraphLayers() {
    const nodeJoin = state.hitLayer.selectAll("g.graph-node").data(state.nodes, (node) => node.id);
    nodeJoin.exit().remove();

    const nodeEnter = nodeJoin.enter()
      .append("g")
      .attr("class", "graph-node")
      .call(buildDrag())
      .on("click", (_event, node) => onNodeClick(node))
      .on("mouseenter", (_event, node) => onNodeHover(node))
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
      .attr("fill", "rgba(255,240,238,0.74)")
      .style("pointer-events", "none");

    state.nodeSelection = nodeEnter.merge(nodeJoin);
    state.nodeSelection.select("circle").attr("r", (node) => node.renderRadius + 12);
    state.nodeSelection.select("text")
      .text((node) => (node.label || "").slice(0, 24))
      .attr("dy", (node) => -(node.renderRadius + 12));

    const edgeJoin = state.edgeLayer.selectAll("line.graph-edge").data(state.edges, (edge) => edge.id);
    edgeJoin.exit().remove();
    const edgeEnter = edgeJoin.enter().append("line").attr("class", "graph-edge");
    state.edgeSelection = edgeEnter.merge(edgeJoin);

    applySelectionVisuals();
  }

  function renderTick() {
    if (!state.edgeSelection || !state.nodeSelection) {
      return;
    }
    state.edgeSelection
      .attr("x1", (edge) => edge.source.x)
      .attr("y1", (edge) => edge.source.y)
      .attr("x2", (edge) => edge.target.x)
      .attr("y2", (edge) => edge.target.y);

    state.nodeSelection.attr("transform", (node) => `translate(${node.x},${node.y})`);
    const zoomLevel = state.currentTransform.k || 1;
    state.nodeSelection.select("text")
      .attr("opacity", (node) => {
        if (isCommunityNode(node)) {
          return 0.9;
        }
        if (node.id === state.selectedId || state.highlightedIds.has(node.id)) {
          return 0.96;
        }
        if (zoomLevel > 1.6 || node.importance >= 4 || (state.linksByNode.get(node.id)?.length || 0) >= 10) {
          return 0.72;
        }
        return 0;
      });

    drawNodesCanvas();
    applySelectionVisuals();
  }

  function drawNodesCanvas() {
    const rect = syncCanvasSize(refs.nodeCanvas, nodeCtx);
    nodeCtx.clearRect(0, 0, rect.width, rect.height);
    nodeCtx.save();
    nodeCtx.translate(state.currentTransform.x, state.currentTransform.y);
    nodeCtx.scale(state.currentTransform.k, state.currentTransform.k);

    const nodes = [...state.nodes].sort((left, right) => left.renderRadius - right.renderRadius);
    nodes.forEach((node) => {
      const nodeAttention = state.attentionNodes[node.id] || 0;
      const communityId = nodeCommunityId(node);
      const clusterAttention = communityId != null ? (state.attentionCommunities[communityId] || 0) : 0;
      const highlighted = !state.highlightedIds.size || state.highlightedIds.has(node.id) || (isCommunityNode(node) && communityId === state.selectedCommunityId);
      const alpha = highlighted ? 0.94 : 0.22;
      const outerGlow = 10 + nodeAttention * 24 + clusterAttention * 16;
      const baseColor = isCommunityNode(node) ? node.community_color : node.color;
      const coreColor = isCommunityNode(node) ? hexToRgba(baseColor, 0.18 + clusterAttention * 0.22) : hexToRgba(baseColor, alpha * 0.88);

      nodeCtx.save();
      nodeCtx.globalAlpha = alpha;
      nodeCtx.shadowColor = baseColor;
      nodeCtx.shadowBlur = outerGlow;
      nodeCtx.beginPath();
      nodeCtx.arc(node.x, node.y, node.renderRadius, 0, Math.PI * 2);
      nodeCtx.fillStyle = coreColor;
      nodeCtx.fill();
      nodeCtx.restore();

      nodeCtx.beginPath();
      nodeCtx.arc(node.x, node.y, node.renderRadius, 0, Math.PI * 2);
      nodeCtx.lineWidth = isCommunityNode(node) ? 2.2 : 1.4;
      nodeCtx.strokeStyle = hexToRgba(node.community_color || baseColor, node.id === state.selectedId ? 0.98 : 0.42);
      nodeCtx.stroke();

      if (node.id === state.selectedId) {
        nodeCtx.beginPath();
        nodeCtx.arc(node.x, node.y, node.renderRadius + 6, 0, Math.PI * 2);
        nodeCtx.lineWidth = 2;
        nodeCtx.strokeStyle = hexToRgba("#fff5f2", 0.9);
        nodeCtx.stroke();
      }
    });

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

  function animateFrame() {
    if (state.is3DMode || state.isPaused) {
      state.animationFrameId = null;
      return;
    }
    updateAttention();
    state.activeSignals.forEach((signal) => signal.update());
    state.activeSignals = state.activeSignals.filter((signal) => signal.alive);
    updateStats();
    drawNodesCanvas();
    drawSignalsCanvas();
    state.animationFrameId = window.requestAnimationFrame(animateFrame);
  }

  function startAnimationLoop() {
    if (state.animationFrameId || state.is3DMode || state.isPaused) {
      return;
    }
    state.animationFrameId = window.requestAnimationFrame(animateFrame);
  }

  function stopAnimationLoop() {
    if (state.animationFrameId) {
      window.cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }
  }

  function choosePulseEdge() {
    const edges = state.edges.filter((edge) => {
      if (edge.synthetic) {
        return false;
      }

      const source = state.nodeById.get(edge.sourceId);
      const target = state.nodeById.get(edge.targetId);
      if (!source || !target) return false;

      // User requested: ONLY fire signals into other communities (inter-community flow)
      if (nodeCommunityId(source) === nodeCommunityId(target)) {
        return false;
      }

      if (edge.flow_kind === "support") {
        return state.lens === "local" && state.localSupportExpanded;
      }
      return edge.directed;
    });

    if (!edges.length) {
      return null;
    }

    let total = 0;
    const weighted = edges.map((edge) => {
      const source = state.nodeById.get(edge.sourceId);
      const target = state.nodeById.get(edge.targetId);
      if (!source || !target) {
        return { edge, weight: 0 };
      }
      const recency = 1 + (nodeMonthIndex(source) - state.monthFloor) / Math.max(state.monthCeiling - state.monthFloor, 1);
      const degreeWeight = 1 + Math.max(source.out_degree || 0, state.linksByNode.get(source.id)?.length || 0) * 0.08;
      const lensBoost = state.lens === "signal" ? 1.18 : 1;
      const weight = Math.max(0.05, (edge.weight_norm || 1) * recency * degreeWeight * lensBoost);
      total += weight;
      return { edge, weight };
    });

    let cursor = Math.random() * total;
    for (const item of weighted) {
      cursor -= item.weight;
      if (cursor <= 0) {
        return item.edge;
      }
    }
    return weighted[weighted.length - 1]?.edge || null;
  }

  function spawnSignal() {
    if (state.is3DMode || state.isPaused || state.activeSignals.length >= CONFIG.maxSignals) {
      return;
    }
    const edge = choosePulseEdge();
    if (!edge) {
      return;
    }
    const source = state.nodeById.get(edge.sourceId);
    const target = state.nodeById.get(edge.targetId);
    if (!source || !target || !Number.isFinite(source.x) || !Number.isFinite(target.x)) {
      return;
    }
    state.activeSignals.push(new SignalPulse(source, target, edgeStyle(edge).color));
    activateNode(source, 0.16);
  }

  function startPulseLoop() {
    if (state.pulseIntervalId || state.is3DMode || state.isPaused) {
      return;
    }
    const interval = Math.max(110, Math.round(360 / Math.max(state.signalSpeed, 0.25)));
    state.pulseIntervalId = window.setInterval(spawnSignal, interval);
  }

  function stopPulseLoop() {
    if (state.pulseIntervalId) {
      window.clearInterval(state.pulseIntervalId);
      state.pulseIntervalId = null;
    }
  }

  function restartAmbientLoops() {
    stopPulseLoop();
    stopAnimationLoop();
    if (!state.is3DMode && !state.isPaused) {
      startPulseLoop();
      startAnimationLoop();
    }
  }

  function activateNode(node, magnitude = 0.28) {
    state.attentionNodes[node.id] = Math.min(1, (state.attentionNodes[node.id] || 0) + magnitude);
    const communityId = nodeCommunityId(node);
    if (communityId != null) {
      state.attentionCommunities[communityId] = Math.min(1, (state.attentionCommunities[communityId] || 0) + magnitude * 0.75);
    }
    if (state.rippleLayer) {
      const ripple = state.rippleLayer.append("circle")
        .attr("cx", node.x)
        .attr("cy", node.y)
        .attr("r", node.renderRadius)
        .attr("fill", "none")
        .attr("stroke", node.community_color || node.color)
        .attr("stroke-width", 1.5)
        .attr("class", "node-ripple");
      window.setTimeout(() => ripple.remove(), 900);
    }
  }

  function updateAttention() {
    Object.keys(state.attentionNodes).forEach((nodeId) => {
      state.attentionNodes[nodeId] *= CONFIG.attentionDecay;
      if (state.attentionNodes[nodeId] < 0.01) {
        delete state.attentionNodes[nodeId];
      }
    });
    Object.keys(state.attentionCommunities).forEach((communityId) => {
      state.attentionCommunities[communityId] *= CONFIG.attentionDecay;
      if (state.attentionCommunities[communityId] < 0.01) {
        delete state.attentionCommunities[communityId];
      }
    });
    state.activeSignals.forEach((signal) => {
      activateNode(signal.source, 0.08);
    });
  }

  function updateSelectionState(nodeId) {
    state.selectedId = nodeId;
    const selectedNode = state.nodeById.get(nodeId);
    state.selectedCommunityId = nodeCommunityId(selectedNode) ?? (String(nodeId || "").startsWith("community:") ? Number.parseInt(String(nodeId).split(":")[1], 10) : null);
    const related = new Set([nodeId]);

    state.edges.forEach((edge) => {
      if (edge.sourceId === nodeId) {
        related.add(edge.targetId);
      }
      if (edge.targetId === nodeId) {
        related.add(edge.sourceId);
      }
    });

    const selectedCommunityId = nodeCommunityId(selectedNode);
    if (selectedCommunityId != null) {
      state.nodes.forEach((node) => {
        if (nodeCommunityId(node) === selectedCommunityId) {
          related.add(node.id);
        }
      });
    }

    state.highlightedIds = related;
    applySelectionVisuals();
    updateSupportToggle();
  }

  function clearSelection() {
    state.selectedId = null;
    state.selectedCommunityId = null;
    state.highlightedIds = new Set();
    state.pinnedCommunityId = null;
    state.localSupportExpanded = false;
    state.autoExpandedCommunityId = state.lens === "global" ? state.autoExpandedCommunityId : null;
    setPanelState("right", false);
    refs.detailBadge.textContent = "Graph";
    refs.detailTitle.textContent = "AI Signal Graph";
    refs.detailSubtitle.textContent = "Select a node to inspect it.";
    refs.detailCopy.textContent = "The graph reads as communities, directed signal flow, and a navigable timeline of stories and entities.";
    refs.detailMeta.innerHTML = "";
    refs.detailTags.innerHTML = "";
    refs.detailEntities.innerHTML = "";
    refs.detailRelated.innerHTML = "";
    refs.detailLink.href = "/stories";
    refs.detailLink.textContent = "OPEN RECORD";
    updateSupportToggle();
    applySelectionVisuals();
    if (state.lens === "global" || state.lens === "signal" || state.lens === "local") {
      applyFilters();
    }
  }

  function edgeOpacity(edge) {
    const style = edgeStyle(edge);
    if (!state.highlightedIds.size) {
      return style.opacity;
    }
    const active = state.highlightedIds.has(edge.sourceId) && state.highlightedIds.has(edge.targetId);
    return active ? Math.min(0.92, style.opacity + 0.45) : Math.max(0.025, style.opacity * 0.22);
  }

  function applySelectionVisuals() {
    if (!state.edgeSelection || !state.nodeSelection) {
      return;
    }
    state.edgeSelection
      .attr("stroke", (edge) => edgeStyle(edge).color)
      .attr("stroke-width", (edge) => edge.synthetic ? 0.6 : edgeStyle(edge).width + (edge.weight_norm || 1) * 0.65)
      .attr("stroke-dasharray", (edge) => edgeStyle(edge).dash || null)
      .attr("stroke-opacity", (edge) => edgeOpacity(edge));

    state.nodeSelection.select("circle")
      .attr("stroke", (node) => node.id === state.selectedId ? hexToRgba("#fff7f5", 0.9) : "transparent")
      .attr("stroke-width", (node) => (node.id === state.selectedId ? 1.8 : 0));

    state.nodeSelection.select("text")
      .attr("fill", (node) => (!state.highlightedIds.size || state.highlightedIds.has(node.id) ? "rgba(255,244,242,0.86)" : "rgba(255,244,242,0.22)"));

    drawNodesCanvas();
  }

  function renderCommunityPanel(node) {
    const community = state.rawCommunityById.get(nodeCommunityId(node));
    if (!community) {
      return;
    }
    refs.detailBadge.textContent = "COMMUNITY";
    refs.detailTitle.textContent = community.label;
    refs.detailSubtitle.textContent = `${community.story_count} stories · ${community.entity_count} entities`;
    refs.detailCopy.textContent = "Collapsed region of the graph. Pinning it expands member nodes while preserving the surrounding community map.";
    refs.detailMeta.innerHTML = `
      <div><span class="label">Nodes</span><div>${community.node_ids.length}</div></div>
      <div><span class="label">Stories</span><div>${community.story_count}</div></div>
      <div><span class="label">Entities</span><div>${community.entity_count}</div></div>
    `;
    refs.detailTags.innerHTML = (community.dominant_types || []).map((typeName) => (
      `<span class="hud-badge" style="border-color:${hexToRgba(node.community_color, 0.34)}; color:${node.community_color};">${typeName}</span>`
    )).join("");
    refs.detailEntities.innerHTML = "";
    refs.detailRelated.innerHTML = (community.anchor_story_ids || []).length
      ? `<div class="label">Anchor stories</div>${community.anchor_story_ids.map((storyNodeId) => {
        const storyNode = state.rawNodeById.get(storyNodeId);
        return storyNode ? `<a href="${storyNode.route}">${storyNode.label}</a>` : "";
      }).join("")}`
      : `<div class="graph-empty">No anchor stories in the current slice.</div>`;
    refs.detailLink.href = community.anchor_story_ids[0] ? (state.rawNodeById.get(community.anchor_story_ids[0])?.route || "/stories") : "/stories";
    refs.detailLink.textContent = "OPEN ANCHOR";
    setPanelState("right", true);
    updateSupportToggle();
  }

  function renderEntityPanel(node) {
    refs.detailBadge.textContent = (node.type || "node").toUpperCase();
    refs.detailTitle.textContent = node.label;
    refs.detailSubtitle.textContent = node.subtitle || "";
    refs.detailCopy.textContent = node.description || "";
    refs.detailMeta.innerHTML = `
      <div><span class="label">Type</span><div>${node.type}</div></div>
      <div><span class="label">Cluster</span><div>${node.cluster_id != null ? `C${node.cluster_id + 1}` : "Timeline"}</div></div>
      <div><span class="label">Outflow</span><div>${node.out_degree || 0}</div></div>
    `;
    refs.detailTags.innerHTML = `
      <span class="hud-badge" style="border-color:${hexToRgba(node.community_color || node.color, 0.35)}; color:${node.community_color || node.color};">${node.group || node.type}</span>
    `;
    refs.detailEntities.innerHTML = "";
    const related = state.edges
      .filter((edge) => edge.sourceId === node.id || edge.targetId === node.id)
      .slice(0, 10)
      .map((edge) => {
        const otherId = edge.sourceId === node.id ? edge.targetId : edge.sourceId;
        const other = state.nodeById.get(otherId);
        if (!other) {
          return "";
        }
        return `<a href="#" data-node-id="${other.id}">${other.label}</a>`;
      })
      .filter(Boolean);
    refs.detailRelated.innerHTML = related.length
      ? `<div class="label">Visible links</div>${related.join("")}`
      : `<div class="graph-empty">No visible links in the active lens.</div>`;
    refs.detailRelated.querySelectorAll("[data-node-id]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const nextNode = state.nodeById.get(link.dataset.nodeId);
        if (nextNode) {
          onNodeClick(nextNode);
        }
      });
    });
    refs.detailLink.href = node.route || "/entities";
    refs.detailLink.textContent = "OPEN RECORD";
    setPanelState("right", true);
    updateSupportToggle();
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
      return `<a href="#" class="hud-badge" data-node-id="entity:${entity.id}" style="border-color:${hexToRgba(NODE_COLORS[type], 0.34)}; color:${NODE_COLORS[type]}; text-decoration: none; cursor: pointer;">${entity.name}</a>`;
    }).join("");

    // Attach recursive click handlers to entities
    refs.detailEntities.querySelectorAll("[data-node-id]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const nextNode = state.nodeById.get(link.dataset.nodeId);
        if (nextNode) {
          onNodeClick(nextNode);
        } else {
          console.warn("Node not found in current graph state:", link.dataset.nodeId);
        }
      });
    });
    refs.detailRelated.innerHTML = (story.related_stories || []).length
      ? `<div class="label">Related stories</div>${story.related_stories.map((item) => `<a href="/stories/${item.id}">${item.title}</a>`).join("")}`
      : `<div class="graph-empty">No related stories in the current source.</div>`;
    refs.detailLink.href = story.route;
    refs.detailLink.textContent = "OPEN STORY";
    setPanelState("right", true);
    updateSupportToggle();
  }

  function onNodeClick(node) {
    if (isCommunityNode(node)) {
      state.localSupportExpanded = false;
      state.pinnedCommunityId = nodeCommunityId(node);
      updateSelectionState(node.id);
      if (state.lens === "global" || state.lens === "signal" || state.lens === "local") {
        applyFilters();
      }
      renderCommunityPanel(node);
      return;
    }

    state.pinnedCommunityId = (state.lens === "global" || state.lens === "signal") ? (nodeCommunityId(node) ?? null) : state.pinnedCommunityId;
    state.localSupportExpanded = false;
    updateSelectionState(node.id);
    if (state.lens === "local" || state.lens === "global" || state.lens === "signal") {
      applyFilters();
    }
    const nextNode = state.nodeById.get(node.id) || node;
    if (nextNode.node_type === "story") {
      renderStoryPanel(nextNode).catch(() => renderEntityPanel(nextNode));
      return;
    }
    renderEntityPanel(nextNode);
  }

  function onNodeHover(node) {
    activateNode(node, 0.12);
    drawNodesCanvas();
  }

  function onNodeLeave() {
    drawNodesCanvas();
  }

  function viewportCenterGraphSpace() {
    const rect = currentSvgRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    return {
      x: (cx - state.currentTransform.x) / Math.max(state.currentTransform.k, 0.0001),
      y: (cy - state.currentTransform.y) / Math.max(state.currentTransform.k, 0.0001),
    };
  }

  function nearestVisibleCommunityId() {
    const center = viewportCenterGraphSpace();
    let best = null;
    state.nodes.forEach((node) => {
      if (!isCommunityNode(node)) {
        return;
      }
      const dx = (node.x || 0) - center.x;
      const dy = (node.y || 0) - center.y;
      const distance = dx * dx + dy * dy;
      if (!best || distance < best.distance) {
        best = { communityId: nodeCommunityId(node), distance };
      }
    });
    return best?.communityId ?? null;
  }

  function scheduleZoomExpansionUpdate() {
    if (state.lens !== "global" || state.is3DMode || state.pinnedCommunityId != null) {
      return;
    }
    window.clearTimeout(state.zoomExpandTimer);
    state.zoomExpandTimer = window.setTimeout(() => {
      const zoom = state.currentTransform.k || 1;
      let nextCommunityId = state.autoExpandedCommunityId;
      if (zoom >= CONFIG.zoomExpandThreshold) {
        nextCommunityId = nearestVisibleCommunityId();
      } else if (zoom <= CONFIG.zoomCollapseThreshold) {
        nextCommunityId = null;
      }
      if (nextCommunityId !== state.autoExpandedCommunityId) {
        state.autoExpandedCommunityId = nextCommunityId;
        applyFilters();
      }
    }, CONFIG.zoomExpandDebounceMs);
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
    const rect = currentSvgRect();
    const fullWidth = Math.max(bounds.maxX - bounds.minX + 160, 1);
    const fullHeight = Math.max(bounds.maxY - bounds.minY + 160, 1);
    const scale = Math.min(rect.width / fullWidth, rect.height / fullHeight, 1);
    const translateX = (rect.width - scale * (bounds.minX + bounds.maxX)) / 2;
    const translateY = (rect.height - scale * (bounds.minY + bounds.maxY)) / 2;
    refs.svg.transition().duration(650).call(
      state.zoomBehavior.transform,
      d3.zoomIdentity.translate(translateX, translateY).scale(scale)
    );
  }

  function updateStats() {
    refs.statNodes.textContent = String(state.nodes.length);
    refs.statEdges.textContent = String(state.edges.filter((edge) => !edge.synthetic).length);
    refs.statSignals.textContent = String(state.activeSignals.length);
  }

  function isCompactViewport() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function syncPanelButtons() {
    refs.filtersToggle?.setAttribute("aria-expanded", refs.hudLeft.classList.contains("is-open") ? "true" : "false");
    refs.inspectorToggle?.setAttribute("aria-expanded", refs.hudRight.classList.contains("is-open") ? "true" : "false");
  }

  function setPanelState(side, isOpen) {
    const panel = side === "left" ? refs.hudLeft : refs.hudRight;
    if (!panel) {
      return;
    }
    if (isOpen && isCompactViewport()) {
      const other = side === "left" ? refs.hudRight : refs.hudLeft;
      other?.classList.remove("is-open");
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

  function applyFilters() {
    const nextLens = refs.lens.value || "global";
    if (nextLens !== state.lastLens) {
      state.pinnedCommunityId = null;
      state.autoExpandedCommunityId = null;
      state.localSupportExpanded = false;
      state.lastLens = nextLens;
    }
    state.lens = nextLens;
    state.activeSignals = [];

    const rawGraph = filteredRawGraph();
    const rawVisibleIds = new Set(rawGraph.rawNodes.map((node) => node.id));
    if (state.selectedId && !rawVisibleIds.has(state.selectedId) && !String(state.selectedId).startsWith("community:")) {
      state.selectedId = null;
      state.selectedCommunityId = null;
      state.highlightedIds = new Set();
    }

    const displayGraph = buildDisplayGraph(rawGraph.rawNodes, rawGraph.rawEdges);
    state.nodes = displayGraph.nodes;
    state.edges = displayGraph.edges;
    buildIndexes(state.nodes, state.edges);
    updateGraphLayers();
    rebuildSimulation(displayGraph);
    updateStats();
    updateSupportToggle();

    if (state.selectedId && state.nodeById.has(state.selectedId)) {
      updateSelectionState(state.selectedId);
    } else if (!state.selectedId) {
      applySelectionVisuals();
    }

    refs.yearValue.textContent = String(state.activeYear);
    if (state.is3DMode) {
      update3DGraph();
    }
    restartAmbientLoops();
    writeDebug({ stage: "applyFilters" });
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
      }, 1200);
    }
  }

  function toggleSimulation() {
    state.isPaused = !state.isPaused;
    refs.simulationToggle.textContent = state.isPaused ? "▶ RESUME" : "⏸ PAUSE";
    if (state.is3DMode) {
      if (state.isPaused) {
        state.threeGraph?.pauseAnimation?.();
      } else {
        state.threeGraph?.resumeAnimation?.();
      }
    } else if (state.simulation) {
      if (state.isPaused) {
        state.simulation.stop();
      } else {
        state.simulation.alpha(0.18).restart();
      }
    }
    restartAmbientLoops();
  }

  function resizeLayers() {
    const rect = currentSvgRect();
    refs.svg.attr("viewBox", `0 0 ${Math.max(rect.width, 1)} ${Math.max(rect.height, 1)}`);
    drawNodesCanvas();
    drawSignalsCanvas();
    state.threeGraph?.width(window.innerWidth).height(window.innerHeight);
    syncResponsivePanels();
    if (!state.is3DMode) {
      applyFilters();
    }
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

    refs.edgeTypeFilters.innerHTML = Object.entries(EDGE_LABELS).map(([kind, label]) => `
      <label class="hud-check">
        <input type="checkbox" value="${kind}" checked>
        <span>${label}</span>
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
      restartAmbientLoops();
    });
    refs.rebuildButton.addEventListener("click", rebuildGraph);
    refs.simulationToggle.addEventListener("click", toggleSimulation);
    refs.fitButton.addEventListener("click", zoomToFitAll);
    refs.mode3dToggle?.addEventListener("click", () => set3DMode(!state.is3DMode));
    refs.detailClose.addEventListener("click", clearSelection);
    refs.filtersToggle?.addEventListener("click", () => setPanelState("left", !refs.hudLeft.classList.contains("is-open")));
    refs.inspectorToggle?.addEventListener("click", () => setPanelState("right", !refs.hudRight.classList.contains("is-open")));
    window.addEventListener("resize", resizeLayers);
    document.addEventListener("keydown", (event) => {
      if (event.target.tagName === "INPUT" || event.target.tagName === "SELECT" || event.target.tagName === "TEXTAREA") {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        toggleSimulation();
      } else if (event.code === "KeyF") {
        zoomToFitAll();
      } else if (event.code === "Escape") {
        clearSelection();
      }
    });
  }

  function build3DGraphData() {
    const rawGraph = filteredRawGraph();
    const visibleRawIds = new Set();
    if (state.lens === "local") {
      determineLocalNeighborhood(rawGraph.rawNodes, rawGraph.rawEdges).expandedRawIds.forEach((nodeId) => visibleRawIds.add(nodeId));
    } else {
      rawGraph.rawNodes.forEach((node) => visibleRawIds.add(node.id));
    }

    const rawVisibleNodes = rawGraph.rawNodes.filter((node) => visibleRawIds.has(node.id));
    const rawVisibleNodeById = new Map(rawVisibleNodes.map((node) => [node.id, node]));
    const visibleDisplayCommunities = new Map();
    rawVisibleNodes.forEach((node) => {
      const communityId = nodeCommunityId(node);
      if (communityId == null || node.type === "year") {
        return;
      }
      const community = state.rawCommunityById.get(communityId);
      if (community) {
        visibleDisplayCommunities.set(communityId, community);
      }
    });

    const communityRootNodes = state.lens === "chronological"
      ? []
      : [...visibleDisplayCommunities.values()].map((community) => ({
        id: communityNodeId(community.id),
        name: community.label,
        val: Math.max(8, 10 + Math.sqrt(community.node_count || community.node_ids.length || 1) * 1.8),
        color: communityColor(community.id),
        type: "community",
        cluster_id: community.id,
        level: 0,
      }));

    const nodes = [
      ...communityRootNodes,
      ...rawVisibleNodes
        .filter((node) => state.lens === "chronological" || node.type !== "year")
        .map((node) => ({
          id: node.id,
          name: node.label,
          val: Math.max(4, node.renderRadius || nodeRadius(node)),
          color: node.community_color || node.color,
          type: node.type,
          cluster_id: nodeCommunityId(node),
          level: state.lens === "chronological"
            ? (node.type === "year" ? 0 : node.node_type === "story" ? 1 : 2)
            : (node.node_type === "story" ? 1 : 2),
        })),
    ];

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

    const storyNodes = rawVisibleNodes.filter((node) => node.node_type === "story");
    const entityNodes = rawVisibleNodes.filter((node) => node.node_type === "entity" && node.type !== "year");
    const yearNodes = rawVisibleNodes.filter((node) => node.type === "year");

    const mentionEdgesByEntity = new Map();
    rawGraph.rawEdges.forEach((edge) => {
      if (edge.flow_kind !== "mention" || !visibleRawIds.has(edge.sourceId) || !visibleRawIds.has(edge.targetId)) {
        return;
      }
      const sourceNode = rawVisibleNodeById.get(edge.sourceId);
      const targetNode = rawVisibleNodeById.get(edge.targetId);
      if (!sourceNode || !targetNode || sourceNode.node_type !== "story" || targetNode.type === "year") {
        return;
      }
      if (!mentionEdgesByEntity.has(edge.targetId)) {
        mentionEdgesByEntity.set(edge.targetId, []);
      }
      mentionEdgesByEntity.get(edge.targetId).push({ edge, sourceNode, targetNode });
    });

    if (state.lens === "chronological") {
      storyNodes.forEach((storyNode) => {
        const yearNodeId = `entity:year-${(storyNode.year || '').slice(0, 4)}`;
        if (rawVisibleNodeById.has(yearNodeId)) {
          addLink(yearNodeId, storyNode.id, EDGE_STYLES.timeline.color);
        }
      });
      entityNodes.forEach((entityNode) => {
        const candidates = (mentionEdgesByEntity.get(entityNode.id) || []).sort((left, right) => {
          return nodeMonthIndex(left.sourceNode) - nodeMonthIndex(right.sourceNode) ||
            (right.sourceNode.importance || 0) - (left.sourceNode.importance || 0) ||
            left.sourceNode.id.localeCompare(right.sourceNode.id);
        });
        if (candidates.length) {
          addLink(candidates[0].sourceNode.id, entityNode.id, EDGE_STYLES.mention.color);
        }
      });
    } else {
      storyNodes.forEach((storyNode) => {
        const communityId = nodeCommunityId(storyNode);
        if (communityId != null && visibleDisplayCommunities.has(communityId)) {
          addLink(communityNodeId(communityId), storyNode.id, communityColor(communityId));
        }
      });
      entityNodes.forEach((entityNode) => {
        const candidates = (mentionEdgesByEntity.get(entityNode.id) || []).sort((left, right) => {
          const leftSameCommunity = Number(nodeCommunityId(left.sourceNode) === nodeCommunityId(entityNode));
          const rightSameCommunity = Number(nodeCommunityId(right.sourceNode) === nodeCommunityId(entityNode));
          return rightSameCommunity - leftSameCommunity ||
            (right.sourceNode.importance || 0) - (left.sourceNode.importance || 0) ||
            nodeMonthIndex(right.sourceNode) - nodeMonthIndex(left.sourceNode) ||
            left.sourceNode.id.localeCompare(right.sourceNode.id);
        });
        if (candidates.length) {
          addLink(candidates[0].sourceNode.id, entityNode.id, EDGE_STYLES.mention.color);
        } else {
          const communityId = nodeCommunityId(entityNode);
          if (communityId != null && visibleDisplayCommunities.has(communityId)) {
            addLink(communityNodeId(communityId), entityNode.id, communityColor(communityId));
          }
        }
      });
    }

    return { nodes, links };
  }

  function ensure3DGraph() {
    if (state.threeGraph || typeof ForceGraph3D === "undefined") {
      return state.threeGraph;
    }
    state.threeGraph = ForceGraph3D()(refs.container3d)
      .width(window.innerWidth)
      .height(window.innerHeight)
      .backgroundColor("#050505")
      .nodeLabel("name")
      .nodeColor("color")
      .nodeRelSize(5)
      .linkColor("color")
      .linkOpacity(0.28)
      .linkWidth(0.7)
      .onNodeClick((node) => {
        const original = state.nodeById.get(node.id);
        if (original) {
          onNodeClick(original);
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

    // Ensure frame is ready before zoom
    setTimeout(() => {
      if (state.threeGraph && state.is3DMode) {
        state.threeGraph.zoomToFit(800, 150);
      }
    }, 250);

    if (state.isPaused) {
      graph3D.pauseAnimation?.();
    } else {
      graph3D.resumeAnimation?.();
    }
  }

  function set3DMode(nextValue) {
    state.is3DMode = Boolean(nextValue);
    refs.mode3dToggle?.classList.toggle("is-active", state.is3DMode);
    refs.container3d.style.display = state.is3DMode ? "block" : "none";
    refs.svg.node().style.display = state.is3DMode ? "none" : "block";
    refs.nodeCanvas.style.display = state.is3DMode ? "none" : "block";
    refs.signalCanvas.style.display = state.is3DMode ? "none" : "block";

    const shader = document.getElementById("bg-shader");
    if (shader) {
      shader.style.display = state.is3DMode ? "none" : "block";
    }

    if (state.is3DMode) {
      state.simulation?.stop();
      stopPulseLoop();
      stopAnimationLoop();

      // Delay to allow DOM display changes and reflow to settle
      setTimeout(() => {
        if (state.is3DMode) {
          refs.container3d.offsetHeight; // Force reflow
          update3DGraph();
        }
      }, 60);
      return;
    }

    state.threeGraph?.pauseAnimation?.();

    reseedInvalidDisplayNodes(currentDisplayGraphSnapshot());

    if (!state.isPaused) {
      state.simulation?.alpha(0.18).restart();
    }
    drawNodesCanvas();
    drawSignalsCanvas();
    restartAmbientLoops();
  }

  async function loadGraph() {
    const response = await fetch("/api/graph", { headers: { Accept: "application/json" } });
    const payload = await response.json();

    state.rawNodes = payload.nodes.map((node) => ({
      ...node,
      type: sanitizeType(node.type || "topic"),
      color: NODE_COLORS[sanitizeType(node.type || "topic")] || NODE_COLORS.topic,
      community_color: nodeCommunityId(node) != null ? communityColor(nodeCommunityId(node)) : NODE_COLORS.year,
      search_text: `${node.label || ""} ${node.subtitle || ""} ${node.description || ""}`.toLowerCase(),
    }));
    state.rawEdges = payload.edges.map((edge, index) => ({
      ...edge,
      sourceId: edge.source,
      targetId: edge.target,
      id: edge.id || `${edge.source}->${edge.target}:${edge.flow_kind || edge.kind}:${index}`,
    }));
    state.rawCommunities = payload.communities || [];
    state.activeSignals = [];
    state.attentionNodes = {};
    state.attentionCommunities = {};
    buildRawIndexes();

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
    writeDebug({ stage: "loadGraph", rawNodes: state.rawNodes.length, rawEdges: state.rawEdges.length });
  }

  setupFilterControls();
  bindUI();
  syncResponsivePanels();
  ensureSupportToggle();
  loadGraph().catch((error) => fail(error, "loadGraph"));
})();
