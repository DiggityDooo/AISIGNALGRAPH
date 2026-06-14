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
        type: "smoothstep",
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

  return {
    nodes: layoutWithDagre(nodes, edges, { direction: "LR", nodesep: 56, ranksep: 104 }),
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
  initialSeedCount = 3,
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
      <div className="flex h-full items-center justify-center bg-[#050202]">
        <p className="font-mono text-xs uppercase tracking-widest text-white/35">
          No signal roots indexed
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#050202]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDoubleClick={onNodeDoubleClick}
        nodesDraggable
        panOnDrag={[1, 2]}
        panOnScroll
        zoomOnScroll
        nodesConnectable={false}
        elementsSelectable
        fitView
        minZoom={0.08}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} size={1} color="rgba(0,224,255,0.06)" />
        <Controls
          showInteractive={false}
          className="!border-white/10 !bg-black/50 !shadow-none [&>button]:!border-white/10 [&>button]:!bg-black/40 [&>button]:!fill-white/70"
        />
        <MiniMap
          nodeColor={(node) =>
            (node.data as DocumentCardData | undefined)?.accentColor ?? "#334155"
          }
          maskColor="rgba(5, 2, 2, 0.65)"
          className="!border-white/10 !bg-black/40"
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
