"use client";

import { useEffect, useMemo } from "react";
import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import CardGraphCanvas from "@/components/visualization/CardGraphCanvas";
import { buildFlowGraphElements } from "@/lib/graphFlow/flowElements";
import { getLayoutedElements } from "@/lib/graphFlow/layoutUtils";

export interface SignalCardGraphProps {
  payload: GraphApiPayload | null;
  dataRevision: string | null;
  maxNodes?: number;
  onVisibleCountChange?: (visible: number) => void;
}

export default function SignalCardGraph({
  payload,
  dataRevision,
  maxNodes = 24,
  onVisibleCountChange,
}: SignalCardGraphProps) {
  const elements = useMemo(
    () =>
      payload
        ? buildFlowGraphElements(payload, maxNodes)
        : { nodes: [], edges: [] },
    [payload, maxNodes],
  );

  const layouted = useMemo(
    () =>
      getLayoutedElements(elements.nodes, elements.edges, "flow", {
        fingerprint: dataRevision ?? undefined,
        payload,
      }),
    [elements, dataRevision, payload],
  );

  useEffect(() => {
    onVisibleCountChange?.(layouted.nodes.length);
  }, [layouted.nodes.length, onVisibleCountChange]);

  if (layouted.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[#050202]">
        <p className="font-mono text-xs uppercase tracking-widest text-white/35">
          No signal flow indexed
        </p>
      </div>
    );
  }

  return (
    <CardGraphCanvas
      key={dataRevision ?? "none"}
      layoutMode="flow"
      fitKey={dataRevision ?? "none"}
      layouted={layouted}
    />
  );
}
