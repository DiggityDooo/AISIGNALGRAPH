"use strict";

import {
  NODE_COLORS,
  communityColor,
  nodeCommunityId,
  sanitizeType,
  monthIndexFromKey,
} from "../state/store.js";

export async function fetchGraphPayload() {
  const response = await fetch("/api/graph", { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Graph request failed with status ${response.status}`);
  }
  return response.json();
}

export function normalizeGraphPayload(payload) {
  if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) {
    throw new Error(payload?.message || "Graph payload was malformed.");
  }

  const nodes = payload.nodes.map((node) => {
    const type = sanitizeType(node.type || "topic");
    const commId = nodeCommunityId(node);
    return {
      ...node,
      type,
      color: node.color || NODE_COLORS[type] || NODE_COLORS.topic,
      community_color: commId != null ? communityColor(commId) : NODE_COLORS.year,
      search_text: `${node.label || ""} ${node.subtitle || ""} ${node.description || ""}`.toLowerCase(),
    };
  });

  const edges = payload.edges.map((edge, index) => ({
    ...edge,
    sourceId: edge.source,
    targetId: edge.target,
    id: edge.id || `${edge.source}->${edge.target}:${edge.flow_kind || edge.kind}:${index}`,
  }));

  const timelineStart = payload.timeline?.start || "2020-01";
  const timelineEnd = payload.timeline?.end || "2026-12";
  const startYear = Number.parseInt(timelineStart.slice(0, 4), 10) || 2020;
  const endYear = Number.parseInt(timelineEnd.slice(0, 4), 10) || 2026;

  return {
    nodes,
    edges,
    communities: Array.isArray(payload.communities) ? payload.communities : [],
    status: payload.status || "ok",
    message: payload.message || "",
    timeline: {
      start: timelineStart,
      end: timelineEnd,
      startYear,
      endYear,
      monthFloor: monthIndexFromKey(timelineStart) || startYear * 12 + 1,
      monthCeiling: monthIndexFromKey(timelineEnd) || endYear * 12 + 12,
    },
  };
}

export function buildRawIndexes(state) {
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

export function buildDisplayIndexes(state) {
  state.nodeById = new Map(state.nodes.map((node) => [node.id, node]));
  state.linksByNode = new Map(state.nodes.map((node) => [node.id, []]));
  state.edgesByNode = new Map(state.nodes.map((node) => [node.id, []]));

  state.edges.forEach((edge) => {
    if (!state.linksByNode.has(edge.sourceId)) {
      state.linksByNode.set(edge.sourceId, []);
    }
    if (!state.linksByNode.has(edge.targetId)) {
      state.linksByNode.set(edge.targetId, []);
    }
    if (!state.edgesByNode.has(edge.sourceId)) {
      state.edgesByNode.set(edge.sourceId, []);
    }
    if (!state.edgesByNode.has(edge.targetId)) {
      state.edgesByNode.set(edge.targetId, []);
    }
    state.linksByNode.get(edge.sourceId).push(edge);
    state.linksByNode.get(edge.targetId).push(edge);
    state.edgesByNode.get(edge.sourceId).push(edge);
    state.edgesByNode.get(edge.targetId).push(edge);
  });
}

