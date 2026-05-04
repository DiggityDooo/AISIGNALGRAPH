"use client";

import dynamic from "next/dynamic";
import TopNav from "@/components/ui/TopNav";
import KineticText from "@/components/ui/KineticText";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const GraphRuntime = dynamic(() => import("./GraphRuntime"), { ssr: false });

export default function GraphPage() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [status, setStatus] = useState("Establishing Neural Link...");
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const loadingTimeoutRef = useRef<number | null>(null);

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
    setStatus("Neural Link Interrupted.");
    setProgress(100);
    settleOverlay();
  };

  return (
    <div id="app-root" className="relative w-full h-screen bg-black overflow-hidden">
      <link rel="stylesheet" href="/gephi_lite.css" />
      <GraphRuntime onReady={handleReady} onError={handleError} />

      <TopNav />

      {/* Cinematic Loading Overlay */}
      <AnimatePresence>
        {!isLoaded && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-[#050202] flex flex-col items-center justify-center p-8"
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
                <p className="font-mono text-sm text-primary animate-pulse tracking-widest uppercase">
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
               onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
               className="md:hidden glass-panel p-2 hover:bg-primary/10 transition-colors"
             >
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                 {isMobileMenuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
               </svg>
             </button>
             <h2 className="font-mono text-xs text-primary uppercase tracking-widest hidden sm:block">Lattice Control</h2>
          </div>
          <div className="flex items-center gap-4 md:gap-6 font-mono text-[10px] text-muted uppercase tracking-widest">
            <span className="hidden xs:inline">Nodes: <strong id="stat-nodes" className="text-primary">{stats.nodes}</strong></span>
            <span className="hidden xs:inline">Edges: <strong id="stat-edges" className="text-white">{stats.edges}</strong></span>
            <span>Signals: <strong id="stat-signals" className="text-secondary">0</strong></span>
            <div className="flex gap-2 ml-2 md:ml-4">
              <button id="toggle-3d-button" className="glass-panel px-2 md:px-3 py-1 hover:bg-primary/10 transition-colors font-mono text-[10px] uppercase tracking-wider" title="Toggle 3D Neural Space">
                <span id="toggle-3d-label">3D</span>
              </button>
              <button id="rebuild-button" className="glass-panel px-2 md:px-3 py-1 hover:bg-primary/10 transition-colors">Rebuild</button>
              <button id="fit-button" className="glass-panel px-2 md:px-3 py-1 hover:bg-white/5 transition-colors">Fit</button>
            </div>
          </div>
        </header>

        <div className="flex-1 relative flex">
          {/* Left HUD */}
          <aside 
            id="hud-left" 
            className={`
              absolute md:relative z-20 h-full w-64 p-6 border-r border-white/5 bg-black/80 md:bg-black/20 backdrop-blur-md md:backdrop-blur-sm 
              flex flex-col gap-8 transition-transform duration-300
              ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
            `}
          >
            <div className="flex flex-col gap-4">
              <label className="font-mono text-[9px] text-muted uppercase tracking-widest">Global Search</label>
              <input id="graph-search" type="search" placeholder="Find node..." className="glass-panel w-full bg-white/5 px-3 py-2 text-xs font-mono outline-none focus:border-primary/50 transition-colors" />
            </div>
            <div className="flex flex-col gap-4">
              <label className="font-mono text-[9px] text-muted uppercase tracking-widest">Vision Lens</label>
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

          {/* Graph Container */}
          <main id="sigma-container" className="flex-1 relative bg-black">
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
          </main>

          {/* Right HUD (Details) */}
          <aside 
            id="detail-pane" 
            className="absolute md:relative right-0 z-20 h-full w-full md:w-80 p-6 md:p-8 border-l border-white/5 bg-black/90 md:bg-black/20 backdrop-blur-xl md:backdrop-blur-sm pointer-events-none [&.is-active]:pointer-events-auto transition-all duration-300 translate-x-full [&.is-active]:translate-x-0 opacity-0 [&.is-active]:opacity-100"
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
        </div>

        {/* Bottom HUD */}
        <footer id="hud-bottom" className="relative z-10 p-4 md:p-6 border-t border-white/5 bg-black/40 backdrop-blur-md flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-12 w-full md:w-auto">
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <label className="font-mono text-[9px] text-muted uppercase tracking-widest">Timeline Filter</label>
              <div className="flex items-center gap-4">
                <input id="year-filter" type="range" min="2020" max="2026" defaultValue="2026" className="flex-1 sm:w-48 accent-primary h-1 bg-white/10 rounded-lg appearance-none cursor-pointer" />
                <span id="year-value" className="font-mono text-sm text-primary">2026</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <label className="font-mono text-[9px] text-muted uppercase tracking-widest">Signal Speed</label>
              <input id="signal-speed" type="range" min="0.5" max="3" defaultValue="1" step="0.1" className="flex-1 sm:w-32 accent-secondary h-1 bg-white/10 rounded-lg appearance-none cursor-pointer" />
            </div>
          </div>
          <div className="font-mono text-[9px] text-muted uppercase tracking-[0.3em] hidden md:block">
            Autonomous Intelligence Graph &bull; v4.2.0
          </div>
        </footer>
      </div>
    </div>
  );
}
