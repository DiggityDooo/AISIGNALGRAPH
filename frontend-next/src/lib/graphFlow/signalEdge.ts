import { MarkerType, type Edge } from "@xyflow/react";
import type { SignalEdgeData } from "@/components/visualization/flow/SignalEdge";
import { signalDurationFromImportance } from "@/lib/graphFlow/nodeColors";

export function createSignalEdge({
  id,
  source,
  target,
  accentColor,
  importance,
  depth = 0,
  isCyclic = false,
}: {
  id: string;
  source: string;
  target: string;
  accentColor: string;
  importance: number;
  depth?: number;
  isCyclic?: boolean;
}): Edge {
  const color = isCyclic ? "#a78bfa" : accentColor;
  const edgeData: SignalEdgeData = {
    accentColor: color,
    importance,
    signalDurationSec: signalDurationFromImportance(importance),
    isCyclic,
  };

  return {
    id,
    source,
    target,
    type: "signal",
    data: edgeData,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      color,
    },
    style: {
      strokeWidth: isCyclic ? 1.25 : Math.max(1, 1.8 - depth * 0.15),
      opacity: isCyclic ? 0.85 : Math.max(0.35, 0.9 - depth * 0.12),
    },
  };
}
