"use client";

import { useMemo } from "react";
import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import CardGraphCanvas from "@/components/visualization/CardGraphCanvas";
import { useProgressiveGraph } from "@/hooks/useProgressiveGraph";
import { getLayoutedElements } from "@/lib/graphFlow/layoutUtils";

export interface ProgressiveTreeGraphProps {
  payload: GraphApiPayload | null;
  dataRevision: string | null;
  initialSeedCount?: number;
  onVisibleCountChange?: (visible: number) => void;
}

function ProgressiveTreeGraphBody({
  payload,
  dataRevision,
  initialSeedCount = 3,
  onVisibleCountChange,
}: ProgressiveTreeGraphProps) {
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
      getLayoutedElements(rawNodes, rawEdges, "tree", {
        fingerprint: dataRevision ?? undefined,
        payload,
      }),
    [rawNodes, rawEdges, dataRevision, payload],
  );

  if (!graphIndex || layouted.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[#050202]">
        <p className="font-mono text-xs uppercase tracking-widest text-white/35">
          No signal roots indexed
        </p>
      </div>
    );
  }

  return (
    <CardGraphCanvas
      key={layoutKey}
      layoutMode="tree"
      fitKey={fitKey}
      focusKey={focusKey}
      focusNodeIds={focusNodeIds}
      layouted={layouted}
      onToggleExpand={onToggleExpand}
    />
  );
}

export default function ProgressiveTreeGraph(props: ProgressiveTreeGraphProps) {
  return (
    <ProgressiveTreeGraphBody key={props.dataRevision ?? "none"} {...props} />
  );
}
