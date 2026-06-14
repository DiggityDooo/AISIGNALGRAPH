"use client";

import { memo } from "react";
import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";

export type SignalEdgeData = {
  accentColor?: string;
  importance?: number;
  /** CSS animation duration in seconds — lower = faster signal. */
  signalDurationSec?: number;
  isCyclic?: boolean;
};

function SignalEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const edgeData = data as SignalEdgeData | undefined;
  const durationSec = edgeData?.signalDurationSec ?? 1.5;
  const accent = edgeData?.accentColor ?? "rgba(0,224,255,0.7)";
  const isCyclic = edgeData?.isCyclic === true;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        stroke: isCyclic ? "#a78bfa" : accent,
        strokeWidth: isCyclic ? 1.25 : (style?.strokeWidth as number | undefined) ?? 1.5,
        opacity: isCyclic ? 0.85 : (style?.opacity as number | undefined) ?? 0.75,
        strokeDasharray: isCyclic ? "6 5" : "8 6",
        animation: `signal-edge-march ${isCyclic ? durationSec * 1.4 : durationSec}s linear infinite`,
      }}
    />
  );
}

export const SignalEdge = memo(SignalEdgeComponent);
