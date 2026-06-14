"use client";

import { GRAPH_CONFIG } from "@/lib/graph/config.js";
import { ERA_OPTIONS, NODE_TYPES } from "@/lib/graph/constants.js";
import type { GraphLens, GraphNodeSummary } from "@/lib/graph/types";

type GraphHudProps = {
  stats: { nodes: number; edges: number };
  signalCount: number;
  isMobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  lens: GraphLens;
  onLensChange: (value: GraphLens) => void;
  activeYear: number;
  onActiveYearChange: (value: number) => void;
  activeEra: string;
  onActiveEraChange: (value: string) => void;
  signalSpeed: number;
  onSignalSpeedChange: (value: number) => void;
  visibleNodeTypes: ReadonlySet<string>;
  onToggleNodeType: (type: string, enabled: boolean) => void;
  selectedNode: GraphNodeSummary | null;
  onCloseDetail: () => void;
  onSelectNeighbor: (id: string) => void;
};

export default function GraphHud({
  stats,
  signalCount,
  isMobileMenuOpen,
  onToggleMobileMenu,
  searchQuery,
  onSearchQueryChange,
  lens,
  onLensChange,
  activeYear,
  onActiveYearChange,
  activeEra,
  onActiveEraChange,
  signalSpeed,
  onSignalSpeedChange,
  visibleNodeTypes,
  onToggleNodeType,
  selectedNode,
  onCloseDetail,
  onSelectNeighbor,
}: GraphHudProps) {
  return (
    <div className="absolute inset-0 flex flex-col pt-20">
      <canvas id="flow-canvas-bg" className="absolute inset-0 pointer-events-none opacity-40" />

      <header
        id="hud-top"
        className="relative z-30 flex justify-between items-center px-4 md:px-8 py-4 border-b border-white/5 bg-black/40 backdrop-blur-md"
      >
        <div className="flex items-center gap-4 md:gap-8">
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden glass-panel p-2 hover:bg-primary/10 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isMobileMenuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
            </svg>
          </button>
          <h2 className="font-mono text-xs text-primary uppercase tracking-widest hidden sm:block">Lattice Control</h2>
        </div>
        <div className="flex items-center gap-4 md:gap-6 font-mono text-[10px] text-muted uppercase tracking-widest">
          <span className="hidden xs:inline">
            Nodes: <strong id="stat-nodes" className="text-primary">{stats.nodes}</strong>
          </span>
          <span className="hidden xs:inline">
            Edges: <strong id="stat-edges" className="text-white">{stats.edges}</strong>
          </span>
          <span>
            Signals: <strong id="stat-signals" className="text-secondary">{signalCount}</strong>
          </span>
          <div className="flex gap-2 ml-2 md:ml-4">
            <button
              id="toggle-3d-button"
              type="button"
              className="glass-panel px-2 md:px-3 py-1 hover:bg-primary/10 transition-colors font-mono text-[10px] uppercase tracking-wider"
              title="Toggle 3D Neural Space"
            >
              <span id="toggle-3d-label">3D</span>
            </button>
            <button
              id="rebuild-button"
              type="button"
              className="glass-panel px-2 md:px-3 py-1 hover:bg-primary/10 transition-colors"
            >
              Rebuild
            </button>
            <button
              id="fit-button"
              type="button"
              className="glass-panel px-2 md:px-3 py-1 hover:bg-white/5 transition-colors"
            >
              Fit
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 relative flex">
        <aside
          id="hud-left"
          className={`absolute md:relative z-20 h-full w-64 p-6 border-r border-white/5 bg-black/80 md:bg-black/20 backdrop-blur-md md:backdrop-blur-sm flex flex-col gap-8 transition-transform duration-300 ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        >
          <div className="flex flex-col gap-4">
            <label htmlFor="graph-search" className="font-mono text-[9px] text-muted uppercase tracking-widest">
              Global Search
            </label>
            <input
              id="graph-search"
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Find node..."
              className="glass-panel w-full bg-white/5 px-3 py-2 text-xs font-mono outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-4">
            <label htmlFor="graph-lens" className="font-mono text-[9px] text-muted uppercase tracking-widest">
              Vision Lens
            </label>
            <select
              id="graph-lens"
              value={lens}
              onChange={(event) => onLensChange(event.target.value as GraphLens)}
              className="glass-panel w-full bg-[#0A0000] px-3 py-2 text-xs font-mono outline-none border-white/10"
            >
              <option value="global">Global View</option>
              <option value="local">Local Neighborhood</option>
            </select>
          </div>
          <div className="flex flex-col gap-4">
            <span className="font-mono text-[9px] text-muted uppercase tracking-widest">Node Filters</span>
            <div id="node-type-filters" className="flex flex-col gap-2">
              {NODE_TYPES.map((type) => (
                <label key={type} className="node-type-filter-item">
                  <input
                    type="checkbox"
                    checked={visibleNodeTypes.has(type)}
                    onChange={(event) => onToggleNodeType(type, event.target.checked)}
                  />
                  <span
                    className="node-type-dot"
                    style={{ background: GRAPH_CONFIG.nodeColors[type as keyof typeof GRAPH_CONFIG.nodeColors] || "#3793ff" }}
                  />
                  {type.toUpperCase()}
                </label>
              ))}
            </div>
          </div>
        </aside>

        <main id="sigma-container" className="flex-1 relative bg-black">
          <div id="three-container" className="absolute inset-0 z-5" style={{ display: "none" }} />
          <canvas id="signal-canvas" className="absolute inset-0 pointer-events-none z-10" />
          <div
            id="node-visualizer-container"
            className="node-visualizer-container absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20"
          >
            <div className="neural-sphere">
              <div className="sphere-core" />
              <div className="sphere-orbit sphere-orbit--1" />
              <div className="sphere-orbit sphere-orbit--2" />
              <div className="sphere-orbit sphere-orbit--3" />
            </div>
          </div>
        </main>

        <aside
          id="detail-pane"
          className={`absolute md:relative right-0 z-20 h-full w-full md:w-80 p-6 md:p-8 border-l border-white/5 bg-black/90 md:bg-black/20 backdrop-blur-xl md:backdrop-blur-sm pointer-events-none transition-all duration-300 ${selectedNode ? "translate-x-0 opacity-100 pointer-events-auto" : "translate-x-full opacity-0"}`}
        >
          <div className="flex flex-col gap-6">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-2">
                <h3 id="detail-title" className="font-display text-2xl font-bold uppercase text-white leading-tight">
                  {selectedNode ? (
                    <a href={selectedNode.route} className="detail-title-link" title="Open full dossier">
                      {selectedNode.label}
                    </a>
                  ) : (
                    "Select a node"
                  )}
                </h3>
                <p id="detail-subtitle" className="font-mono text-[10px] text-primary uppercase tracking-[0.2em]">
                  {selectedNode?.type.toUpperCase() ?? "Select any node"}
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseDetail}
                className="md:hidden glass-panel p-2 hover:bg-white/10 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div id="detail-content" className="font-mono text-xs text-muted leading-relaxed space-y-4">
              {selectedNode && (
                <>
                  <div className="detail-section">
                    {selectedNode.summary || selectedNode.description || "No further intelligence available for this node."}
                  </div>
                  <div className="detail-community">
                    <label className="detail-community-label">COMMUNITY</label>
                    <div className="detail-community-value">{selectedNode.community_name || "Global Cluster"}</div>
                  </div>
                  <div className="detail-section" style={{ marginTop: "20px" }}>
                    <label className="detail-community-label">CONNECTED INTELLIGENCE</label>
                    <div className="detail-neighbors-list">
                      {selectedNode.neighbors.length ? (
                        selectedNode.neighbors.map((neighbor) => (
                          <button
                            key={neighbor.id}
                            type="button"
                            className="neighbor-chip"
                            onClick={() => onSelectNeighbor(neighbor.id)}
                          >
                            {neighbor.label}
                          </button>
                        ))
                      ) : (
                        <span style={{ color: "#666" }}>No direct connections</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      <footer
        id="hud-bottom"
        className="relative z-10 p-4 md:p-6 border-t border-white/5 bg-black/40 backdrop-blur-md flex flex-col md:flex-row justify-between items-center gap-4"
      >
        <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-12 w-full md:w-auto">
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <label htmlFor="era-filter" className="font-mono text-[9px] text-muted uppercase tracking-widest">
              Era Filter
            </label>
            <select
              id="era-filter"
              value={activeEra}
              onChange={(event) => onActiveEraChange(event.target.value)}
              className="bg-black/40 border border-white/10 rounded px-3 py-2 font-mono text-xs text-white/90"
            >
              {ERA_OPTIONS.map((era) => (
                <option key={era.id || "all"} value={era.id}>
                  {era.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <label htmlFor="year-filter" className="font-mono text-[9px] text-muted uppercase tracking-widest">
              Timeline Filter
            </label>
            <div className="flex items-center gap-4">
              <input
                id="year-filter"
                type="range"
                min={2020}
                max={2026}
                value={activeYear}
                onChange={(event) => onActiveYearChange(Number.parseInt(event.target.value, 10))}
                className="flex-1 sm:w-48 accent-primary h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
              />
              <span id="year-value" className="font-mono text-sm text-primary">
                {activeYear}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <label htmlFor="signal-speed" className="font-mono text-[9px] text-muted uppercase tracking-widest">
              Signal Speed
            </label>
            <input
              id="signal-speed"
              type="range"
              min={0.5}
              max={3}
              step={0.1}
              value={signalSpeed}
              onChange={(event) => onSignalSpeedChange(Number.parseFloat(event.target.value))}
              className="flex-1 sm:w-32 accent-secondary h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
        <div className="font-mono text-[9px] text-muted uppercase tracking-[0.3em] hidden md:block">
          Autonomous Intelligence Graph &bull; v4.2.0
        </div>
      </footer>
    </div>
  );
}
