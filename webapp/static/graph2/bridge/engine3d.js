"use strict";

import { communityColor, communityNodeId, isCommunityNode, nodeCommunityId } from "../state/store.js";

function build3DGraphData(state) {
  const displayNodes = state.nodes;
  const displayEdges = state.edges;
  const visibleDisplayCommunities = new Map();

  displayNodes.forEach((node) => {
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
      val: Math.max(8, 10 + Math.sqrt(community.node_count || community.node_ids?.length || 1) * 1.8),
      color: communityColor(community.id),
      type: "community",
      cluster_id: community.id,
      route: "/stories",
    }));

  const nodes = [
    ...communityRootNodes,
    ...displayNodes.map((node) => ({
      id: node.id,
      name: node.label,
      val: Math.max(5, node.renderRadius || 8),
      color: node.community_color || node.color,
      type: node.type,
      cluster_id: nodeCommunityId(node),
      route: node.route || "/stories",
    })),
  ];

  const links = [];
  const seen = new Set();
  const addLink = (source, target, color) => {
    const key = `${source}|${target}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    links.push({ source, target, color });
  };

  displayEdges.forEach((edge) => {
    addLink(edge.sourceId, edge.targetId, edge.flow_kind === "support" ? "#5c363a" : "#ff4258");
  });

  displayNodes.forEach((node) => {
    const communityId = nodeCommunityId(node);
    if (communityId != null && visibleDisplayCommunities.has(communityId) && !isCommunityNode(node)) {
      addLink(communityNodeId(communityId), node.id, communityColor(communityId));
    }
  });

  return { nodes, links };
}

export function create3DBridge(state, onNodeClick) {
  let graph3D = null;

  function ensure3DGraph() {
    if (graph3D || typeof ForceGraph3D !== "function" || !state.refs.container3d) {
      return graph3D;
    }

    graph3D = ForceGraph3D()(state.refs.container3d)
      .backgroundColor("rgba(0,0,0,0)")
      .nodeRelSize(1)
      .nodeOpacity(0.98)
      .linkOpacity(0.34)
      .linkDirectionalParticles(0)
      .cooldownTicks(200)
      .onNodeClick((node) => {
        const nextNode = state.nodeById.get(node.id);
        if (nextNode) {
          onNodeClick(nextNode);
        }
      })
      .nodeLabel((node) => node.name || "")
      .linkColor((link) => link.color || "#ff4258")
      .nodeColor((node) => node.color || "#ff4258");

    return graph3D;
  }

  function update() {
    const instance = ensure3DGraph();
    if (!instance) {
      return;
    }
    const graphData = build3DGraphData(state);
    instance
      .dagMode(state.lens === "chronological" ? "td" : "radialout")
      .dagLevelDistance(state.lens === "chronological" ? 160 : 220)
      .graphData(graphData);

    setTimeout(() => {
      if (state.is3DMode && graph3D) {
        graph3D.zoomToFit(800, 150);
      }
    }, 240);

    if (state.isPaused) {
      instance.pauseAnimation?.();
    } else {
      instance.resumeAnimation?.();
    }
  }

  function setMode(is3D) {
    state.is3DMode = Boolean(is3D);
    state.refs.container3d.style.display = state.is3DMode ? "block" : "none";
    state.refs.svg.node().style.display = state.is3DMode ? "none" : "block";
    state.refs.nodeCanvas.style.display = state.is3DMode ? "none" : "block";
    state.refs.signalCanvas.style.display = state.is3DMode ? "none" : "block";

    const shader = document.getElementById("bg-shader");
    if (shader) {
      shader.style.display = state.is3DMode ? "none" : "block";
    }

    if (state.is3DMode) {
      update();
    } else {
      graph3D?.pauseAnimation?.();
    }
  }

  return {
    update,
    setMode,
    ensure3DGraph,
  };
}

