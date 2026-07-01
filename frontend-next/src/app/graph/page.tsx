"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GraphHud from "@/components/graph/GraphHud";
import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import { useGraphData } from "@/hooks/useGraphData";
import { useGraphFilters } from "@/hooks/useGraphFilters";
import { filterGraphPayload } from "@/lib/graph/latticeFilters";
import type { GraphNodeSummary } from "@/lib/graph/types";
import { isGraphFlowEnabled } from "@/lib/graphFlow/featureFlag";
import { nodeTypeOf } from "@/lib/graphFlow/nodeColors";
import { getGraphQualityProfile } from "@/lib/graph/mobileProfile";
import type { SigmaLatticeGraphHandle } from "@/components/visualization/SigmaLatticeGraph";
import "../../../public/gephi_lite.css";

const SigmaLatticeGraph = dynamic(
  () => import("@/components/visualization/SigmaLatticeGraph"),
  { ssr: false },
);

const Lattice3DScene = dynamic(
  () => import("@/components/visualization/Lattice3DScene"),
  { ssr: false },
);

const SignalCardGraph = dynamic(
  () => import("@/components/visualization/SignalCardGraph"),
  { ssr: false },
);

const ProgressiveTreeGraph = dynamic(
  () => import("@/components/visualization/ProgressiveTreeGraph"),
  { ssr: false },
);

const GRAPH_REFRESH_MS = 30_000;

type ViewMode = "force" | "tree" | "flow";

function buildNodeSummary(payload: GraphApiPayload, nodeId: string): GraphNodeSummary | null {
  const node = payload.nodes.find((entry) => entry.id === nodeId);
  if (!node) return null;

  const neighbors = payload.edges
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .map((edge) => (edge.source === nodeId ? edge.target : edge.source))
    .filter((id, index, list) => list.indexOf(id) === index)
    .map((id) => {
      const neighbor = payload.nodes.find((entry) => entry.id === id);
      return { id, label: neighbor?.label ?? id };
    });

  return {
    id: node.id,
    label: node.label ?? node.id,
    type: nodeTypeOf(node),
    summary: typeof node.summary === "string" ? node.summary : undefined,
    description: node.description,
    community_name:
      typeof node.community_name === "string" ? node.community_name : undefined,
    route: node.route,
    neighbors,
  };
}

export default function GraphPage() {
  const flowModesEnabled = isGraphFlowEnabled();
  const quality = getGraphQualityProfile();

  const [viewMode, setViewMode] = useState<ViewMode>("force");
  const [is3DMode, setIs3DMode] = useState(false);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [visibleFlowNodes, setVisibleFlowNodes] = useState(0);
  const [readingModeNotice, setReadingModeNotice] = useState(false);
  const [urlFocusId, setUrlFocusId] = useState<string | null>(null);

  const latticeRef = useRef<SigmaLatticeGraphHandle>(null);
  const pendingFocusRef = useRef<string | null>(null);

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
  } = useGraphFilters();

  const { payload, revision, topologyRevision, loading: flowLoading, error: flowError, reload } =
    useGraphData({
      refreshMs: GRAPH_REFRESH_MS,
    });

  const filterRevision = useMemo(
    () =>
      JSON.stringify({
        searchQuery,
        lens,
        activeYear,
        visibleNodeTypes: [...visibleNodeTypes].sort(),
        selectedNodeId: selectedNode?.id ?? null,
      }),
    [searchQuery, lens, activeYear, visibleNodeTypes, selectedNode?.id],
  );

  const filteredPayload = useMemo(() => {
    if (!payload) return null;
    return filterGraphPayload(payload, {
      searchQuery,
      lens,
      activeYear,
      visibleNodeTypes,
      selectedNodeId: selectedNode?.id ?? null,
    });
  }, [payload, searchQuery, lens, activeYear, visibleNodeTypes, selectedNode?.id]);

  useEffect(() => {
    if (!flowModesEnabled) return undefined;
    if (!quality.isLowTier) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      setViewMode("tree");
      setReadingModeNotice(true);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [flowModesEnabled, quality.isLowTier]);

  useEffect(() => {
    if (!readingModeNotice) return undefined;
    const timer = window.setTimeout(() => setReadingModeNotice(false), 6000);
    return () => window.clearTimeout(timer);
  }, [readingModeNotice]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const focus = params.get("focus");
    const mode = params.get("mode");

    if (mode === "3d" && quality.enable3d) {
      setIs3DMode(true);
    }
    if (focus) {
      pendingFocusRef.current = focus;
      setUrlFocusId(focus);
      if (flowModesEnabled) {
        setViewMode("force");
      }
    }
  }, [flowModesEnabled, quality.enable3d]);

  useEffect(() => {
    const focus = pendingFocusRef.current;
    if (!focus || !filteredPayload || is3DMode) return;

    const summary = buildNodeSummary(filteredPayload, focus);
    if (!summary) return;

    latticeRef.current?.focusNode(focus);
    setSelectedNode(summary);
    pendingFocusRef.current = null;
  }, [filteredPayload, is3DMode, setSelectedNode]);

  useEffect(() => {
    if (!is3DMode || !urlFocusId || !filteredPayload) return;
    const summary = buildNodeSummary(filteredPayload, urlFocusId);
    if (summary) {
      setSelectedNode(summary);
    }
  }, [is3DMode, urlFocusId, filteredPayload, setSelectedNode]);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobileMenuOpen]);

  const handleNodeSelect = useCallback(
    (node: GraphNodeSummary | null) => {
      setSelectedNode(node);
      if (node) {
        setUrlFocusId(node.id);
      }
    },
    [setSelectedNode],
  );

  const handleSelectNeighbor = useCallback(
    (id: string) => {
      if (!filteredPayload) return;
      const summary = buildNodeSummary(filteredPayload, id);
      if (!summary) return;
      setSelectedNode(summary);
      setUrlFocusId(id);
      if (is3DMode) return;
      latticeRef.current?.focusNode(id);
    },
    [filteredPayload, is3DMode, setSelectedNode],
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedNode(null);
    setUrlFocusId(null);
  }, [setSelectedNode]);

  const handleFit = useCallback(() => {
    latticeRef.current?.fit();
  }, []);

  const handleRebuild = useCallback(() => {
    reload();
  }, [reload]);

  const flowModeButtonClass = (active: boolean) =>
    `glass-panel px-5 py-2.5 font-mono text-sm uppercase tracking-wider transition-all border ${
      active
        ? "bg-primary/20 text-primary border-primary/40 font-bold"
        : "bg-transparent text-muted hover:text-white border-white/5 hover:border-white/10"
    }`;

  const modeSwitcher = flowModesEnabled ? (
    <div className="flex gap-1">
      <button
        id="toggle-view-force"
        type="button"
        onClick={() => setViewMode("force")}
        className={flowModeButtonClass(viewMode === "force")}
      >
        Lattice
      </button>
      <button
        id="toggle-view-tree"
        type="button"
        onClick={() => setViewMode("tree")}
        className={flowModeButtonClass(viewMode === "tree")}
      >
        Tree
      </button>
      <button
        id="toggle-view-flow"
        type="button"
        onClick={() => setViewMode("flow")}
        className={flowModeButtonClass(viewMode === "flow")}
      >
        Flow
      </button>
    </div>
  ) : null;

  const showLatticeHud = !flowModesEnabled || viewMode === "force";
  const focusNodeId = urlFocusId ?? selectedNode?.id ?? null;

  return (
    <div
      id="app-root"
      data-lenis-prevent
      className="relative w-full h-screen bg-[#050202] overflow-hidden pointer-events-auto"
    >
      {readingModeNotice && (
        <div
          role="status"
          className="absolute bottom-6 left-1/2 z-[70] -translate-x-1/2 glass-panel bg-black/85 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-primary"
        >
          Switched to reading mode for this device
        </div>
      )}

      {showLatticeHud ? (
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
          onCloseDetail={handleCloseDetail}
          onSelectNeighbor={handleSelectNeighbor}
          is3DMode={is3DMode}
          enable3d={quality.enable3d}
          onToggle3d={() => setIs3DMode((value) => !value)}
          onRebuild={handleRebuild}
          onFit={handleFit}
          modeSwitcher={modeSwitcher}
        >
          {flowError && (
            <p
              role="alert"
              className="absolute inset-0 z-30 flex items-center justify-center font-mono text-sm text-secondary p-8 tracking-widest uppercase"
            >
              Failed to load signal graph — {flowError.message}
            </p>
          )}
          {!flowError && flowLoading && !payload && (
            <p
              role="status"
              className="absolute inset-0 z-30 flex items-center justify-center font-mono text-sm text-primary p-8 tracking-widest uppercase animate-pulse"
            >
              Loading signal graph…
            </p>
          )}
          {filteredPayload && !is3DMode && (
            <SigmaLatticeGraph
              ref={latticeRef}
              payload={filteredPayload}
              dataRevision={revision}
              topologyRevision={topologyRevision}
              filterRevision={filterRevision}
              onVisibleCountChange={setVisibleFlowNodes}
              onNodeSelect={handleNodeSelect}
              onStatsChange={setStats}
            />
          )}
          {filteredPayload && is3DMode && (
            <Lattice3DScene
              nodes={filteredPayload.nodes}
              edges={filteredPayload.edges}
              focusNodeId={focusNodeId}
              onNodeSelect={handleNodeSelect}
            />
          )}
        </GraphHud>
      ) : (
        <div className="absolute inset-0 flex flex-col pt-20">
          <canvas id="flow-canvas-bg" className="absolute inset-0 pointer-events-none opacity-40" />

          <header className="relative z-30 flex justify-between items-center px-4 md:px-8 py-4 border-b border-white/5 bg-black/40 backdrop-blur-md">
            <div className="flex items-center gap-4 md:gap-8">
              <h2 className="font-mono text-xs text-primary uppercase tracking-widest hidden sm:block">
                Lattice Control
              </h2>
              {modeSwitcher}
            </div>
            <div className="flex items-center gap-4 md:gap-6 font-mono text-[10px] text-muted uppercase tracking-widest">
              <span className="hidden xs:inline">
                Visible: <strong className="text-secondary">{visibleFlowNodes}</strong>
              </span>
              <span className="hidden xs:inline">
                Indexed: <strong className="text-primary">{payload?.nodes.length ?? 0}</strong>
              </span>
              <span>
                Edges: <strong className="text-white">{payload?.edges.length ?? 0}</strong>
              </span>
            </div>
          </header>

          <main id="sigma-container" className="flex-1 relative bg-black">
            <div className="absolute inset-0">
              <div className="relative z-10 h-full">
                {flowError && (
                  <p
                    role="alert"
                    className="font-mono text-sm text-secondary p-8 tracking-widest uppercase"
                  >
                    Failed to load signal graph — {flowError.message}
                  </p>
                )}
                {!flowError && flowLoading && !payload && (
                  <p
                    role="status"
                    className="font-mono text-sm text-primary p-8 tracking-widest uppercase animate-pulse"
                  >
                    Loading signal graph…
                  </p>
                )}
                {viewMode === "tree" && payload && (
                  <ProgressiveTreeGraph
                    payload={payload}
                    dataRevision={revision}
                    topologyRevision={topologyRevision}
                    initialSeedCount={3}
                    onVisibleCountChange={setVisibleFlowNodes}
                  />
                )}
                {viewMode === "flow" && payload && (
                  <SignalCardGraph
                    payload={payload}
                    dataRevision={revision}
                    topologyRevision={topologyRevision}
                    onVisibleCountChange={setVisibleFlowNodes}
                  />
                )}
              </div>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
