"use strict";

import { CONFIG, edgeStyle, isCommunityNode } from "../state/store.js";

function linkDistance(edge) {
  return edgeStyle(edge).distance || 120;
}

function linkStrength(edge) {
  return edgeStyle(edge).strength || 0.12;
}

function seedPositions(nodes, targets) {
  nodes.forEach((node, index) => {
    const target = targets.get(node.id) || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const angle = index * 2.39996;
    const scatterRadius = node.renderRadius > 24 ? 30 : 16;
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      node.x = target.x + Math.cos(angle) * scatterRadius;
      node.y = target.y + Math.sin(angle) * scatterRadius;
    }
    if (!Number.isFinite(node.x)) node.x = target.x;
    if (!Number.isFinite(node.y)) node.y = target.y;
  });
}

function buildFrameSnapshot(state) {
  const nodePos = new Map();
  const nodes = state.nodes.map((node) => {
    const item = {
      id: node.id,
      x: Number.isFinite(node.x) ? node.x : 0,
      y: Number.isFinite(node.y) ? node.y : 0,
      renderRadius: node.renderRadius,
      label: node.label,
      node_type: node.node_type,
      type: node.type,
      color: node.color,
      community_color: node.community_color,
      importance: node.importance || 0,
    };
    nodePos.set(item.id, item);
    return item;
  });

  const edges = state.edges.map((edge) => ({
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    sourceX: edge.source?.x ?? nodePos.get(edge.sourceId)?.x ?? 0,
    sourceY: edge.source?.y ?? nodePos.get(edge.sourceId)?.y ?? 0,
    targetX: edge.target?.x ?? nodePos.get(edge.targetId)?.x ?? 0,
    targetY: edge.target?.y ?? nodePos.get(edge.targetId)?.y ?? 0,
    synthetic: Boolean(edge.synthetic),
    flow_kind: edge.flow_kind,
    directed: Boolean(edge.directed),
    weight_norm: edge.weight_norm || 1,
  }));

  return { nodes, edges, nodePos };
}

export function createSimulationEngine(state, onTick) {
  function stop() {
    state.simulation?.stop();
  }

  function pause() {
    state.isPaused = true;
    stop();
  }

  function resume() {
    state.isPaused = false;
    state.simulation?.alphaTarget(0.02).restart();
    state.simulation?.alphaTarget(0);
  }

  function step() {
    if (!state.simulation) {
      return;
    }
    state.simulation.tick();
    state.frameSnapshot = buildFrameSnapshot(state);
    onTick(state.frameSnapshot);
  }

  function rebuild(nodes, edges, targets, width, height) {
    stop();
    state.nodes = nodes;
    state.edges = edges;
    state.layoutTargets = targets;

    seedPositions(nodes, targets);

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(edges)
        .id((node) => node.id)
        .distance(linkDistance)
        .strength(linkStrength))
      .force("charge", d3.forceManyBody().strength((node) => {
        const degree = state.linksByNode.get(node.id)?.length || 0;
        let base = CONFIG.baseCharge - degree * 10;
        if (degree >= 8) {
          base -= 120;
        }
        if (isCommunityNode(node)) {
          base *= 1.7;
        }
        return base;
      }))
      .force("x", d3.forceX((node) => state.layoutTargets.get(node.id)?.x ?? width / 2).strength(0.22))
      .force("y", d3.forceY((node) => state.layoutTargets.get(node.id)?.y ?? height / 2).strength(0.22))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius((node) => node.renderRadius + (isCommunityNode(node) ? 22 : 8)).strength(0.9))
      .alphaDecay(CONFIG.alphaDecay)
      .alphaMin(CONFIG.alphaMin)
      .velocityDecay(CONFIG.velocityDecay)
      .on("tick", () => {
        state.frameSnapshot = buildFrameSnapshot(state);
        onTick(state.frameSnapshot);
      });

    state.simulation = simulation;

    const warmupTicks = state.nodes.length > 360 ? 14 : 10;
    for (let i = 0; i < warmupTicks; i += 1) {
      simulation.tick();
    }
    state.frameSnapshot = buildFrameSnapshot(state);
    onTick(state.frameSnapshot);

    if (state.isPaused) {
      pause();
    }
  }

  return {
    rebuild,
    pause,
    resume,
    stop,
    step,
  };
}
