"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, type Ref } from "react";
import type { GraphEngine } from "@/lib/graphEngine/GraphEngine.js";
import type { GraphApiEdge, GraphApiNode } from "@/components/graph-flow/fetchGraphApi";
import { getGraphQualityProfile } from "@/lib/graph/mobileProfile";
import { getNodeMonthIndex, getStableDepthOffset } from "@/lib/graph/nodeUtils.js";
import { nodeTypeOf } from "@/lib/graphFlow/nodeColors";
import type { GraphNodeSummary } from "@/lib/graph/types";

const FALLBACK_X_SPREAD = 2.5;
const FALLBACK_Y_SPREAD = 1.5;
const TIMELINE_Z_SCALE = 10;

export type Lattice3DHandle = { fit: () => void };

export interface Lattice3DSceneProps {
  ref?: Ref<Lattice3DHandle>;
  onError: () => void;
  nodes: GraphApiNode[];
  edges: GraphApiEdge[];
  focusNodeId?: string | null;
  onNodeSelect?: (node: GraphNodeSummary | null) => void;
}

function buildNodePositions(nodes: GraphApiNode[]): Map<string, { x: number; y: number; z: number }> {
  const monthIndexes = nodes
    .map((node) => getNodeMonthIndex(node))
    .filter((value): value is number => Number.isFinite(value));
  const timelineCenter = monthIndexes.length
    ? (Math.min(...monthIndexes) + Math.max(...monthIndexes)) / 2
    : 0;

  const positions = new Map<string, { x: number; y: number; z: number }>();
  for (const node of nodes) {
    const monthIndex = getNodeMonthIndex(node);
    const rawX = Number(node.x);
    const rawY = Number(node.y);
    const x = Number.isFinite(rawX) ? rawX : getStableDepthOffset(`${node.id}:x`) * FALLBACK_X_SPREAD;
    const y = Number.isFinite(rawY) ? rawY : getStableDepthOffset(`${node.id}:y`) * FALLBACK_Y_SPREAD;
    const z =
      monthIndex !== null && Number.isFinite(monthIndex)
        ? (monthIndex - timelineCenter) * TIMELINE_Z_SCALE + getStableDepthOffset(node.id)
        : getStableDepthOffset(node.id);
    positions.set(node.id, { x, y, z });
  }
  return positions;
}

function toNodeSummary(
  node: GraphApiNode,
  neighbors: Array<{ id: string; label: string }>,
): GraphNodeSummary {
  return {
    id: node.id,
    label: node.label ?? node.id,
    type: nodeTypeOf(node),
    summary: typeof node.summary === "string" ? node.summary : undefined,
    description: node.description,
    community_name:
      typeof node.community_name === "string" ? node.community_name : undefined,
    route: node.route,
    neighbors,
  };
}

export default function Lattice3DScene({
  ref,
  nodes,
  edges,
  focusNodeId,
  onNodeSelect,
  onError,
}: Lattice3DSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GraphEngine | null>(null);
  const readFocus = useEffectEvent(() => focusNodeId);
  const selectNode = useEffectEvent((node: GraphNodeSummary) => onNodeSelect?.(node));
  const reportError = useEffectEvent(onError);

  useImperativeHandle(ref, () => ({ fit: () => engineRef.current?.fit() }), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || nodes.length === 0 || !getGraphQualityProfile().enable3d) return;

    let disposed = false;
    let engine: GraphEngine | null = null;
    const recover = () => { if (!disposed) reportError(); };

    void (async () => {
      try {
        const { GraphEngine } = await import("@/lib/graphEngine/GraphEngine.js");
        if (disposed) return;
        const positions = buildNodePositions(nodes);
        const nodeById = new Map(nodes.map((node) => [node.id, node]));
        const instance = new GraphEngine({
          container,
          onNodeClick: (node: GraphApiNode) => {
            const full = nodeById.get(node.id);
            if (!full) return;
            const neighbors = new Set<string>();
            for (const edge of edges) {
              if (edge.source === node.id) neighbors.add(edge.target);
              else if (edge.target === node.id) neighbors.add(edge.source);
            }
            selectNode(toNodeSummary(full, [...neighbors].map(id => ({
              id, label: nodeById.get(id)?.label ?? id,
            }))));
          },
          onNodeHover: (node: GraphApiNode | null) => {
            const canvas = instance.getDomElement();
            if (canvas) canvas.style.cursor = node ? "pointer" : "grab";
          },
        });
        engine = instance;
        const initialized = await instance.init({
          nodes: nodes.map(node => ({
            ...node,
            semanticType: nodeTypeOf(node),
            ...positions.get(node.id),
          })),
          edges: edges.map(edge => ({ ...edge, sourceId: edge.source, targetId: edge.target })),
          positions,
        });
        if (disposed) {
          instance.dispose();
          return;
        }
        if (!initialized) {
          recover();
          return;
        }

        engineRef.current = instance;
        const canvas = instance.getDomElement();
        if (canvas) {
          canvas.style.cursor = "grab";
          canvas.addEventListener("webglcontextlost", recover, { once: true });
        }
        instance.fit();
        const focus = readFocus();
        if (focus) instance.focusNode(focus);
      } catch (error) {
        console.warn("Lattice3DScene: GraphEngine unavailable.", error);
        recover();
      }
    })();

    return () => {
      disposed = true;
      engine?.getDomElement()?.removeEventListener("webglcontextlost", recover);
      engine?.dispose();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [nodes, edges]);

  useEffect(() => {
    if (focusNodeId) engineRef.current?.focusNode(focusNodeId);
  }, [focusNodeId]);

  return <div ref={containerRef} className="absolute inset-0 bg-[#050202]" />;
}
