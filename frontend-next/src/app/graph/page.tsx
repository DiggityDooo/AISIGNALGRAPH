"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import GraphWorkspace, { type ViewMode } from "@/components/graph/GraphWorkspace";
import type { Lattice3DHandle } from "@/components/visualization/Lattice3DScene";
import type { SigmaLatticeGraphHandle } from "@/components/visualization/SigmaLatticeGraph";
import { useGraphData } from "@/hooks/useGraphData";
import { NODE_TYPES } from "@/lib/graph/constants.js";
import { filterGraphPayload, filterKey } from "@/lib/graph/latticeFilters";
import { getGraphQualityProfile } from "@/lib/graph/mobileProfile";
import type { GraphNodeSummary } from "@/lib/graph/types";
import { isGraphFlowEnabled } from "@/lib/graphFlow/featureFlag";
import { nodeTypeOf } from "@/lib/graphFlow/nodeColors";
import "./workspace.css";

const SigmaLatticeGraph = dynamic(() => import("@/components/visualization/SigmaLatticeGraph"), { ssr: false });
const Lattice3DScene = dynamic(() => import("@/components/visualization/Lattice3DScene"), { ssr: false });
const SignalCardGraph = dynamic(() => import("@/components/visualization/SignalCardGraph"), { ssr: false });
const ProgressiveTreeGraph = dynamic(() => import("@/components/visualization/ProgressiveTreeGraph"), { ssr: false });

function currentView(value: string | null): ViewMode | undefined {
  if (value === "force" || value === "tree" || value === "flow") return value;
}

function updateGraphUrl(values: Record<string, string | null>, push = false) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (window.location.href !== url.href) {
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }
}

function summarizeNode(payload: GraphApiPayload | null, id: string | null): GraphNodeSummary | null {
  if (!payload || !id) return null;
  const nodes = new Map(payload.nodes.map(node => [node.id, node]));
  const node = nodes.get(id);
  if (!node) return null;
  const adjacent = new Set<string>();
  for (const edge of payload.edges) {
    if (edge.source === id) adjacent.add(edge.target);
    else if (edge.target === id) adjacent.add(edge.source);
  }
  return {
    id,
    label: node.label || id,
    type: nodeTypeOf(node),
    description: node.description,
    route: node.route,
    neighbors: [...adjacent].flatMap(next => {
      const neighbor = nodes.get(next);
      return neighbor ? [{ id: next, label: neighbor.label || next }] : [];
    }).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

function GraphExplorer() {
  const params = useSearchParams();
  const [quality] = useState(getGraphQualityProfile);
  const flowEnabled = isGraphFlowEnabled();
  const focus = params.get("focus");
  const requestedView = currentView(params.get("view"));
  const view = flowEnabled ? requestedView ?? (quality.isLowTier && !focus ? "tree" : "force") : "force";
  const is3d = view === "force" && quality.enable3d && params.get("mode") === "3d";
  const [query, setQuery] = useState("");
  const searchedQuery = useDeferredValue(query);
  const [era, setEra] = useState("");
  const [year, setYear] = useState("");
  const [hiddenTypes, setHiddenTypes] = useState<ReadonlySet<string>>(() => new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [local, setLocal] = useState(false);
  const [displayed, setDisplayed] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const latticeRef = useRef<SigmaLatticeGraphHandle>(null);
  const threeRef = useRef<Lattice3DHandle>(null);

  const { payload, revision, topologyRevision, loading, error, reload } = useGraphData({ refreshMs: 30_000 });
  const nodeTypes = useMemo(() => {
    const present = new Set(payload?.nodes.map(nodeTypeOf) || []);
    return [...NODE_TYPES.filter(type => present.delete(type)), ...[...present].sort()];
  }, [payload]);
  const visibleTypes = useMemo(() => new Set(nodeTypes.filter(type => !hiddenTypes.has(type))), [nodeTypes, hiddenTypes]);
  const years = useMemo(() => {
    const values = (payload?.nodes ?? []).map(node => Number(String(node.year || node.timeline_month || "").slice(0, 4)));
    return [...new Set(values.filter(value => value >= 1900))].sort((a, b) => b - a);
  }, [payload]);
  const maxYear = year ? Number(year) : Infinity;
  const baseFiltered = useMemo(() => payload && filterGraphPayload(payload, {
    searchQuery: "", activeEra: era, activeYear: maxYear, visibleNodeTypes: visibleTypes, lens: "global",
  }), [payload, era, maxYear, visibleTypes]);
  const selected = useMemo(() => view === "force" ? summarizeNode(baseFiltered, focus) : null, [baseFiltered, focus, view]);
  const focusedId = selected?.id ?? null;
  const graphPayload = useMemo(() => local && baseFiltered && focusedId
    ? filterGraphPayload(baseFiltered, { searchQuery: "", activeYear: maxYear, visibleNodeTypes: visibleTypes, lens: "local", selectedNodeId: focusedId })
    : baseFiltered, [baseFiltered, local, focusedId, maxYear, visibleTypes]);
  const filterRevision = filterKey({
    searchQuery: "", activeEra: era, activeYear: maxYear, visibleNodeTypes: visibleTypes,
    lens: local ? "local" : "global", selectedNodeId: focusedId,
  });
  const searchResults = useMemo(() => {
    const needle = searchedQuery.trim().toLowerCase();
    if (!needle || !baseFiltered) return [];
    return baseFiltered.nodes
      .map(node => ({ id: node.id, label: node.label || node.id, type: nodeTypeOf(node) }))
      .filter(node => node.label.toLowerCase().includes(needle))
      .sort((a, b) => Number(!a.label.toLowerCase().startsWith(needle)) - Number(!b.label.toLowerCase().startsWith(needle))
        || a.label.localeCompare(b.label))
      .slice(0, 8);
  }, [baseFiltered, searchedQuery]);

  const changeView = useCallback((next: ViewMode) => {
    if (next === "force" || flowEnabled) {
      setNotice(null);
      setFiltersOpen(false);
      if (next !== view) updateGraphUrl({ view: next, focus: null, mode: null }, true);
    }
  }, [flowEnabled, view]);
  const closeDetails = useCallback(() => updateGraphUrl({ focus: null }), []);
  const selectNode = useCallback((id: string) => {
    setQuery("");
    setFiltersOpen(false);
    updateGraphUrl({ view: "force", focus: id }, view !== "force");
  }, [view]);
  const fit = useCallback(() => {
    if (is3d) threeRef.current?.fit();
    else latticeRef.current?.fit();
  }, [is3d]);
  const onNodeSelect = useCallback((node: GraphNodeSummary | null) => {
    if (node) selectNode(node.id);
    else closeDetails();
  }, [selectNode, closeDetails]);
  const on3dError = useCallback(() => {
    updateGraphUrl({ mode: null });
    setNotice("3D is unavailable. The 2D lattice is open.");
  }, []);
  const resetFilters = useCallback(() => {
    setEra("");
    setYear("");
    setHiddenTypes(new Set());
    setLocal(false);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key === "Escape") {
        if (filtersOpen) setFiltersOpen(false);
        else if (query) setQuery("");
        else if (focus) {
          closeDetails();
          document.getElementById("graph-search")?.focus();
        }
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, [contenteditable]")) return;
      if (event.key === "/") {
        event.preventDefault();
        document.getElementById("graph-search")?.focus();
      } else if (event.key.toLowerCase() === "f" && view === "force") fit();
      else if (event.key === "1") changeView("force");
      else if (event.key === "2") changeView("tree");
      else if (event.key === "3") changeView("flow");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeView, closeDetails, filtersOpen, fit, focus, query, view]);

  const filteredTopology = topologyRevision ? `${topologyRevision}:${filterRevision}` : null;
  const activePayload = view === "force" ? graphPayload : baseFiltered;
  const stats = {
    nodes: activePayload?.nodes.length ?? 0,
    edges: activePayload?.edges.length ?? 0,
    visible: view === "force" || !activePayload?.nodes.length ? undefined : displayed,
  };
  const missingFocus = Boolean(focus && view === "force" && baseFiltered && !selected);
  const filterCount = Number(Boolean(era)) + Number(Boolean(year)) + Number(local && view === "force") + hiddenTypes.size;
  const empty = activePayload?.nodes.length === 0;

  return (
    <main id="app-root" className="graph-workspace" data-lenis-prevent>
      <GraphWorkspace view={view} showModes={flowEnabled} onViewChange={changeView} is3d={is3d}
        onToggle3d={view === "force" && quality.enable3d ? () => {
          setNotice(null);
          updateGraphUrl({ view: "force", mode: is3d ? null : "3d" });
        } : undefined}
        onFit={view === "force" ? fit : undefined} onRefresh={reload}
        loading={loading} stats={stats} query={query} onQueryChange={setQuery}
        searchResults={searchResults} searching={query !== searchedQuery || (!payload && loading)}
        filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen(open => !open)}
        filterCount={filterCount} era={era} onEraChange={setEra}
        year={year} years={years} onYearChange={setYear} local={local} onLocalChange={setLocal}
        nodeTypes={nodeTypes} visibleTypes={visibleTypes}
        onToggleType={(type, checked) => setHiddenTypes(previous => {
          const next = new Set(previous);
          if (checked) next.delete(type);
          else next.add(type);
          return next;
        })}
        onReset={resetFilters} selected={selected} onSelectNode={selectNode}
        onClear={() => {
          closeDetails();
          document.getElementById("graph-search")?.focus();
        }}
      >
        {!payload && loading && <p className="graph-message" role="status">Loading graph…</p>}
        {error && <div className={payload ? "graph-warning" : "graph-message"} role="alert">
          <p>{payload ? "Refresh failed. Showing the last available graph." : "The graph could not load."}</p>
          <button type="button" onClick={reload} disabled={loading}>Try again</button>
        </div>}
        {!error && (notice || missingFocus) && <p className="graph-warning" role="status">
          {notice || "This node is outside the current filters or is no longer available."}
        </p>}
        {empty && <div className="graph-message" role="status">
          <p>{filterCount ? "No nodes match these filters." : "No graph nodes are available yet."}</p>
          {filterCount > 0 && <button type="button" onClick={resetFilters}>Reset filters</button>}
        </div>}
        {activePayload && !empty && view === "force" && !is3d && (
          <SigmaLatticeGraph ref={latticeRef} payload={activePayload} focusedNodeId={focusedId}
            dataRevision={revision} topologyRevision={topologyRevision} filterRevision={filterRevision}
            onNodeSelect={onNodeSelect} />
        )}
        {activePayload && !empty && is3d && (
          <Lattice3DScene ref={threeRef} nodes={activePayload.nodes} edges={activePayload.edges}
            focusNodeId={focusedId} onNodeSelect={onNodeSelect} onError={on3dError} />
        )}
        {baseFiltered && !empty && view === "tree" && (
          <ProgressiveTreeGraph payload={baseFiltered} dataRevision={revision} topologyRevision={filteredTopology}
            onVisibleCountChange={setDisplayed} />
        )}
        {baseFiltered && !empty && view === "flow" && (
          <SignalCardGraph payload={baseFiltered} dataRevision={revision} topologyRevision={filteredTopology}
            onVisibleCountChange={setDisplayed} />
        )}
      </GraphWorkspace>
    </main>
  );
}

export default function GraphPage() {
  return <Suspense fallback={<main className="graph-workspace"><p className="graph-message" role="status">Loading graph…</p></main>}>
    <GraphExplorer />
  </Suspense>;
}
