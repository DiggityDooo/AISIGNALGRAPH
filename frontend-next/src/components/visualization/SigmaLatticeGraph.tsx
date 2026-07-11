"use client";

import {
  forwardRef,
  useEffect,
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
  focusNode: (id: string) => void;
};

const SigmaLatticeGraph = forwardRef<SigmaLatticeGraphHandle, SigmaLatticeGraphProps>(
function SigmaLatticeGraph(
  {
    payload,
    dataRevision,
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
   * entire Sigma/WebGL instance + layout. */
  const onVisibleCountChangeRef = useRef(onVisibleCountChange);
  const onNodeSelectRef = useRef(onNodeSelect);
  const onStatsChangeRef = useRef(onStatsChange);
  /** Device tier resolved once per mount; drives DPR/labels/layout budget. */
  const [quality] = useState(getGraphQualityProfile);
  const [building, setBuilding] = useState(true);
  /** Context-loss recovery: rebuild once, then declare the device out of GPU memory. */
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
    focusNode(id: string) {
      rendererRef.current?.focusNode(id);
    },
  }), [quality.isLowTier]);

  // Metadata-only poll updates: patch labels/colors/sizes without remounting Sigma
  // or re-running ForceAtlas2 when topology is unchanged.
  useEffect(() => {
    if (!payload) return;
    rendererRef.current?.applyMetadata(payload);
  }, [payload, dataRevision, topologyRevision]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !payload || payload.nodes.length === 0) return;

    const renderer = new LatticeRenderer(container, {
      quality,
      onNodeSelect: onNodeSelectRef.current,
      onStatsChange: onStatsChangeRef.current,
      onVisibleCountChange: onVisibleCountChangeRef.current,
      onBuildingChange: setBuilding,
      onContextDead: () => setContextDead(true),
      onRequestRemount: () => setRebuildNonce((nonce) => nonce + 1),
    });
    rendererRef.current = renderer;

    void renderer.update(payload, topologyRevision ?? null, filterRevision).catch(() => {});

    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [topologyRevision, filterRevision, quality, rebuildNonce]);

  if (contextDead) {
    return (
      <div className="flex h-full items-center justify-center bg-[#050202]">
        <p className="max-w-sm px-6 text-center font-mono text-xs uppercase tracking-widest text-secondary">
          Graphics context lost twice — this device ran out of GPU memory.
          Try the Tree or Flow view instead.
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
