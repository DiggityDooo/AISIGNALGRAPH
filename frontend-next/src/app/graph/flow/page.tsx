"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useGraphData } from "@/hooks/useGraphData";
import { isGraphFlowEnabled } from "@/lib/graphFlow/featureFlag";

// sigma/WebGL renderer; keep it out of SSR/export.
const SigmaLatticeGraph = dynamic(
  () => import("@/components/visualization/SigmaLatticeGraph"),
  { ssr: false },
);

// Directed signal-flow overview; keep React Flow + dagre out of SSR/export.
const SignalCardGraph = dynamic(
  () => import("@/components/visualization/SignalCardGraph"),
  { ssr: false },
);

const ProgressiveTreeGraph = dynamic(
  () => import("@/components/visualization/ProgressiveTreeGraph"),
  { ssr: false },
);

// Re-fetch every 30s so scraper/database updates surface without a reload.
const GRAPH_REFRESH_MS = 30_000;

type ViewMode = "force" | "tree" | "flow";

export default function GraphFlowPage() {
  const enabled = isGraphFlowEnabled();
  const [visibleNodes, setVisibleNodes] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("tree");

  const { payload, revision, topologyRevision, loading, error } = useGraphData({
    refreshMs: GRAPH_REFRESH_MS,
  });

  if (!enabled) {
    return (
      <div className="relative w-full h-screen bg-[#050202] flex items-center justify-center">
        <p className="font-mono text-sm text-muted uppercase tracking-widest">
          Signal Tree is disabled
        </p>
      </div>
    );
  }

  const modeButtonClass = (active: boolean) =>
    `glass-panel px-5 py-2.5 font-mono text-sm uppercase tracking-wider transition-all border ${
      active
        ? "bg-primary/20 text-primary border-primary/40 font-bold"
        : "bg-transparent text-muted hover:text-white border-white/5 hover:border-white/10"
    }`;

  return (
    <div data-lenis-prevent className="relative w-full h-screen bg-[#050202] overflow-hidden pt-20">
      <header className="absolute top-20 left-0 right-0 z-20 flex justify-between items-center px-4 md:px-8 py-4 border-b border-white/5 bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <h2 className="font-mono text-xs text-primary uppercase tracking-widest">
            Signal Tree
          </h2>
          <div className="flex gap-1">
            <button
              id="toggle-layout-force"
              onClick={() => setViewMode("force")}
              className={modeButtonClass(viewMode === "force")}
            >
              Lattice
            </button>
            <button
              id="toggle-layout-tree"
              onClick={() => setViewMode("tree")}
              className={modeButtonClass(viewMode === "tree")}
            >
              Tree
            </button>
            <button
              id="toggle-layout-flow"
              onClick={() => setViewMode("flow")}
              className={modeButtonClass(viewMode === "flow")}
            >
              Flow
            </button>
          </div>
        </div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-widest flex gap-6">
          <span>
            Visible:{" "}
            <strong className="text-secondary">{visibleNodes}</strong>
          </span>
          <span>
            Indexed:{" "}
            <strong className="text-primary">{payload?.nodes.length ?? 0}</strong>
          </span>
          <span>
            Edges:{" "}
            <strong className="text-white">{payload?.edges.length ?? 0}</strong>
          </span>
        </div>
      </header>

      <div className="absolute inset-0 pt-32">
        <div className="relative z-10 h-full">
          {error && (
            <p
              role="alert"
              className="font-mono text-sm text-secondary p-8 tracking-widest uppercase"
            >
              Failed to load signal graph — {error.message}
            </p>
          )}
          {!error && loading && !payload && (
            <p
              role="status"
              className="font-mono text-sm text-primary p-8 tracking-widest uppercase animate-pulse"
            >
              Loading signal graph…
            </p>
          )}
          {viewMode === "force" && payload && (
            <SigmaLatticeGraph
              payload={payload}
              dataRevision={revision}
              topologyRevision={topologyRevision}
              onVisibleCountChange={setVisibleNodes}
            />
          )}
          {viewMode === "tree" && payload && (
            <ProgressiveTreeGraph
              payload={payload}
              dataRevision={revision}
              topologyRevision={topologyRevision}
              initialSeedCount={3}
              onVisibleCountChange={setVisibleNodes}
            />
          )}
          {viewMode === "flow" && payload && (
            <SignalCardGraph
              payload={payload}
              dataRevision={revision}
              topologyRevision={topologyRevision}
              initialSeedCount={3}
              onVisibleCountChange={setVisibleNodes}
            />
          )}
        </div>
      </div>
    </div>
  );
}
