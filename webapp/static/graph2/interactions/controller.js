"use strict";

import {
  CONFIG,
  edgeStyle,
  isCommunityNode,
  nodeCommunityId,
  parseCommunityNodeId,
  hexToRgba,
  writeDebug,
} from "../state/store.js";
import { fetchGraphPayload, normalizeGraphPayload, buildRawIndexes, buildDisplayIndexes } from "../data/adapter.js";
import { computeGraphFrame } from "../layout/targets.js";

class SignalPulse {
  constructor(state, sourceNode, targetNode, color) {
    this.state = state;
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
    this.progress += this.speed * Math.max(this.state.signalSpeed, 0.25);
    const sx = this.source.x || 0;
    const sy = this.source.y || 0;
    const tx = this.target.x || 0;
    const ty = this.target.y || 0;
    const x = sx + (tx - sx) * this.progress;
    const y = sy + (ty - sy) * this.progress;
    this.trail.unshift({ x, y });
    if (this.trail.length > 14) {
      this.trail.pop();
    }
    if (this.progress >= 1) {
      this.alive = false;
      this.state.controller.activateNode(this.target);
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

function safeInternalRoute(candidate, fallback) {
  if (typeof candidate !== "string") {
    return fallback;
  }

  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\0")) {
    return fallback;
  }

  return candidate;
}

function clearChildren(element) {
  element.replaceChildren();
}

function appendMetaItem(container, label, value) {
  const wrapper = document.createElement("div");
  const title = document.createElement("span");
  title.className = "label";
  title.textContent = label;
  const content = document.createElement("div");
  content.textContent = String(value);
  wrapper.appendChild(title);
  wrapper.appendChild(content);
  container.appendChild(wrapper);
}

function appendBadge(container, label, borderColor, color) {
  const badge = document.createElement("span");
  badge.className = "hud-badge";
  badge.style.borderColor = borderColor;
  badge.style.color = color;
  badge.textContent = String(label);
  container.appendChild(badge);
}

export function createController(state, render2d, simulation2d, bridge3d) {
  const controller = {
    async loadGraph() {
      const payload = await fetchGraphPayload();
      const normalized = normalizeGraphPayload(payload);
      state.rawNodes = normalized.nodes;
      state.rawEdges = normalized.edges;
      state.rawCommunities = normalized.communities;
      state.minYear = normalized.timeline.startYear;
      state.maxYear = normalized.timeline.endYear;
      state.activeYear = normalized.timeline.endYear;
      state.monthFloor = normalized.timeline.monthFloor;
      state.monthCeiling = normalized.timeline.monthCeiling;
      state.refs.yearFilter.min = String(state.minYear);
      state.refs.yearFilter.max = String(state.maxYear);
      state.refs.yearFilter.value = String(state.maxYear);
      state.refs.yearValue.textContent = String(state.maxYear);
      buildRawIndexes(state);
      if (normalized.status === "degraded" && normalized.message) {
        this.fail(normalized.message, "loadGraph");
      }
      this.rebuildFromFilters();
      writeDebug(state, { stage: "loadGraph" });
    },

    rebuildFromFilters() {
      const rect = render2d.currentRect();
      const width = Math.max(rect.width, 1);
      const height = Math.max(rect.height, 1);
      const frame = computeGraphFrame(state, width, height);
      state.nodes = frame.nodes;
      state.edges = frame.edges;
      state.layoutTargets = frame.targets;
      buildDisplayIndexes(state);
      this.updateSelectionState(state.selectedId, { skipRender: true });
      render2d.updateGraphData(state.nodes, state.edges, {
        onNodeClick: (node) => this.onNodeClick(node),
        onNodeHover: (node) => this.onNodeHover(node),
        onNodeLeave: () => this.onNodeLeave(),
      });
      simulation2d.rebuild(state.nodes, state.edges, state.layoutTargets, width, height);
      if (state.is3DMode) {
        bridge3d.update();
      }
      this.updateStats();
      writeDebug(state, { stage: "rebuildFromFilters", nodes: state.nodes.length, edges: state.edges.length });
    },

    onTick(snapshot) {
      state.frameSnapshot = snapshot;
      if (!state.is3DMode) {
        render2d.render(snapshot);
      }
    },

    pauseSimulation() {
      simulation2d.pause();
      state.refs.simulationToggle.textContent = "▶ PLAY";
      this.stopPulseLoop();
      this.stopAnimationLoop();
    },

    resumeSimulation() {
      simulation2d.resume();
      state.refs.simulationToggle.textContent = "⏸ PAUSE";
      this.startPulseLoop();
      this.startAnimationLoop();
    },

    stepSimulation() {
      simulation2d.step();
      if (!state.is3DMode) {
        render2d.render(state.frameSnapshot);
      }
    },

    zoomToFit() {
      const rect = render2d.currentRect();
      if (!state.nodes.length) {
        return;
      }
      const minX = Math.min(...state.nodes.map((node) => Number.isFinite(node.x) ? node.x : 0));
      const maxX = Math.max(...state.nodes.map((node) => Number.isFinite(node.x) ? node.x : 0));
      const minY = Math.min(...state.nodes.map((node) => Number.isFinite(node.y) ? node.y : 0));
      const maxY = Math.max(...state.nodes.map((node) => Number.isFinite(node.y) ? node.y : 0));
      const width = Math.max(maxX - minX, 1);
      const height = Math.max(maxY - minY, 1);
      const k = Math.min(rect.width / (width + 120), rect.height / (height + 120), 1.8);
      const x = rect.width / 2 - ((minX + maxX) / 2) * k;
      const y = rect.height / 2 - ((minY + maxY) / 2) * k;
      const transform = d3.zoomIdentity.translate(x, y).scale(k);
      render2d.setZoomTransform(this.zoomBehavior, transform);
    },

    requestRebuild() {
      fetch("/api/rebuild", {
        method: "POST",
        headers: {
          "X-CSRFToken": document.querySelector('meta[name="csrf-token"]')?.content || "",
        },
      }).finally(() => {
        this.loadGraph().catch((error) => this.fail(error, "requestRebuild"));
      });
    },

    set3DMode(nextValue) {
      bridge3d.setMode(nextValue);
      state.refs.mode3dToggle.classList.toggle("is-active", state.is3DMode);
      if (state.is3DMode) {
        simulation2d.stop();
        this.stopPulseLoop();
        this.stopAnimationLoop();
        bridge3d.update();
      } else {
        if (!state.isPaused) {
          simulation2d.resume();
          this.startPulseLoop();
          this.startAnimationLoop();
        }
        render2d.render(state.frameSnapshot);
      }
    },

    onResize() {
      render2d.resizeAndRender(state.frameSnapshot);
      if (state.is3DMode) {
        bridge3d.update();
      } else {
        this.rebuildFromFilters();
      }
    },

    onNodeClick(node) {
      if (isCommunityNode(node)) {
        const communityId = nodeCommunityId(node);
        state.autoExpandedCommunityId = communityId;
        state.pinnedCommunityId = communityId;
      } else if (["global", "signal"].includes(state.lens)) {
        state.pinnedCommunityId = nodeCommunityId(node);
      }
      this.updateSelectionState(node.id);
      if (["global", "signal", "local"].includes(state.lens)) {
        this.rebuildFromFilters();
      }
      this.renderDetailPanel(state.nodeById.get(node.id) || node);
    },

    onNodeHover(node) {
      this.activateNode(node, 0.12);
      if (!state.is3DMode) {
        render2d.render(state.frameSnapshot);
      }
    },

    onNodeLeave() {
      if (!state.is3DMode) {
        render2d.render(state.frameSnapshot);
      }
    },

    updateSelectionState(nodeId, opts = {}) {
      state.selectedId = nodeId || null;
      const selectedNode = state.nodeById.get(nodeId);
      state.selectedCommunityId = nodeCommunityId(selectedNode)
        ?? (String(nodeId || "").startsWith("community:") ? parseCommunityNodeId(String(nodeId)) : null);
      const related = state.selectedId ? new Set([state.selectedId]) : new Set();
      if (state.selectedId) {
        state.edges.forEach((edge) => {
          if (edge.sourceId === state.selectedId) related.add(edge.targetId);
          if (edge.targetId === state.selectedId) related.add(edge.sourceId);
        });
        if (state.selectedCommunityId != null) {
          state.nodes.forEach((node) => {
            if (nodeCommunityId(node) === state.selectedCommunityId) {
              related.add(node.id);
            }
          });
        }
      }
      state.highlightedIds = related;
      if (!opts.skipRender && !state.is3DMode) {
        render2d.render(state.frameSnapshot);
      }
    },

    clearSelection() {
      state.selectedId = null;
      state.selectedCommunityId = null;
      state.highlightedIds = new Set();
      state.pinnedCommunityId = null;
      this.renderDefaultPanel();
      if (["global", "signal", "local"].includes(state.lens)) {
        this.rebuildFromFilters();
      } else if (!state.is3DMode) {
        render2d.render(state.frameSnapshot);
      }
    },

    resetScene() {
      state.selectedId = null;
      state.selectedCommunityId = null;
      state.highlightedIds = new Set();
      state.pinnedCommunityId = null;
      state.autoExpandedCommunityId = null;
      state.localSupportExpanded = false;
      this.renderDefaultPanel();
      this.rebuildFromFilters();
      this.zoomToFit();
    },

    renderDefaultPanel() {
      const refs = state.refs;
      refs.detailBadge.textContent = "Graph";
      refs.detailTitle.textContent = "AI Signal Graph";
      refs.detailSubtitle.textContent = "Select a node to inspect it.";
      refs.detailCopy.textContent = "The graph reads as communities, directed signal flow, and a navigable timeline of stories and entities.";
      clearChildren(refs.detailMeta);
      clearChildren(refs.detailTags);
      clearChildren(refs.detailEntities);
      clearChildren(refs.detailRelated);
      refs.detailLink.href = "/stories";
      refs.detailLink.textContent = "OPEN RECORD";
    },

    renderDetailPanel(node) {
      const refs = state.refs;
      if (!node) {
        this.renderDefaultPanel();
        return;
      }

      if (isCommunityNode(node)) {
        const communityId = nodeCommunityId(node);
        const community = state.rawCommunityById.get(communityId);
        refs.detailBadge.textContent = "COMMUNITY";
        refs.detailTitle.textContent = community?.label || node.label || "Community";
        refs.detailSubtitle.textContent = `${node.story_count || 0} stories · ${node.entity_count || 0} entities`;
        refs.detailCopy.textContent = "Collapsed region of the graph. Pinning it expands member nodes while preserving surrounding context.";
        clearChildren(refs.detailMeta);
        appendMetaItem(refs.detailMeta, "Nodes", node.member_count || 0);
        appendMetaItem(refs.detailMeta, "Stories", node.story_count || 0);
        appendMetaItem(refs.detailMeta, "Entities", node.entity_count || 0);
        clearChildren(refs.detailTags);
        (community?.dominant_types || []).forEach((name) => {
          appendBadge(refs.detailTags, name, hexToRgba(node.community_color, 0.34), node.community_color);
        });
        clearChildren(refs.detailEntities);
        clearChildren(refs.detailRelated);
        refs.detailLink.href = safeInternalRoute(node.route, "/stories");
        refs.detailLink.textContent = "OPEN ANCHOR";
      } else {
        refs.detailBadge.textContent = (node.type || "node").toUpperCase();
        refs.detailTitle.textContent = node.label || "Node";
        refs.detailSubtitle.textContent = node.subtitle || "";
        if (node.node_type === "story" && node.details_html) {
          refs.detailCopy.innerHTML = node.details_html;
        } else {
          refs.detailCopy.textContent = node.description || "";
        }
        clearChildren(refs.detailMeta);
        appendMetaItem(refs.detailMeta, "Type", node.type || "unknown");
        appendMetaItem(refs.detailMeta, "Cluster", node.cluster_id != null ? `C${node.cluster_id + 1}` : "Timeline");
        appendMetaItem(refs.detailMeta, "Outflow", node.out_degree || 0);
        clearChildren(refs.detailTags);
        appendBadge(
          refs.detailTags,
          node.group || node.type || "unknown",
          hexToRgba(node.community_color || node.color, 0.35),
          node.community_color || node.color || "#ffffff"
        );
        clearChildren(refs.detailEntities);
        const related = state.edges
          .filter((edge) => edge.sourceId === node.id || edge.targetId === node.id)
          .slice(0, 10)
          .map((edge) => {
            const otherId = edge.sourceId === node.id ? edge.targetId : edge.sourceId;
            const other = state.nodeById.get(otherId);
            if (!other) return null;
            return other;
          })
          .filter(Boolean);
        clearChildren(refs.detailRelated);
        if (related.length) {
          const label = document.createElement("div");
          label.className = "label";
          label.textContent = "Visible links";
          refs.detailRelated.appendChild(label);
          related.forEach((other) => {
            const link = document.createElement("a");
            link.href = "#";
            link.dataset.nodeId = other.id;
            link.textContent = other.label || other.id;
            link.addEventListener("click", (event) => {
              event.preventDefault();
              const nextNode = state.nodeById.get(link.dataset.nodeId);
              if (nextNode) {
                this.onNodeClick(nextNode);
              }
            });
            refs.detailRelated.appendChild(link);
          });
        } else {
          const emptyState = document.createElement("div");
          emptyState.className = "graph-empty";
          emptyState.textContent = "No visible links in the active lens.";
          refs.detailRelated.appendChild(emptyState);
        }
        refs.detailLink.href = safeInternalRoute(node.route, "/entities");
        refs.detailLink.textContent = node.node_type === "story" ? "OPEN STORY" : "OPEN RECORD";
      }

      refs.hudRight.classList.add("is-open");
    },

    updateAttention() {
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
        state.attentionNodes[signal.source.id] = Math.min(1, (state.attentionNodes[signal.source.id] || 0) + 0.05);
      });
    },

    activateNode(node, magnitude = 0.28) {
      if (!node) return;
      state.attentionNodes[node.id] = Math.min(1, (state.attentionNodes[node.id] || 0) + magnitude);
      const communityId = nodeCommunityId(node);
      if (communityId != null) {
        state.attentionCommunities[communityId] = Math.min(1, (state.attentionCommunities[communityId] || 0) + magnitude * 0.75);
      }
    },

    choosePulseEdge() {
      const edges = state.edges.filter((edge) => {
        if (edge.synthetic) return false;
        if (edge.flow_kind === "support") {
          return state.lens === "local" && state.localSupportExpanded;
        }
        return edge.directed;
      });
      if (!edges.length) return null;
      let total = 0;
      const weighted = edges.map((edge) => {
        const source = state.nodeById.get(edge.sourceId);
        if (!source) return { edge, weight: 0 };
        const recency = 1 + ((source.month_index || state.monthFloor) - state.monthFloor) / Math.max(state.monthCeiling - state.monthFloor, 1);
        const degree = state.linksByNode.get(source.id)?.length || 0;
        const degreeWeight = 1 + degree * 0.08;
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
    },

    spawnSignal() {
      if (state.is3DMode || state.isPaused || state.activeSignals.length >= CONFIG.maxSignals) {
        return;
      }
      const edge = this.choosePulseEdge();
      if (!edge) {
        return;
      }
      const source = state.nodeById.get(edge.sourceId);
      const target = state.nodeById.get(edge.targetId);
      if (!source || !target || !Number.isFinite(source.x) || !Number.isFinite(target.x)) {
        return;
      }
      state.activeSignals.push(new SignalPulse(state, source, target, edgeStyle(edge).color));
      this.activateNode(source, 0.16);
    },

    nextPulseDelay() {
      const speedFactor = 1 / Math.max(state.signalSpeed, 0.25);
      const congestion = Math.min(1, state.activeSignals.length / Math.max(CONFIG.maxSignals, 1));
      const edgePressure = Math.min(1, state.edges.length / 180);
      const lensFactor = state.lens === "signal" ? 0.9 : state.lens === "local" ? 1.08 : 1;
      const congestionFactor = 1 + Math.pow(congestion, 2.2) * 4.5;
      const densityFactor = 1 + edgePressure * 0.45;
      const jitter = Math.random() * CONFIG.signalSpawnJitterMs;
      return Math.max(120, Math.round(CONFIG.signalSpawnBaseMs * speedFactor * congestionFactor * densityFactor * lensFactor + jitter));
    },

    queueNextPulse() {
      if (state.pulseTimerId || state.isPaused || state.is3DMode) return;
      state.pulseTimerId = window.setTimeout(() => {
        state.pulseTimerId = null;
        this.spawnSignal();
        this.queueNextPulse();
      }, this.nextPulseDelay());
    },

    startPulseLoop() {
      this.queueNextPulse();
    },

    stopPulseLoop() {
      if (state.pulseTimerId) {
        window.clearTimeout(state.pulseTimerId);
        state.pulseTimerId = null;
      }
    },

    animateFrame() {
      if (state.is3DMode || state.isPaused) {
        state.animationFrameId = null;
        return;
      }
      this.updateAttention();
      state.activeSignals.forEach((signal) => signal.update());
      state.activeSignals = state.activeSignals.filter((signal) => signal.alive);
      this.updateStats();
      render2d.render(state.frameSnapshot);
      state.animationFrameId = window.requestAnimationFrame(() => this.animateFrame());
    },

    startAnimationLoop() {
      if (state.animationFrameId || state.isPaused || state.is3DMode) return;
      state.animationFrameId = window.requestAnimationFrame(() => this.animateFrame());
    },

    stopAnimationLoop() {
      if (state.animationFrameId) {
        window.cancelAnimationFrame(state.animationFrameId);
        state.animationFrameId = null;
      }
    },

    updateStats() {
      state.refs.statNodes.textContent = String(state.nodes.length);
      state.refs.statEdges.textContent = String(state.edges.length);
      state.refs.statSignals.textContent = String(state.activeSignals.length);
    },

    fail(error, stage = "error") {
      writeDebug(state, { stage, error: String(error?.stack || error) });
      state.refs.detailCopy.textContent = String(error?.message || error || "The graph failed to initialize.");
      state.refs.hudRight.classList.add("is-open");
    },
  };

  state.controller = controller;
  return controller;
}
