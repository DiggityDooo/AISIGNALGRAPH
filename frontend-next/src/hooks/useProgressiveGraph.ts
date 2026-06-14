"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import type { DocumentCardData } from "@/components/visualization/flow/DocumentCardNode";
import {
  buildGraphIndex,
  collectDescendants,
  computeVisibleIds,
  pickSeedIds,
  type GraphIndex,
} from "@/lib/graphFlow/graphIndex";
import { accentForType, nodeTypeOf } from "@/lib/graphFlow/nodeColors";

export interface UseProgressiveGraphOptions {
  payload: GraphApiPayload | null;
  dataRevision: string | null;
  initialSeedCount?: number;
  onVisibleCountChange?: (visible: number) => void;
}

export function toggleExpanded(
  id: string,
  expanded: Set<string>,
  childrenById: Map<string, string[]>,
): Set<string> {
  const next = new Set(expanded);
  if (next.has(id)) {
    next.delete(id);
    for (const descendant of collectDescendants(id, childrenById)) {
      next.delete(descendant);
    }
  } else {
    next.add(id);
  }
  return next;
}

export function buildCardGraphElements(
  index: GraphIndex,
  seedIds: string[],
  expandedIds: Set<string>,
): { nodes: Node<DocumentCardData>[]; edges: Edge[] } {
  const visibleIds = computeVisibleIds(seedIds, expandedIds, index.childrenById);
  const depthById = new Map<string, number>();
  const queue = seedIds.map((id) => ({ id, depth: 0 }));
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depthById.has(id)) continue;
    depthById.set(id, depth);
    if (!expandedIds.has(id)) continue;
    for (const childId of index.childrenById.get(id) ?? []) {
      if (!visibleIds.has(childId)) continue;
      queue.push({ id: childId, depth: depth + 1 });
    }
  }

  const nodes: Node<DocumentCardData>[] = [];
  const edges: Edge[] = [];

  for (const id of visibleIds) {
    const apiNode = index.nodeById.get(id);
    if (!apiNode) continue;
    const children = index.childrenById.get(id) ?? [];
    const nodeType = nodeTypeOf(apiNode);
    const accentColor = accentForType(nodeType);
    const expanded = expandedIds.has(id);
    const depth = depthById.get(id) ?? 0;

    nodes.push({
      id,
      type: "documentCard",
      position: { x: 0, y: 0 },
      data: {
        label: apiNode.label ?? id,
        nodeType,
        accentColor,
        hasChildren: children.length > 0,
        expanded,
        childCount: children.length,
        depth,
      },
    });

    if (!expanded) continue;
    for (const childId of children) {
      if (!visibleIds.has(childId)) continue;
      const edgeOpacity = Math.max(0.35, 0.9 - depth * 0.12);
      edges.push({
        id: `e:${id}->${childId}`,
        source: id,
        target: childId,
        type: "default",
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: accentColor,
        },
        style: {
          stroke: accentColor,
          strokeWidth: Math.max(1, 1.8 - depth * 0.15),
          opacity: edgeOpacity,
        },
      });
    }
  }

  return { nodes, edges };
}

export function useProgressiveGraph({
  payload,
  dataRevision,
  initialSeedCount = 3,
  onVisibleCountChange,
}: UseProgressiveGraphOptions) {
  const graphIndex = useMemo(
    () => (payload ? buildGraphIndex(payload) : null),
    [payload],
  );

  const seedIds = useMemo(() => {
    if (!graphIndex) return [];
    return pickSeedIds(graphIndex, initialSeedCount);
  }, [graphIndex, initialSeedCount]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const layoutKey = useMemo(() => {
    const expanded = [...expandedIds].sort().join(",");
    return `${dataRevision ?? "none"}:${seedIds.join(",")}:${expanded}`;
  }, [dataRevision, seedIds, expandedIds]);

  const fitKey = useMemo(
    () => `${dataRevision ?? "none"}:${seedIds.join(",")}`,
    [dataRevision, seedIds],
  );

  const { nodes: rawNodes, edges: rawEdges } = useMemo(() => {
    if (!graphIndex || seedIds.length === 0) {
      return { nodes: [] as Node<DocumentCardData>[], edges: [] as Edge[] };
    }
    return buildCardGraphElements(graphIndex, seedIds, expandedIds);
  }, [graphIndex, seedIds, expandedIds]);

  useEffect(() => {
    onVisibleCountChange?.(rawNodes.length);
  }, [rawNodes.length, onVisibleCountChange]);

  const onToggleExpand = useCallback(
    (nodeId: string) => {
      if (!graphIndex) return;
      const children = graphIndex.childrenById.get(nodeId) ?? [];
      if (children.length === 0) return;
      setExpandedIds((prev) =>
        toggleExpanded(nodeId, prev, graphIndex.childrenById),
      );
    },
    [graphIndex],
  );

  return {
    graphIndex,
    seedIds,
    expandedIds,
    layoutKey,
    fitKey,
    rawNodes,
    rawEdges,
    onToggleExpand,
  };
}
