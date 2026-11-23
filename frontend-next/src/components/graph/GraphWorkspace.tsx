"use client";

import { useRef, type ReactNode } from "react";
import { ERA_OPTIONS } from "@/lib/graph/constants.js";
import type { GraphNodeSummary } from "@/lib/graph/types";
import { accentForType } from "@/lib/graphFlow/nodeColors";

export const VIEW_LABELS = { force: "Lattice", tree: "Tree", flow: "Flow" } as const;
export type ViewMode = keyof typeof VIEW_LABELS;

export type SearchResult = { id: string; label: string; type: string };

type Props = {
  view: ViewMode;
  showModes: boolean;
  onViewChange: (view: ViewMode) => void;
  is3d: boolean;
  onToggle3d?: () => void;
  onFit?: () => void;
  onRefresh: () => void;
  loading: boolean;
  stats: { nodes: number; edges: number; visible?: number };
  query: string;
  onQueryChange: (query: string) => void;
  searchResults: SearchResult[];
  searching: boolean;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  filterCount: number;
  era: string;
  onEraChange: (era: string) => void;
  year: string;
  years: number[];
  onYearChange: (year: string) => void;
  local: boolean;
  onLocalChange: (local: boolean) => void;
  nodeTypes: readonly string[];
  visibleTypes: ReadonlySet<string>;
  onToggleType: (type: string, checked: boolean) => void;
  onReset: () => void;
  selected: GraphNodeSummary | null;
  onSelectNode: (id: string) => void;
  onClear: () => void;
  children: ReactNode;
};

export default function GraphWorkspace(props: Props) {
  const filterButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const selected = props.selected;
  const archiveRoute = selected?.route?.match(/^\/(stories|entities)\/[a-z0-9-]+$/)?.[0];
  const showSearch = props.query.trim().length > 0 && !props.filtersOpen;

  function closeFilters() {
    props.onToggleFilters();
    filterButton.current?.focus();
  }

  return (
    <>
      <header className="graph-toolbar" aria-label="Graph toolbar">
        <h1>AI graph</h1>
        {props.showModes && (
          <div className="graph-modes" role="group" aria-label="Graph view">
            {(Object.entries(VIEW_LABELS) as [ViewMode, string][]).map(([view, label]) => (
              <button id={`toggle-view-${view}`} key={view} type="button"
                aria-pressed={props.view === view} onClick={() => props.onViewChange(view)}>{label}</button>
            ))}
          </div>
        )}
        <div className="graph-search">
          <input
            ref={searchInput}
            id="graph-search"
            aria-label="Search graph nodes"
            aria-describedby={showSearch ? "graph-search-status" : undefined}
            placeholder="Search graph nodes"
            type="search"
            value={props.query}
            onChange={event => props.onQueryChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !props.searching && props.searchResults[0]) {
                props.onSelectNode(props.searchResults[0].id);
              }
            }}
          />
          {showSearch && (
            <div className="graph-search-results">
              <p id="graph-search-status" role="status">
                {props.searching ? "Searching…" : props.searchResults.length ? "Matching nodes" : "No matching nodes"}
              </p>
              {!props.searching && props.searchResults.length > 0 && (
                <ul aria-label="Matching nodes">
                  {props.searchResults.map(result => (
                    <li key={result.id}><button type="button" onClick={() => {
                      searchInput.current?.focus();
                      props.onSelectNode(result.id);
                    }}>
                      <span>{result.label}</span><small>{result.type}</small>
                    </button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="graph-actions">
          <button ref={filterButton} type="button" aria-expanded={props.filtersOpen} aria-controls="graph-filters" onClick={props.onToggleFilters}>
            Filters{props.filterCount > 0 ? ` (${props.filterCount})` : ""}
          </button>
          {props.onToggle3d && <button id="toggle-3d-button" type="button" aria-label={props.is3d ? "Switch to 2D" : "Switch to 3D"} onClick={props.onToggle3d}>
            <span id="toggle-3d-label">{props.is3d ? "2D" : "3D"}</span>
          </button>}
          {props.onFit && <button id="fit-button" type="button" onClick={props.onFit}>Fit</button>}
          <button type="button" onClick={props.onRefresh} disabled={props.loading}>Refresh</button>
        </div>
      </header>
      <div className="graph-stage" data-detail={Boolean(selected)}>
        <div id="sigma-container" className="graph-canvas" aria-label={`${VIEW_LABELS[props.view]} graph view`}>
          {props.children}
        </div>
        {props.filtersOpen && (
          <aside id="graph-filters" className="graph-sheet graph-filters" aria-labelledby="graph-filters-title" onKeyDown={event => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeFilters();
            }
          }}>
            <div className="graph-panel-heading">
              <h2 id="graph-filters-title">Filters</h2>
              <button type="button" onClick={closeFilters} aria-label="Close filters">×</button>
            </div>
            <label htmlFor="era-filter">Era</label>
            <select id="era-filter" value={props.era} onChange={event => props.onEraChange(event.target.value)}>
              {ERA_OPTIONS.map(era => <option key={era.id} value={era.id}>{era.label}</option>)}
            </select>
            <label htmlFor="year-filter">Published through</label>
            <select id="year-filter" value={props.year} onChange={event => props.onYearChange(event.target.value)}>
              <option value="">Any year</option>
              {props.years.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
            {props.view === "force" && <label className="graph-checkbox">
              <input type="checkbox" checked={props.local} onChange={event => props.onLocalChange(event.target.checked)} />
              Selected node and neighbors
            </label>}
            <fieldset>
              <legend>Node types</legend>
              <div className="graph-type-grid">
                {props.nodeTypes.map(type => <label key={type} className="graph-checkbox">
                  <input type="checkbox" checked={props.visibleTypes.has(type)} onChange={event => props.onToggleType(type, event.target.checked)} />
                  <span className="graph-type-dot" aria-hidden="true" style={{ background: accentForType(type) }} /> {type}
                </label>)}
              </div>
            </fieldset>
            <button type="button" className="graph-panel-button" onClick={props.onReset}>Reset filters</button>
          </aside>
        )}
        {selected && (
          <aside id="detail-pane" className="graph-sheet graph-details" aria-labelledby="detail-title">
            <div className="graph-panel-heading">
              <span className="graph-node-type" style={{ color: accentForType(selected.type) }}>{selected.type}</span>
              <button type="button" aria-label="Clear selection" onClick={props.onClear}>×</button>
            </div>
            <h2 id="detail-title">{selected.label}</h2>
            {archiveRoute && <a className="graph-record-link" href={archiveRoute}>Open {archiveRoute.startsWith("/stories/") ? "story" : "entity"} record <span aria-hidden="true">↗</span></a>}
            {(selected.summary || selected.description) && <p>{selected.summary || selected.description}</p>}
            <h3>Connections <span>{selected.neighbors.length}</span></h3>
            {selected.neighbors.length ? (
              <ul className="graph-connections">{selected.neighbors.map(neighbor => (
                <li key={neighbor.id}><button type="button" onClick={() => props.onSelectNode(neighbor.id)}>{neighbor.label}</button></li>
              ))}</ul>
            ) : <p>No connections in this view.</p>}
          </aside>
        )}
      </div>
      <footer className="graph-status">
        <span><strong id="stat-nodes">{props.stats.nodes.toLocaleString()}</strong> nodes</span>
        <span><strong id="stat-edges">{props.stats.edges.toLocaleString()}</strong> edges</span>
        {props.stats.visible !== undefined && <span><strong>{props.stats.visible.toLocaleString()}</strong> displayed</span>}
        {props.loading && <span role="status">Updating graph…</span>}
      </footer>
    </>
  );
}
