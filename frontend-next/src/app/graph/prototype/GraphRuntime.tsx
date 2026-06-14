"use client";

import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { useEffect, useEffectEvent } from "react";
import type { GraphFilterState, GraphNodeSummary, GraphStats } from "@/lib/graph/types";

type GraphRuntimeProps = {
  useReactHud?: boolean;
  getFilterState?: () => GraphFilterState;
  onNodeSelect?: (node: GraphNodeSummary | null) => void;
  onStatsChange?: (stats: GraphStats) => void;
  onReady?: (stats: GraphStats) => void;
  onError?: (error: unknown) => void;
};

type RuntimeWindow = Window &
  typeof globalThis & {
    Sigma?: typeof Sigma;
    sigma?: { Sigma: typeof Sigma };
    graphology?: { Graph: typeof Graph };
    forceAtlas2?: typeof forceAtlas2;
    gephiLite?: {
      selectNode?: (id: string) => void;
      rebuildFilters?: () => void | Promise<unknown>;
      refreshFtsMatches?: () => Promise<void>;
      exportSubgraph?: () => void;
      fit?: () => void;
      toggle3D?: () => Promise<void>;
      rebuildData?: () => Promise<void>;
    };
  };

export default function GraphRuntime({
  useReactHud = false,
  getFilterState,
  onNodeSelect,
  onStatsChange,
  onReady,
  onError,
}: GraphRuntimeProps) {
  const emitReady = useEffectEvent((stats: GraphStats) => {
    onReady?.(stats);
  });

  const emitError = useEffectEvent((error: unknown) => {
    onError?.(error);
  });

  const readFilterState = useEffectEvent(() => getFilterState?.());
  const emitNodeSelect = useEffectEvent((node: GraphNodeSummary | null) => {
    onNodeSelect?.(node);
  });
  const emitStatsChange = useEffectEvent((stats: GraphStats) => {
    onStatsChange?.(stats);
  });

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    const runtimeWindow = window as RuntimeWindow;
    runtimeWindow.Sigma = Sigma;
    runtimeWindow.sigma = { Sigma };
    runtimeWindow.graphology = { Graph };
    runtimeWindow.forceAtlas2 = forceAtlas2;

    const bootstrap = async () => {
      try {
        const { initGephiLite } = await import("./graph");

        if (disposed) {
          return;
        }

        cleanup = await initGephiLite({
          SigmaLib: Sigma,
          GraphCtor: Graph,
          forceAtlas2,
          useReactHud,
          getFilterState: readFilterState,
          onNodeSelect: emitNodeSelect,
          onStatsChange: emitStatsChange,
          onReady: (stats: GraphStats) => emitReady(stats),
          onError: (error: unknown) => emitError(error),
        });

        if (disposed) {
          cleanup();
        }
      } catch (error) {
        console.error("Gephi Lite: Runtime bootstrap failed.", error);
        emitError(error);
      }
    };

    const frameId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!disposed) {
          void bootstrap();
        }
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      disposed = true;
      cleanup();
      delete runtimeWindow.gephiLite;
    };
  }, [useReactHud]);

  return null;
}
