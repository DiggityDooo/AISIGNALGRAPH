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
import { getGraphQualityProfile } from "@/lib/graph/mobileProfile";

const nodeTypes = { documentCard: DocumentCardNode };
const edgeTypes = { signal: SignalEdge };
const defaultEdgeOptions = { type: "signal" as const };

function AutoFit({
  fitKey,
  focusKey,
  focusNodeIds,
}: {
  fitKey: string;
  focusKey?: string;
  focusNodeIds?: string[];
}) {
  const { fitView } = useReactFlow();

  // Initial load / data revision — fit the whole graph. Skipped when
  // focusKey is set: layoutKey remounts on expand would otherwise re-run
  // this and jump the camera away from the node being opened.
  useEffect(() => {
    if (focusKey) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 800 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [fitKey, focusKey, fitView]);

  // Expand — ease toward the parent node only; fitKey stays unchanged.
  useEffect(() => {
    const parentId = focusNodeIds?.[0];
    if (!focusKey || !parentId) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void fitView({
        nodes: [{ id: parentId }],
        padding: 0.7,
        duration: 700,
        maxZoom: 1.1,
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusKey, focusNodeIds, fitView]);

  return null;
}

function CardGraphCanvasInner({
  layoutMode,
  fitKey,
  focusKey,
  focusNodeIds,
  layouted,
  onToggleExpand,
}: CardGraphCanvasProps) {
  const [nodes, setNodes] = useState(layouted.nodes);
  const [edges] = useState(layouted.edges);
  // Touch devices: single-finger pan (mouse-button pan filters don't apply),
  // no MiniMap (extra render pass + tap target too small to be useful).
  const [isLowTier] = useState(() => getGraphQualityProfile().isLowTier);

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
          panOnDrag={isLowTier ? true : [1, 2]}
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
          {!isLowTier && (
            <MiniMap
              nodeColor={(node) =>
                (node.data as DocumentCardData | undefined)?.accentColor ?? "#334155"
              }
              maskColor="rgba(5, 2, 2, 0.65)"
              className="!border-white/10 !bg-black/40"
              pannable
              zoomable
            />
          )}
          <AutoFit fitKey={fitKey} focusKey={focusKey} focusNodeIds={focusNodeIds} />
        </ReactFlow>
      </div>
    </GraphLayoutProvider>
  );
}

export interface CardGraphCanvasProps {
  layoutMode: LayoutMode;
  fitKey: string;
  /** Stable per-expand key so the camera re-frames on each reveal. */
  focusKey?: string;
  /** Parent + newly revealed children to center on; empty → fit whole graph. */
  focusNodeIds?: string[];
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
