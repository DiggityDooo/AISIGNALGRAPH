"use client";

import dynamic from "next/dynamic";
import KineticText from "@/components/ui/KineticText";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useGraphData } from "@/hooks/useGraphData";
import { isGraphFlowEnabled } from "@/lib/graphFlow/featureFlag";
import "../../../public/gephi_lite.css";

const GraphRuntime = dynamic(() => import("./GraphRuntime"), { ssr: false });

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

const SplineGraphBackground = dynamic(
  () => import("@/components/hero/SplineGraphBackground"),
  { ssr: false },
);

// Re-fetch every 30s so scraper/database updates surface without a reload.
const GRAPH_REFRESH_MS = 30_000;

type ViewMode = "graph" | "force" | "tree" | "flow";

export default function GraphPage() {
  const flowModesEnabled = isGraphFlowEnabled();
  const [viewMode, setViewMode] = useState<ViewMode>("graph");
  const [isLoaded, setIsLoaded] = useState(false);
  const [status, setStatus] = useState("Establishing Neural Link...");
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [visibleFlowNodes, setVisibleFlowNodes] = useState(0);
  const loadingTimeoutRef = useRef<number | null>(null);

  const { payload, revision, topologyRevision, loading: flowLoading, error: flowError } = useGraphData({
    refreshMs: GRAPH_REFRESH_MS,
  });

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobileMenuOpen]);

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
    settleOverlay();
  };

  const handleError = (error: unknown) => {
    console.error("Gephi Lite: Runtime error.", error);
    setLoadFailed(true);
    setStatus("Neural Link Interrupted — refresh to retry.");
    setProgress(100);
    settleOverlay();
  };

  const graphModeButtonClass = (active: boolean) =>
    `glass-panel px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider transition-all border ${
      active
        ? "bg-primary/20 text-primary border-primary/40 font-bold"
        : "bg-transparent text-muted hover:text-white border-white/5 hover:border-white/10"
    }`;

  const flowModeButtonClass = (active: boolean) =>
    `glass-panel px-5 py-2.5 font-mono text-sm uppercase tracking-wider transition-all border ${
      active
        ? "bg-primary/20 text-primary border-primary/40 font-bold"
        : "bg-transparent text-muted hover:text-white border-white/5 hover:border-white/10"
    }`;

  return (
    <div id="app-root" data-lenis-prevent className="relative w-full h-screen bg-[#050202] overflow-hidden pointer-events-auto">
      {viewMode === "graph" && (
        <GraphRuntime onReady={handleReady} onError={handleError} />
      )}

      {/* Cinematic Loading Overlay */}
      <AnimatePresence>
        {viewMode === "graph" && !isLoaded && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] bg-[#050202] flex flex-col items-center justify-center p-8"
          >
            <div className="max-w-xl w-full flex flex-col items-center gap-12">
              <div className="relative w-48 h-48">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-2 border-primary/20 border-t-primary rounded-full"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-xl text-primary font-bold">{progress}%</span>
                </div>
              </div>

              <div className="text-center flex flex-col gap-4">
                <h1 className="font-display text-4xl font-bold uppercase tracking-widest text-foreground">
                  <KineticText text="Neural Lattice" />
                </h1>
                <p
                  className={`font-mono text-sm tracking-widest uppercase ${loadFailed ? "text-secondary" : "text-primary animate-pulse"}`}
                  role={loadFailed ? "alert" : "status"}
                >
                  {status}
                </p>
              </div>

              <div className="w-full h-[2px] bg-white/5 relative overflow-hidden">
                <motion.div 
                  className="absolute inset-0 bg-primary"
                  initial={{ x: "-100%" }}
                  animate={{ x: `${progress - 100}%` }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Graph Layout */}
      <div className="absolute inset-0 flex flex-col pt-20">
        <canvas id="flow-canvas-bg" className="absolute inset-0 pointer-events-none opacity-40"></canvas>
        
        {/* HUD Top Stats */}
        <header id="hud-top" className="relative z-30 flex justify-between items-center px-4 md:px-8 py-4 border-b border-white/5 bg-black/40 backdrop-blur-md">
          <div className="flex items-center gap-4 md:gap-8">
             <button 
               type="button"
               onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
               className="md:hidden glass-panel p-2 hover:bg-primary/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
               aria-label={isMobileMenuOpen ? "Close lattice controls" : "Open lattice controls"}
               aria-expanded={isMobileMenuOpen}
               aria-controls="hud-left"
             >
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                 {isMobileMenuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
               </svg>
             </button>
             <h2 className="font-mono text-xs text-primary uppercase tracking-widest hidden sm:block">Lattice Control</h2>
             {flowModesEnabled && (
               <div className="flex gap-1">
                 <button
                   id="toggle-view-graph"
                   onClick={() => setViewMode("graph")}
                   className={graphModeButtonClass(viewMode === "graph")}
                 >
                   Graph
                 </button>
                 <button
                   id="toggle-view-force"
                   onClick={() => setViewMode("force")}
                   className={flowModeButtonClass(viewMode === "force")}
                 >
                   Lattice
                 </button>
                 <button
                   id="toggle-view-tree"
                   onClick={() => setViewMode("tree")}
                   className={flowModeButtonClass(viewMode === "tree")}
                 >
                   Tree
                 </button>
                 <button
                   id="toggle-view-flow"
                   onClick={() => setViewMode("flow")}
                   className={flowModeButtonClass(viewMode === "flow")}
                 >
                   Flow
                 </button>
               </div>
             )}
          </div>
          <div className="flex items-center gap-4 md:gap-6 font-mono text-[10px] text-muted uppercase tracking-widest">
            {viewMode === "graph" ? (
              <>
                <span className="hidden xs:inline">Nodes: <strong id="stat-nodes" className="text-primary">{stats.nodes}</strong></span>
                <span className="hidden xs:inline">Edges: <strong id="stat-edges" className="text-white">{stats.edges}</strong></span>
                <span>Signals: <strong id="stat-signals" className="text-secondary">0</strong></span>
              </>
            ) : (
              <>
                <span className="hidden xs:inline">Visible: <strong className="text-secondary">{visibleFlowNodes}</strong></span>
                <span className="hidden xs:inline">Indexed: <strong className="text-primary">{payload?.nodes.length ?? 0}</strong></span>
                <span>Edges: <strong className="text-white">{payload?.edges.length ?? 0}</strong></span>
              </>
            )}
            {viewMode === "graph" && (
              <div className="flex gap-2 ml-2 md:ml-4">
                <button id="toggle-3d-button" className="glass-panel px-2 md:px-3 py-1 hover:bg-primary/10 transition-colors font-mono text-[10px] uppercase tracking-wider" title="Toggle 3D Neural Space">
                  <span id="toggle-3d-label">3D</span>
                </button>
                <button id="rebuild-button" className="glass-panel px-2 md:px-3 py-1 hover:bg-primary/10 transition-colors">Rebuild</button>
                <button id="fit-button" className="glass-panel px-2 md:px-3 py-1 hover:bg-white/5 transition-colors">Fit</button>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 relative flex">
          {isMobileMenuOpen && (
            <button
              type="button"
              className="md:hidden absolute inset-0 z-10 bg-black/60 backdrop-blur-[2px]"
              aria-label="Close lattice controls"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}
          {/* Left HUD — Sigma-only controls (search/lens/filters) */}
          {viewMode === "graph" && (
            <aside
              id="hud-left"
              className={`
                absolute md:relative z-20 h-full w-64 p-6 border-r border-white/5 bg-black/80 md:bg-black/20 backdrop-blur-md md:backdrop-blur-sm
                flex flex-col gap-8 transition-transform duration-300
                ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
              `}
            >
              <div className="flex flex-col gap-4">
                <label htmlFor="graph-search" className="font-mono text-[9px] text-muted uppercase tracking-widest">Global Search</label>
                <input id="graph-search" type="search" placeholder="Find node..." className="glass-panel w-full bg-white/5 px-3 py-2 text-xs font-mono outline-none focus:border-primary/50 transition-colors" />
              </div>
              <div className="flex flex-col gap-4">
                <label htmlFor="graph-lens" className="font-mono text-[9px] text-muted uppercase tracking-widest">Vision Lens</label>
                <select id="graph-lens" className="glass-panel w-full bg-[#0A0000] px-3 py-2 text-xs font-mono outline-none border-white/10">
                  <option value="global">Global View</option>
                  <option value="local">Local Neighborhood</option>
                </select>
              </div>
              <div className="flex flex-col gap-4">
                <label className="font-mono text-[9px] text-muted uppercase tracking-widest">Node Filters</label>
                <div id="node-type-filters" className="flex flex-col gap-2"></div>
              </div>
            </aside>
          )}

          {/* Graph Container */}
          <main id="sigma-container" className="flex-1 relative bg-black">
            {viewMode === "graph" && (
              <>
                <div id="three-container" className="absolute inset-0 z-5" style={{ display: 'none' }}></div>
                <canvas id="signal-canvas" className="absolute inset-0 pointer-events-none z-10"></canvas>

                {/* Animated Node Visualizer Port */}
                <div id="node-visualizer-container" className="node-visualizer-container absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
                    <div className="neural-sphere">
                        <div className="sphere-core"></div>
                        <div className="sphere-orbit sphere-orbit--1"></div>
                        <div className="sphere-orbit sphere-orbit--2"></div>
                        <div className="sphere-orbit sphere-orbit--3"></div>
                    </div>
                </div>
              </>
            )}

            {viewMode !== "graph" && (
              <div className="absolute inset-0">
                {viewMode === "force" && <SplineGraphBackground mode="lattice" />}
                {(viewMode === "tree" || viewMode === "flow") && (
                  <SplineGraphBackground mode="treeFlow" />
                )}

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
                {viewMode === "force" && payload && (
                  <SigmaLatticeGraph
                    payload={payload}
                    dataRevision={revision}
                    topologyRevision={topologyRevision}
                    onVisibleCountChange={setVisibleFlowNodes}
                  />
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
            )}
          </main>

          {/* Right HUD (Details) — Sigma-only */}
          {viewMode === "graph" && (
          <aside
            id="detail-pane"
            className="glass-card absolute md:relative right-0 z-20 h-full w-full md:w-80 rounded-none md:rounded-l-xl p-6 md:p-8 pointer-events-none [&.is-active]:pointer-events-auto transition-all duration-300 translate-x-full [&.is-active]:translate-x-0 opacity-0 [&.is-active]:opacity-100"
          >
            <div className="flex flex-col gap-6">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-2">
                  <h3 id="detail-title" className="font-display text-2xl font-bold uppercase text-white leading-tight">Select a node</h3>
                  <p id="detail-subtitle" className="font-mono text-[10px] text-primary uppercase tracking-[0.2em]">Select any node</p>
                </div>
                <button 
                  onClick={() => document.getElementById('detail-pane')?.classList.remove('is-active')}
                  className="md:hidden glass-panel p-2 hover:bg-white/10 transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div id="detail-content" className="font-mono text-xs text-muted leading-relaxed space-y-4"></div>
            </div>
          </aside>
          )}
        </div>

        {/* Bottom HUD — Sigma-only filters */}
        {viewMode === "graph" && (
          <footer id="hud-bottom" className="relative z-10 p-4 md:p-6 border-t border-white/5 bg-black/40 backdrop-blur-md flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-12 w-full md:w-auto">
              <div className="flex flex-col gap-2 w-full sm:w-auto">
                <label htmlFor="year-filter" className="font-mono text-[9px] text-muted uppercase tracking-widest">Timeline Filter</label>
                <div className="flex items-center gap-4">
                  <input id="year-filter" type="range" min="2020" max="2026" defaultValue="2026" className="flex-1 sm:w-48 accent-primary h-1 bg-white/10 rounded-lg appearance-none cursor-pointer" />
                  <span id="year-value" className="font-mono text-sm text-primary">2026</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 w-full sm:w-auto">
                <label htmlFor="signal-speed" className="font-mono text-[9px] text-muted uppercase tracking-widest">Signal Speed</label>
                <input id="signal-speed" type="range" min="0.5" max="3" defaultValue="1" step="0.1" className="flex-1 sm:w-32 accent-secondary h-1 bg-white/10 rounded-lg appearance-none cursor-pointer" />
              </div>
            </div>
            <div className="font-mono text-[9px] text-muted uppercase tracking-[0.3em] hidden md:block">
              Autonomous Intelligence Graph &bull; v4.2.0
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
