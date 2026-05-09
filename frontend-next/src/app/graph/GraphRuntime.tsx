"use client";

import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { useEffect, useEffectEvent } from "react";

type GraphStats = {
  nodes: number;
  edges: number;
};

type GraphProgress = {
  status: string;
  progress: number;
};

type GraphRuntimeProps = {
  onReady?: (stats: GraphStats) => void;
  onError?: (error: unknown) => void;
  onProgress?: (info: GraphProgress) => void;
};

type RuntimeWindow = Window &
  typeof globalThis & {
    Sigma?: typeof Sigma;
    sigma?: { Sigma: typeof Sigma };
    graphology?: { Graph: typeof Graph };
    forceAtlas2?: typeof forceAtlas2;
    gephiLite?: { selectNode?: (id: string) => void };
  };

export default function GraphRuntime({ onReady, onError, onProgress }: GraphRuntimeProps) {
  const emitReady = useEffectEvent((stats: GraphStats) => {
    onReady?.(stats);
  });

  const emitError = useEffectEvent((error: unknown) => {
    onError?.(error);
  });

  const emitProgress = useEffectEvent((info: GraphProgress) => {
    onProgress?.(info);
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
          onReady: (stats: GraphStats) => emitReady(stats),
          onError: (error: unknown) => emitError(error),
          onProgress: (info: GraphProgress) => emitProgress(info),
        });

        if (disposed) {
          cleanup();
        }
      } catch (error) {
        console.error("Gephi Lite: Runtime bootstrap failed.", error);
        emitError(error);
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
      cleanup();
      delete runtimeWindow.gephiLite;
    };
  }, []);

  return null;
}
