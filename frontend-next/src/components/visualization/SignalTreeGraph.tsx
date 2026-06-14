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
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import {
  DocumentCardNode,
  type DocumentCardData,
} from "@/components/visualization/flow/DocumentCardNode";
import { GraphLayoutProvider } from "@/components/visualization/flow/GraphLayoutContext";
import { useProgressiveGraph } from "@/hooks/useProgressiveGraph";
import { getLayoutedElements } from "@/lib/graphFlow/layoutUtils";

export interface SignalTreeGraphProps {
  payload: GraphApiPayload | null;
  dataRevision: string | null;
  initialSeedCount?: number;
  onVisibleCountChange?: (visible: number) => void;
}

const nodeTypes = { documentCard: DocumentCardNode };

const defaultEdgeOptions = {
  type: "default" as const,
  animated: true,
  style: { stroke: "rgba(0,224,255,0.7)", strokeWidth: 1.5 },
};

function AutoFit({ layoutKey }: { layoutKey: string }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 800 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [layoutKey, fitView]);

  return null;
}

function SignalTreeGraphInner({
  payload,
  dataRevision,
  initialSeedCount = 3,
  onVisibleCountChange,
}: SignalTreeGraphProps) {
  const { graphIndex, layoutKey, rawNodes, rawEdges, onToggleExpand } =
    useProgressiveGraph({
      payload,
      dataRevision,
      initialSeedCount,
      onVisibleCountChange,
    });

  const layouted = useMemo(
    () => getLayoutedElements(rawNodes, rawEdges, "tree"),
    [rawNodes, rawEdges],
  );

  const [nodes, setNodes] = useState<Node<DocumentCardData>[]>(layouted.nodes);
  const [edges, setEdges] = useState(layouted.edges);

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layoutKey, layouted]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onNodeDoubleClick = useCallback(
    (_event: MouseEvent, node: Node<DocumentCardData>) => {
      onToggleExpand(node.id);
    },
    [onToggleExpand],
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
    <GraphLayoutProvider mode="tree">
      <div className="h-full w-full bg-[#050202]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
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
    </GraphLayoutProvider>
  );
}

export default function SignalTreeGraph(props: SignalTreeGraphProps) {
  return (
    <ReactFlowProvider>
      <SignalTreeGraphInner {...props} />
    </ReactFlowProvider>
  );
}
