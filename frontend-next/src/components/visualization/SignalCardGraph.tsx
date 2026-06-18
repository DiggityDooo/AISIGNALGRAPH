"use client";

import { useMemo } from "react";
import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import CardGraphCanvas from "@/components/visualization/CardGraphCanvas";
import { useProgressiveGraph } from "@/hooks/useProgressiveGraph";
import { getLayoutedElements } from "@/lib/graphFlow/layoutUtils";

export interface SignalCardGraphProps {
  payload: GraphApiPayload | null;
  dataRevision: string | null;
  initialSeedCount?: number;
  onVisibleCountChange?: (visible: number) => void;
}

function SignalCardGraphBody({
  payload,
  dataRevision,
  initialSeedCount = 3,
  onVisibleCountChange,
}: SignalCardGraphProps) {
  const {
    graphIndex,
    layoutKey,
    fitKey,
    focusKey,
    focusNodeIds,
    rawNodes,
    rawEdges,
    onToggleExpand,
  } = useProgressiveGraph({
    payload,
    dataRevision,
    initialSeedCount,
    onVisibleCountChange,
  });

  const layouted = useMemo(
    () =>
      getLayoutedElements(rawNodes, rawEdges, "flow", {
        fingerprint: dataRevision ?? undefined,
        payload,
      }),
    [rawNodes, rawEdges, dataRevision, payload],
  );

  if (!graphIndex || layouted.nodes.length === 0) {
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
      key={layoutKey}
      layoutMode="flow"
      fitKey={fitKey}
      focusKey={focusKey}
      focusNodeIds={focusNodeIds}
      layouted={layouted}
      onToggleExpand={onToggleExpand}
    />
  );
}

export default function SignalCardGraph(props: SignalCardGraphProps) {
  return <SignalCardGraphBody key={props.dataRevision ?? "none"} {...props} />;
}
