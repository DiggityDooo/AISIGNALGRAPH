"use strict";

import {
  communityNodeId,
  isCommunityNode,
  nodeCommunityId,
  communityColor,
  parseCommunityNodeId,
  nodeMonthIndex,
  nodeYear,
  NODE_COLORS,
} from "../state/store.js";

function rawVisibleNodes(state) {
  return state.rawNodes.filter((node) => {
    if (!state.activeNodeTypes.has(node.type)) {
      return false;
    }
    if (node.type !== "year" && nodeYear(state, node) > state.activeYear) {
      return false;
    }
    if (state.query && !node.search_text.includes(state.query)) {
      return false;
    }
    return true;
  });
}

function rawVisibleEdges(state, visibleNodeIds) {
  return state.rawEdges.filter((edge) => {
    if (!state.activeEdgeKinds.has(edge.flow_kind)) {
      return false;
    }
    if (!visibleNodeIds.has(edge.sourceId) || !visibleNodeIds.has(edge.targetId)) {
      return false;
    }
    return true;
  });
}

function communityMembersFromRawNodes(rawNodes) {
  const byCommunity = new Map();
  rawNodes.forEach((node) => {
    const communityId = nodeCommunityId(node);
    if (communityId == null || node.cluster_role === "timeline" || node.type === "year") {
      return;
    }
    if (!byCommunity.has(communityId)) {
      byCommunity.set(communityId, []);
    }
    byCommunity.get(communityId).push(node);
  });
  return byCommunity;
}

function sortCommunities(state, communityIds) {
  const communities = communityIds
    .map((communityId) => state.rawCommunityById.get(communityId))
    .filter(Boolean);

  if (state.sortMode === "alphabetical") {
    communities.sort((left, right) => left.label.localeCompare(right.label));
  } else if (state.sortMode === "newest") {
    communities.sort((left, right) => {
      const leftAnchor = left.anchor_story_ids?.[0] || "";
      const rightAnchor = right.anchor_story_ids?.[0] || "";
      return nodeMonthIndex(state, state.rawNodeById.get(rightAnchor)) - nodeMonthIndex(state, state.rawNodeById.get(leftAnchor));
    });
  } else {
    communities.sort((left, right) => left.id - right.id);
  }
  return communities.map((community) => community.id);
}

function determineExpandedCommunity(state) {
  if (state.selectedId && String(state.selectedId).startsWith("community:")) {
    return parseCommunityNodeId(state.selectedId);
  }
  if (state.pinnedCommunityId != null) {
    return state.pinnedCommunityId;
  }
  if (state.autoExpandedCommunityId != null) {
    return state.autoExpandedCommunityId;
  }
  return null;
}

function buildDisplayGraph(state, rawNodes, rawEdges) {
  const byCommunity = communityMembersFromRawNodes(rawNodes);
  const visibleCommunityIds = sortCommunities(state, [...byCommunity.keys()]);
  const expandedRawIds = new Set();
  const lens = state.lens;
  const keepCommunityNodes = ["global", "signal", "local"].includes(lens);
  const focusCommunityId = determineExpandedCommunity(state);

  if (lens === "local" && state.selectedId && !String(state.selectedId).startsWith("community:")) {
    expandedRawIds.add(state.selectedId);
    for (const neighborId of state.rawNeighbors.get(state.selectedId) || []) {
      expandedRawIds.add(neighborId);
    }
    const selectedNode = state.rawNodeById.get(state.selectedId);
    const selectedComm = nodeCommunityId(selectedNode);
    if (selectedComm != null) {
      (byCommunity.get(selectedComm) || []).forEach((node) => expandedRawIds.add(node.id));
    }
  } else if (focusCommunityId != null) {
    (byCommunity.get(focusCommunityId) || []).forEach((node) => expandedRawIds.add(node.id));
  } else if (!keepCommunityNodes || lens === "clusters" || lens === "chronological" || lens === "orphans") {
    rawNodes.forEach((node) => expandedRawIds.add(node.id));
  }

  const displayNodes = [];
  const displayNodeById = new Map();
  const addNode = (node) => {
    if (!displayNodeById.has(node.id)) {
      displayNodes.push(node);
      displayNodeById.set(node.id, node);
    }
  };

  if (keepCommunityNodes) {
    visibleCommunityIds.forEach((communityId) => {
      if (focusCommunityId === communityId && expandedRawIds.size > 0) {
        return;
      }
      const community = state.rawCommunityById.get(communityId);
      const members = byCommunity.get(communityId) || [];
      if (!community || !members.length) {
        return;
      }
      addNode({
        id: communityNodeId(communityId),
        label: community.label,
        node_type: "community",
        type: "community",
        group: "community",
        color: NODE_COLORS.community,
        community_color: communityColor(communityId),
        cluster_id: community.parent_cluster_id ?? communityId,
        display_cluster_id: communityId,
        cluster_role: "community",
        member_count: members.length,
        story_count: members.filter((member) => member.node_type === "story").length,
        entity_count: members.filter((member) => member.node_type === "entity").length,
        anchor_story_ids: community.anchor_story_ids || [],
        subtitle: `${members.length} linked records`,
        description: `Collapsed community containing ${members.length} nodes.`,
        route: community.anchor_story_ids?.[0] ? state.rawNodeById.get(community.anchor_story_ids[0])?.route || "/stories" : "/stories",
      });
    });
  }

  rawNodes.forEach((node) => {
    const shouldExpand = expandedRawIds.has(node.id) || node.type === "year" || !keepCommunityNodes;
    if (!shouldExpand && nodeCommunityId(node) != null && node.cluster_role !== "timeline") {
      return;
    }
    addNode({
      ...node,
      community_color: nodeCommunityId(node) != null ? communityColor(nodeCommunityId(node)) : NODE_COLORS.year,
      color: node.color || NODE_COLORS[node.type] || NODE_COLORS.topic,
    });
  });

  const displayIdForRaw = (rawNode) => {
    const communityId = nodeCommunityId(rawNode);
    if (!keepCommunityNodes || rawNode.type === "year" || communityId == null || rawNode.cluster_role === "timeline") {
      return rawNode.id;
    }
    return expandedRawIds.has(rawNode.id) ? rawNode.id : communityNodeId(communityId);
  };

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

    const orderedPair = edge.directed ? [sourceDisplayId, targetDisplayId] : [sourceDisplayId, targetDisplayId].sort();
    const key = `${orderedPair[0]}->${orderedPair[1]}:${edge.flow_kind}:${edge.directed ? "d" : "u"}`;
    if (!aggregatedEdges.has(key)) {
      aggregatedEdges.set(key, {
        id: key,
        sourceId: orderedPair[0],
        targetId: orderedPair[1],
        source: orderedPair[0],
        target: orderedPair[1],
        flow_kind: edge.flow_kind,
        kind: edge.flow_kind,
        directed: Boolean(edge.directed),
        weight: 0,
        weight_norm: 0,
        count: 0,
        synthetic: false,
      });
    }
    const aggregate = aggregatedEdges.get(key);
    aggregate.weight += edge.weight || 1;
    aggregate.weight_norm += edge.weight_norm || 1;
    aggregate.count += 1;
  });

  const displayEdges = [...aggregatedEdges.values()].map((edge) => ({
    ...edge,
    weight_norm: edge.count ? edge.weight_norm / edge.count : 1,
  }));

  if (keepCommunityNodes) {
    rawNodes.forEach((node) => {
      const communityId = nodeCommunityId(node);
      if (communityId == null || node.type === "year" || !expandedRawIds.has(node.id)) {
        return;
      }
      const collapsedId = communityNodeId(communityId);
      if (!displayNodeById.has(collapsedId)) {
        return;
      }
      displayEdges.push({
        id: `${collapsedId}->${node.id}:membership`,
        sourceId: collapsedId,
        targetId: node.id,
        source: collapsedId,
        target: node.id,
        flow_kind: "membership",
        kind: "membership",
        directed: false,
        weight: 1,
        weight_norm: 1,
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

function nodeRadius(node, degree) {
  if (isCommunityNode(node)) {
    return Math.min(26 + Math.sqrt(node.member_count || 1) * 3.8, 54);
  }
  if (node.type === "year") {
    return 16;
  }
  const importance = node.importance || 1;
  return Math.min(12 + importance * 1.9 + Math.sqrt(Math.max(degree, 0)) * 0.9, 30);
}

function communityCenters(state, width, height, communityIds, focusCommunityId = null) {
  const ordered = sortCommunities(state, communityIds);
  const centers = new Map();
  const count = Math.max(ordered.length, 1);
  const radiusX = width * 0.58;
  const radiusY = height * 0.50;
  ordered.forEach((communityId, index) => {
    let angle = (-Math.PI / 2) + (Math.PI * 2 * index) / count;
    let x = width / 2 + Math.cos(angle) * radiusX;
    let y = height / 2 + Math.sin(angle) * radiusY;
    if (focusCommunityId != null && communityId === focusCommunityId) {
      x = width * 0.36;
      y = height * 0.5;
    } else if (focusCommunityId != null) {
      angle = (-Math.PI / 2) + (Math.PI * 2 * index) / count;
      x = width * 0.78 + Math.cos(angle) * width * 0.22;
      y = height * 0.5 + Math.sin(angle) * height * 0.36;
    }
    centers.set(communityId, { x, y });
  });
  return centers;
}

function memberOffset(state, node, siblings) {
  const ordered = [...siblings].sort((left, right) => {
    return nodeMonthIndex(state, left) - nodeMonthIndex(state, right) || left.id.localeCompare(right.id);
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

function buildLayoutTargets(state, displayGraph, width, height) {
  const targets = new Map();
  const communities = communityCenters(state, width, height, displayGraph.communityIds || [], displayGraph.focusCommunityId);
  const membersByCommunity = communityMembersFromRawNodes(displayGraph.nodes.filter((node) => !isCommunityNode(node)));

  displayGraph.nodes.forEach((node) => {
    if (node.type === "year") {
      const year = Number.parseInt(node.year || String(node.timeline_month || "").slice(0, 4), 10) || state.minYear;
      const ratio = (year - state.minYear) / Math.max(state.maxYear - state.minYear, 1);
      targets.set(node.id, { x: 90 + (width - 180) * ratio, y: 84 });
      return;
    }

    if (isCommunityNode(node)) {
      const commId = nodeCommunityId(node);
      targets.set(node.id, communities.get(commId) || { x: width / 2, y: height / 2 });
      return;
    }

    const commId = nodeCommunityId(node);
    const center = commId != null ? communities.get(commId) : null;
    const base = center || { x: width / 2, y: height / 2 };
    const siblings = membersByCommunity.get(commId) || [node];
    const offset = memberOffset(state, node, siblings);
    const lensMultiplier = state.lens === "clusters" ? 1.2 : (state.lens === "local" ? 1.05 : 0.92);
    targets.set(node.id, {
      x: base.x + offset.x * lensMultiplier,
      y: base.y + offset.y * lensMultiplier,
    });
  });

  const missing = displayGraph.nodes.filter((node) => !targets.has(node.id)).map((node) => node.id);
  if (missing.length) {
    throw new Error(`Layout target invariant failed: ${missing.length} nodes missing targets.`);
  }
  return targets;
}

export function computeGraphFrame(state, width, height) {
  const rawNodes = rawVisibleNodes(state);
  const visibleNodeIds = new Set(rawNodes.map((node) => node.id));
  const rawEdges = rawVisibleEdges(state, visibleNodeIds);
  const displayGraph = buildDisplayGraph(state, rawNodes, rawEdges);
  const displayNodeIds = new Set(displayGraph.nodes.map((node) => node.id));

  state.filteredRawNodeIds = visibleNodeIds;

  const displayEdges = displayGraph.edges.filter((edge) => displayNodeIds.has(edge.sourceId) && displayNodeIds.has(edge.targetId));
  const degreeByNode = new Map(displayGraph.nodes.map((node) => [node.id, 0]));
  displayEdges.forEach((edge) => {
    degreeByNode.set(edge.sourceId, (degreeByNode.get(edge.sourceId) || 0) + 1);
    degreeByNode.set(edge.targetId, (degreeByNode.get(edge.targetId) || 0) + 1);
  });

  const nodes = displayGraph.nodes.map((node) => ({
    ...node,
    renderRadius: nodeRadius(node, degreeByNode.get(node.id) || 0),
  }));
  const edges = displayEdges.map((edge) => ({ ...edge }));
  const targets = buildLayoutTargets(state, { ...displayGraph, nodes, edges }, width, height);

  return {
    nodes,
    edges,
    targets,
    displayGraph,
  };
}
