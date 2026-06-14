"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import GraphErrorBanner from "@/components/graph/GraphErrorBanner";
import GraphHud from "@/components/graph/GraphHud";
import GraphLoadingOverlay from "@/components/graph/GraphLoadingOverlay";
import { useGraphFilters } from "@/hooks/useGraphFilters";

const GraphRuntime = dynamic(() => import("./GraphRuntime"), { ssr: false });

type GephiLiteWindow = Window & {
  gephiLite?: {
    selectNode?: (id: string) => void;
    rebuildFilters?: () => void | Promise<unknown>;
    refreshFtsMatches?: () => Promise<void>;
    reloadGraphData?: () => Promise<void>;
  };
};

export default function GraphPage() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [status, setStatus] = useState("Establishing Neural Link...");
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const loadingTimeoutRef = useRef<number | null>(null);

  const {
    searchQuery,
    setSearchQuery,
    lens,
    setLens,
    activeYear,
    setActiveYear,
    activeEra,
    setActiveEra,
    signalSpeed,
    setSignalSpeed,
    visibleNodeTypes,
    toggleNodeType,
    selectedNode,
    setSelectedNode,
    signalCount,
    setSignalCount,
    getFilterState,
  } = useGraphFilters();

  useEffect(() => {
    if (isLoaded) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setProgress((prev) => (prev < 90 ? prev + 1 : prev));
    }, 30);

    return () => window.clearInterval(timer);
  }, [isLoaded]);

  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current !== null) {
        window.clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const gephi = (window as GephiLiteWindow).gephiLite;
      await gephi?.refreshFtsMatches?.();
      await gephi?.rebuildFilters?.();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchQuery, lens, signalSpeed, visibleNodeTypes]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (window as GephiLiteWindow).gephiLite?.reloadGraphData?.();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [activeEra, activeYear]);

  const settleOverlay = () => {
    if (loadingTimeoutRef.current !== null) {
      window.clearTimeout(loadingTimeoutRef.current);
    }

    loadingTimeoutRef.current = window.setTimeout(() => {
      setIsLoaded(true);
    }, 250);
  };

  const handleReady = ({ nodes, edges }: { nodes: number; edges: number }) => {
    setStats({ nodes, edges });
    setStatus("Matrix Synced. Vectorizing...");
    setProgress(100);
    setRuntimeError(null);
    settleOverlay();
  };

  const handleError = (error: unknown) => {
    console.error("Gephi Lite: Runtime error.", error);
    const message = error instanceof Error ? error.message : String(error);
    setRuntimeError(message);
    setStatus("Neural Link Interrupted.");
    setProgress(100);
    settleOverlay();
  };

  const retryGraph = () => {
    setRuntimeError(null);
    setIsLoaded(false);
    setStatus("Re-establishing Neural Link...");
    setProgress(0);
    window.location.reload();
  };

  const handleSelectNeighbor = (id: string) => {
    (window as GephiLiteWindow).gephiLite?.selectNode?.(id);
  };

  return (
    <div
      id="app-root"
      data-graph-variant="prototype"
      className="relative w-full h-screen bg-[#050202] overflow-hidden pointer-events-auto"
    >
      <link rel="stylesheet" href="/gephi_lite.css" />
      <div className="absolute top-20 left-1/2 z-20 -translate-x-1/2 pointer-events-none">
        <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/80 border border-primary/30 bg-black/50 px-3 py-1 rounded-full">
          Graph Prototype
        </span>
      </div>
      <GraphRuntime
        useReactHud
        getFilterState={getFilterState}
        onNodeSelect={setSelectedNode}
        onStatsChange={(nextStats) => {
          setStats({ nodes: nextStats.nodes, edges: nextStats.edges });
          if (typeof nextStats.signals === "number") {
            setSignalCount(nextStats.signals);
          }
        }}
        onReady={handleReady}
        onError={handleError}
      />

      <GraphLoadingOverlay isLoaded={isLoaded} progress={progress} status={status} />
      <GraphErrorBanner message={runtimeError ?? ""} onRetry={retryGraph} />

      <GraphHud
        stats={stats}
        signalCount={signalCount}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen((open) => !open)}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        lens={lens}
        onLensChange={setLens}
        activeYear={activeYear}
        onActiveYearChange={setActiveYear}
        activeEra={activeEra}
        onActiveEraChange={setActiveEra}
        signalSpeed={signalSpeed}
        onSignalSpeedChange={setSignalSpeed}
        visibleNodeTypes={visibleNodeTypes}
        onToggleNodeType={toggleNodeType}
        selectedNode={selectedNode}
        onCloseDetail={() => setSelectedNode(null)}
        onSelectNeighbor={handleSelectNeighbor}
      />
    </div>
  );
}
