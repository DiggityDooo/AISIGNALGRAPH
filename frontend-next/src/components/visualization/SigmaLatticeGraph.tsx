"use client";

import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import type { GraphNodeSummary } from "@/lib/graph/types";
import { getGraphQualityProfile } from "@/lib/graph/mobileProfile";
import { LatticeRenderer } from "./latticeRenderer";

export interface SigmaLatticeGraphProps {
  payload: GraphApiPayload | null;
  focusedNodeId?: string | null;
  dataRevision?: string | null;
  topologyRevision?: string | null;
  /** Bumps when HUD filters change so the visible subgraph rebuilds. */
  filterRevision?: string;
  onVisibleCountChange?: (visible: number) => void;
  onNodeSelect?: (node: GraphNodeSummary | null) => void;
  onStatsChange?: (stats: { nodes: number; edges: number }) => void;
}

export type SigmaLatticeGraphHandle = {
  fit: () => void;
};

const SigmaLatticeGraph = forwardRef<SigmaLatticeGraphHandle, SigmaLatticeGraphProps>(
function SigmaLatticeGraph(
  {
    payload,
    dataRevision,
    focusedNodeId,
    topologyRevision,
    filterRevision = "",
    onVisibleCountChange,
    onNodeSelect,
    onStatsChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  /** Callback kept in a ref so its identity isn't an effect dependency —
   * otherwise a new closure from the parent would tear down and rebuild the
   * entire Sigma/WebGL instance + layout. Engine options wrap these refs so
   * event handlers always call the latest callback. */
  const onVisibleCountChangeRef = useRef(onVisibleCountChange);
  const onNodeSelectRef = useRef(onNodeSelect);
  const onStatsChangeRef = useRef(onStatsChange);
  /** Device tier resolved once per mount; drives DPR/labels/layout budget. */
  const [quality] = useState(getGraphQualityProfile);
  const [building, setBuilding] = useState(true);
  /** Context-loss recovery: rebuild once, then declare the device out of GPU memory.
   * Lives in the React adapter so the count survives engine remounts. */
  const contextLossesRef = useRef(0);
  const [rebuildNonce, setRebuildNonce] = useState(0);
  const [contextDead, setContextDead] = useState(false);
  const rendererRef = useRef<LatticeRenderer | null>(null);

  useEffect(() => {
    onVisibleCountChangeRef.current = onVisibleCountChange;
    onNodeSelectRef.current = onNodeSelect;
    onStatsChangeRef.current = onStatsChange;
  }, [onVisibleCountChange, onNodeSelect, onStatsChange]);

  useImperativeHandle(ref, () => ({
    fit() {
      rendererRef.current?.fit();
    },
  }), []);

  // Metadata-only poll updates: patch labels/colors/sizes without remounting Sigma
  // or re-running ForceAtlas2 when topology is unchanged.
  useEffect(() => {
    if (!payload) return;
    rendererRef.current?.applyMetadata(payload, topologyRevision ?? null);
  }, [payload, dataRevision, topologyRevision]);

  const getCurrentPayload = useEffectEvent(() => payload);
  const hasNodes = Boolean(payload?.nodes.length);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasNodes || contextDead) return;

    const renderer = new LatticeRenderer(container, {
      quality,
      onNodeSelect: (node) => onNodeSelectRef.current?.(node),
      onStatsChange: (stats) => onStatsChangeRef.current?.(stats),
      onVisibleCountChange: (visible) => onVisibleCountChangeRef.current?.(visible),
      onBuildingChange: setBuilding,
      onContextLoss: () => {
        contextLossesRef.current += 1;
        if (contextLossesRef.current > 1) {
          setContextDead(true);
          return;
        }
        setRebuildNonce((nonce) => nonce + 1);
      },
    });
    rendererRef.current = renderer;

    return () => {
      renderer.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, [hasNodes, quality, rebuildNonce, contextDead]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const payload = getCurrentPayload();
    if (!renderer || !payload || !hasNodes) return;
    void renderer.update(payload, topologyRevision ?? null).catch((error) => {
      console.error("[lattice] failed to mount renderer", error);
      if (rendererRef.current === renderer) setContextDead(true);
    });
  }, [hasNodes, topologyRevision, filterRevision, quality, rebuildNonce]);

  useEffect(() => {
    if (building) return;
    if (focusedNodeId) rendererRef.current?.focusNode(focusedNodeId);
    else rendererRef.current?.clearFocus();
  }, [building, focusedNodeId, filterRevision, topologyRevision, rebuildNonce]);

  if (contextDead) {
    return (
      <div className="flex h-full items-center justify-center bg-[#050202]">
        <p className="max-w-sm px-6 text-center font-mono text-xs uppercase tracking-widest text-muted" role="alert">
          The lattice could not start on this device. Try the Tree or Flow view.
        </p>
      </div>
    );
  }

  if (!payload || payload.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[#050202]">
        <p className="font-mono text-xs uppercase tracking-widest text-white/35">
          No signal lattice indexed
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-[#050202]">
      <div ref={containerRef} className="h-full w-full" />
      {building && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="font-mono text-sm uppercase tracking-widest text-primary animate-pulse">
            Assembling lattice…
          </p>
        </div>
      )}
    </div>
  );
});

SigmaLatticeGraph.displayName = "SigmaLatticeGraph";

export default SigmaLatticeGraph;
