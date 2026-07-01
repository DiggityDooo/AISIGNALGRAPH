"use client";

import { useEffect, useRef } from "react";
import type { GraphApiEdge, GraphApiNode } from "@/components/graph-flow/fetchGraphApi";
import { getGraphQualityProfile } from "@/lib/graph/mobileProfile";
import { getNodeMonthIndex, getStableDepthOffset } from "@/lib/graph/nodeUtils.js";
import { nodeTypeOf } from "@/lib/graphFlow/nodeColors";
import type { GraphNodeSummary } from "@/lib/graph/types";

const FALLBACK_X_SPREAD = 2.5;
const FALLBACK_Y_SPREAD = 1.5;
const TIMELINE_Z_SCALE = 10;

export interface Lattice3DSceneProps {
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
    const z = Number.isFinite(monthIndex)
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
  nodes,
  edges,
  focusNodeId,
  onNodeSelect,
}: Lattice3DSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onNodeSelectRef = useRef(onNodeSelect);
  onNodeSelectRef.current = onNodeSelect;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || nodes.length === 0) {
      return undefined;
    }

    if (!getGraphQualityProfile().enable3d) {
      return undefined;
    }

    let disposed = false;
    let engine: { dispose: () => void; focusNode: (id: string) => void } | null = null;

    void (async () => {
      const positions = buildNodePositions(nodes);
      const nodeById = new Map(nodes.map((node) => [node.id, node]));

      try {
        const { GraphEngine } = await import("@/lib/graphEngine/GraphEngine.js");
        if (disposed || !containerRef.current) return;

        const instance = new GraphEngine({
          container: containerRef.current,
          onNodeClick: (node) => {
            const full = nodeById.get(node.id);
            if (!full) return;
            const neighborSummaries = edges
              .filter((edge) => edge.source === node.id || edge.target === node.id)
              .map((edge) => (edge.source === node.id ? edge.target : edge.source))
              .filter((id, index, list) => list.indexOf(id) === index)
              .map((id) => {
                const neighbor = nodeById.get(id);
                return { id, label: neighbor?.label ?? id };
              });
            onNodeSelectRef.current?.(toNodeSummary(full, neighborSummaries));
            instance.focusNode(node.id);
          },
          onNodeHover: (node) => {
            const canvas = instance.getDomElement();
            if (canvas) {
              canvas.style.cursor = node ? "pointer" : "grab";
            }
          },
        });

        const engineNodes = nodes.map((node) => {
          const pos = positions.get(node.id)!;
          return {
            ...node,
            semanticType: nodeTypeOf(node),
            x: pos.x,
            y: pos.y,
            z: pos.z,
          };
        });

        const initialized = await instance.init({
          nodes: engineNodes,
          edges: edges.map((edge) => ({
            ...edge,
            sourceId: edge.source,
            targetId: edge.target,
          })),
          positions,
        });

        if (disposed) {
          instance.dispose();
          return;
        }

        if (!initialized) {
          instance.dispose();
          return;
        }

        engine = instance;
        const canvas = instance.getDomElement();
        if (canvas) {
          canvas.style.cursor = "grab";
        }

        if (focusNodeId) {
          instance.focusNode(focusNodeId);
        }
      } catch (error) {
        console.warn("Lattice3DScene: GraphEngine unavailable.", error);
      }
    })();

    return () => {
      disposed = true;
      engine?.dispose();
      engine = null;
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [nodes, edges, focusNodeId]);

  return <div ref={containerRef} className="absolute inset-0 bg-[#050202]" />;
}
