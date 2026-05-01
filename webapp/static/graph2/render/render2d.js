"use strict";

import { edgeStyle, hexToRgba, isCommunityNode, nodeCommunityId } from "../state/store.js";

function syncCanvasSize(canvas, ctx) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.floor(rect.width * ratio);
  const height = Math.floor(rect.height * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    if (ctx?.setTransform) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  return rect;
}

export function createRender2D(state) {
  const refs = state.refs;
  const nodeCtx = refs.nodeCanvas.getContext("2d");
  const signalCtx = refs.signalCanvas.getContext("2d");
  let root = null;
  let edgeLayer = null;
  let hitLayer = null;
  let edgeSelection = null;
  let nodeSelection = null;

  function currentRect() {
    return refs.svg.node().getBoundingClientRect();
  }

  function setupSVG(onBackgroundClick) {
    const rect = currentRect();
    refs.svg.attr("viewBox", `0 0 ${Math.max(rect.width, 1)} ${Math.max(rect.height, 1)}`);
    refs.svg.selectAll("*").remove();
    root = refs.svg.append("g").attr("id", "graph2-root");
    edgeLayer = root.append("g").attr("id", "graph2-edges");
    hitLayer = root.append("g").attr("id", "graph2-hits");
    refs.svg.on("click", (event) => {
      if (event.target === refs.svg.node()) {
        onBackgroundClick();
      }
    });
  }

  function attachZoom(onZoom) {
    const zoomBehavior = d3.zoom()
      .scaleExtent([0.08, 7.5])
      .on("zoom", (event) => {
        state.currentTransform = event.transform;
        root.attr("transform", event.transform);
        onZoom(event.transform);
      });
    refs.svg.call(zoomBehavior);
    return zoomBehavior;
  }

  function setZoomTransform(zoomBehavior, transform) {
    refs.svg.call(zoomBehavior.transform, transform);
  }

  function updateGraphData(nodes, edges, handlers) {
    const nodeJoin = hitLayer.selectAll("g.graph-node").data(nodes, (node) => node.id);
    nodeJoin.exit().remove();
    const nodeEnter = nodeJoin.enter().append("g").attr("class", "graph-node");
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

    nodeSelection = nodeEnter.merge(nodeJoin);
    nodeSelection
      .on("click", (_event, node) => handlers.onNodeClick(node))
      .on("mouseenter", (_event, node) => handlers.onNodeHover(node))
      .on("mouseleave", () => handlers.onNodeLeave());
    nodeSelection.select("circle").attr("r", (node) => node.renderRadius + 12);
    nodeSelection.select("text")
      .text((node) => (node.label || "").slice(0, 24))
      .attr("dy", (node) => -(node.renderRadius + 12));

    const edgeJoin = edgeLayer.selectAll("line.graph-edge").data(edges, (edge) => edge.id);
    edgeJoin.exit().remove();
    edgeSelection = edgeJoin.enter().append("line").attr("class", "graph-edge").merge(edgeJoin);
  }

  function edgeOpacity(edge) {
    const style = edgeStyle(edge);
    if (!state.highlightedIds.size) {
      return style.opacity;
    }
    const active = state.highlightedIds.has(edge.sourceId) && state.highlightedIds.has(edge.targetId);
    return active ? Math.min(0.92, style.opacity + 0.45) : Math.max(0.025, style.opacity * 0.22);
  }

  function drawNodes(snapshot) {
    syncCanvasSize(refs.nodeCanvas, nodeCtx);
    const ratio = window.devicePixelRatio || 1;
    nodeCtx.clearRect(0, 0, refs.nodeCanvas.width, refs.nodeCanvas.height);
    nodeCtx.save();
    nodeCtx.scale(ratio, ratio);
    nodeCtx.translate(state.currentTransform.x, state.currentTransform.y);
    nodeCtx.scale(state.currentTransform.k, state.currentTransform.k);

    const k = state.currentTransform.k || 1;
    const ordered = [...snapshot.nodes].sort((left, right) => left.renderRadius - right.renderRadius);
    ordered.forEach((node) => {
      const nodeAttention = state.attentionNodes[node.id] || 0;
      const communityId = nodeCommunityId(node);
      const clusterAttention = communityId != null ? (state.attentionCommunities[communityId] || 0) : 0;
      const highlighted = !state.highlightedIds.size || state.highlightedIds.has(node.id) || (isCommunityNode(node) && communityId === state.selectedCommunityId);
      const alpha = highlighted ? 0.94 : 0.22;
      const outerGlow = 10 + nodeAttention * 24 + clusterAttention * 16;
      const baseColor = isCommunityNode(node) ? node.community_color : node.color;
      const coreColor = isCommunityNode(node)
        ? hexToRgba(baseColor, 0.18 + clusterAttention * 0.22)
        : hexToRgba(baseColor, alpha * 0.88);

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
      nodeCtx.lineWidth = (isCommunityNode(node) ? 2.2 : 1.4) / k;
      nodeCtx.strokeStyle = hexToRgba(node.community_color || baseColor, node.id === state.selectedId ? 0.98 : 0.42);
      nodeCtx.stroke();

      if (node.id === state.selectedId) {
        nodeCtx.beginPath();
        nodeCtx.arc(node.x, node.y, node.renderRadius + 6 / k, 0, Math.PI * 2);
        nodeCtx.lineWidth = 2 / k;
        nodeCtx.strokeStyle = hexToRgba("#fff5f2", 0.9);
        nodeCtx.stroke();
      }
    });

    nodeCtx.restore();
  }

  function drawSignals() {
    syncCanvasSize(refs.signalCanvas, signalCtx);
    const ratio = window.devicePixelRatio || 1;
    signalCtx.clearRect(0, 0, refs.signalCanvas.width, refs.signalCanvas.height);
    signalCtx.save();
    signalCtx.scale(ratio, ratio);
    signalCtx.translate(state.currentTransform.x, state.currentTransform.y);
    signalCtx.scale(state.currentTransform.k, state.currentTransform.k);
    state.activeSignals.forEach((signal) => signal.draw(signalCtx));
    signalCtx.restore();
  }

  function render(snapshot) {
    if (!edgeSelection || !nodeSelection) {
      return;
    }
    edgeSelection
      .attr("x1", (edge) => snapshot.nodePos.get(edge.sourceId)?.x ?? edge.sourceX ?? 0)
      .attr("y1", (edge) => snapshot.nodePos.get(edge.sourceId)?.y ?? edge.sourceY ?? 0)
      .attr("x2", (edge) => snapshot.nodePos.get(edge.targetId)?.x ?? edge.targetX ?? 0)
      .attr("y2", (edge) => snapshot.nodePos.get(edge.targetId)?.y ?? edge.targetY ?? 0)
      .attr("stroke", (edge) => edgeStyle(edge).color)
      .attr("stroke-width", (edge) => edge.synthetic ? 0.6 : edgeStyle(edge).width + (edge.weight_norm || 1) * 0.65)
      .attr("stroke-dasharray", (edge) => edgeStyle(edge).dash || null)
      .attr("stroke-opacity", (edge) => edgeOpacity(edge));

    nodeSelection
      .attr("transform", (node) => {
        const point = snapshot.nodePos.get(node.id);
        return `translate(${point?.x ?? 0},${point?.y ?? 0})`;
      });

    const zoomLevel = state.currentTransform.k || 1;
    nodeSelection.select("text")
      .attr("opacity", (node) => {
        if (isCommunityNode(node)) return 0.9;
        if (node.id === state.selectedId || state.highlightedIds.has(node.id)) return 0.96;
        if (zoomLevel > 1.6 || node.importance >= 4 || (state.linksByNode.get(node.id)?.length || 0) >= 10) return 0.72;
        return 0;
      })
      .attr("fill", (node) => (!state.highlightedIds.size || state.highlightedIds.has(node.id)
        ? "rgba(255,244,242,0.86)"
        : "rgba(255,244,242,0.22)"));

    nodeSelection.select("circle")
      .attr("stroke", (node) => node.id === state.selectedId ? hexToRgba("#fff7f5", 0.9) : "transparent")
      .attr("stroke-width", (node) => (node.id === state.selectedId ? 1.8 : 0));

    drawNodes(snapshot);
    drawSignals();
  }

  function resizeAndRender(snapshot) {
    const rect = currentRect();
    refs.svg.attr("viewBox", `0 0 ${Math.max(rect.width, 1)} ${Math.max(rect.height, 1)}`);
    render(snapshot);
    return rect;
  }

  return {
    setupSVG,
    attachZoom,
    setZoomTransform,
    updateGraphData,
    render,
    drawSignals,
    drawNodes,
    resizeAndRender,
    currentRect,
  };
}

