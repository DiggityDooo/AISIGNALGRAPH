"use client";

import {
  useCallback,
  useEffect,
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
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  DocumentCardNode,
  type DocumentCardData,
} from "@/components/visualization/flow/DocumentCardNode";
import { GraphLayoutProvider } from "@/components/visualization/flow/GraphLayoutContext";
import { SignalEdge } from "@/components/visualization/flow/SignalEdge";
import type { LayoutMode } from "@/lib/graphFlow/layoutUtils";

const nodeTypes = { documentCard: DocumentCardNode };
const edgeTypes = { signal: SignalEdge };
const defaultEdgeOptions = { type: "signal" as const };

function AutoFit({ fitKey }: { fitKey: string }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 800 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [fitKey, fitView]);

  return null;
}

function CardGraphCanvasInner({
  layoutMode,
  fitKey,
  layouted,
  onToggleExpand,
}: CardGraphCanvasProps) {
  const [nodes, setNodes] = useState(layouted.nodes);
  const [edges] = useState(layouted.edges);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) =>
      applyNodeChanges<Node<DocumentCardData>>(
        changes as NodeChange<Node<DocumentCardData>>[],
        current,
      ),
    );
  }, []);

  const onNodeDoubleClick = useCallback(
    (_event: MouseEvent, node: Node<DocumentCardData>) => {
      onToggleExpand?.(node.id);
    },
    [onToggleExpand],
  );

  return (
    <GraphLayoutProvider mode={layoutMode}>
      <div className="h-full w-full bg-[#050202]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          onNodesChange={onNodesChange}
          onNodeDoubleClick={onToggleExpand ? onNodeDoubleClick : undefined}
          nodesDraggable
          panOnDrag={[1, 2]}
          panOnScroll
          zoomOnScroll
          nodesConnectable={false}
          elementsSelectable
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
          <AutoFit fitKey={fitKey} />
        </ReactFlow>
      </div>
    </GraphLayoutProvider>
  );
}

export interface CardGraphCanvasProps {
  layoutMode: LayoutMode;
  fitKey: string;
  layouted: { nodes: Node<DocumentCardData>[]; edges: Edge[] };
  onToggleExpand?: (nodeId: string) => void;
}

export default function CardGraphCanvas(props: CardGraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <CardGraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
