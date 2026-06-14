"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import {
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import {
  DocumentCardNode,
  type DocumentCardData,
} from "@/components/visualization/flow/DocumentCardNode";
import { layoutWithDagre } from "@/lib/graphFlow/dagreLayout";
import {
  buildGraphIndex,
  collectDescendants,
  computeVisibleIds,
  pickSeedIds,
  type GraphIndex,
} from "@/lib/graphFlow/graphIndex";
import { accentForType, nodeTypeOf } from "@/lib/graphFlow/nodeColors";

export interface SignalFlowGraphProps {
  payload: GraphApiPayload | null;
  dataRevision: string | null;
  initialSeedCount?: number;
  onVisibleCountChange?: (visible: number) => void;
}

const nodeTypes = { documentCard: DocumentCardNode };

function toggleExpanded(
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

function buildFlowElements(
  index: GraphIndex,
  seedIds: string[],
  expandedIds: Set<string>,
): { nodes: Node<DocumentCardData>[]; edges: Edge[] } {
  const visibleIds = computeVisibleIds(seedIds, expandedIds, index.childrenById);
  const nodes: Node<DocumentCardData>[] = [];
  const edges: Edge[] = [];

  for (const id of visibleIds) {
    const apiNode = index.nodeById.get(id);
    if (!apiNode) continue;
    const children = index.childrenById.get(id) ?? [];
    const nodeType = nodeTypeOf(apiNode);
    const accentColor = accentForType(nodeType);
    const expanded = expandedIds.has(id);

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
      },
    });

    if (!expanded) continue;
    for (const childId of children) {
      if (!visibleIds.has(childId)) continue;
      edges.push({
        id: `e:${id}->${childId}`,
        source: id,
        target: childId,
        type: "smoothstep",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: accentColor,
        },
        style: { stroke: accentColor, strokeWidth: 1.5 },
      });
    }
  }

  return {
    nodes: layoutWithDagre(nodes, edges, { direction: "LR" }),
    edges,
  };
}

function AutoFit({ layoutKey }: { layoutKey: string }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 400 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [layoutKey, fitView]);

  return null;
}

function SignalFlowGraphInner({
  payload,
  dataRevision,
  initialSeedCount = 5,
  onVisibleCountChange,
}: SignalFlowGraphProps) {
  const [graphIndex, setGraphIndex] = useState<GraphIndex | null>(null);
  const [seedIds, setSeedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [nodes, setNodes] = useState<Node<DocumentCardData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    if (!payload || !dataRevision) return;
    const index = buildGraphIndex(payload);
    setGraphIndex(index);
    setSeedIds(pickSeedIds(index, initialSeedCount));
    setExpandedIds(new Set());
  }, [payload, dataRevision, initialSeedCount]);

  const layoutKey = useMemo(() => {
    const expanded = [...expandedIds].sort().join(",");
    return `${dataRevision ?? "none"}:${seedIds.join(",")}:${expanded}`;
  }, [dataRevision, seedIds, expandedIds]);

  useEffect(() => {
    if (!graphIndex || seedIds.length === 0) {
      setNodes([]);
      setEdges([]);
      onVisibleCountChange?.(0);
      return;
    }

    const { nodes: layoutedNodes, edges: flowEdges } = buildFlowElements(
      graphIndex,
      seedIds,
      expandedIds,
    );
    setNodes(layoutedNodes);
    setEdges(flowEdges);
    onVisibleCountChange?.(layoutedNodes.length);
  }, [graphIndex, seedIds, expandedIds, onVisibleCountChange]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onNodeDoubleClick = useCallback(
    (_event: MouseEvent, node: Node<DocumentCardData>) => {
      if (!graphIndex) return;
      const children = graphIndex.childrenById.get(node.id) ?? [];
      if (children.length === 0) return;
      setExpandedIds((prev) =>
        toggleExpanded(node.id, prev, graphIndex.childrenById),
      );
    },
    [graphIndex],
  );

  if (!graphIndex || nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f8fafc]">
        <p className="font-mono text-xs uppercase tracking-widest text-slate-400">
          No signal roots indexed
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#f8fafc]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDoubleClick={onNodeDoubleClick}
        nodesDraggable
        panOnDrag
        panOnScroll
        zoomOnScroll
        nodesConnectable={false}
        elementsSelectable
        fitView
        minZoom={0.08}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} size={1} color="#e2e8f0" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node) =>
            (node.data as DocumentCardData | undefined)?.accentColor ?? "#cbd5e1"
          }
          maskColor="rgba(15, 23, 42, 0.08)"
          pannable
          zoomable
        />
        <AutoFit layoutKey={layoutKey} />
      </ReactFlow>
    </div>
  );
}

export default function SignalFlowGraph(props: SignalFlowGraphProps) {
  return (
    <ReactFlowProvider>
      <SignalFlowGraphInner {...props} />
    </ReactFlowProvider>
  );
}
