"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { hierarchy, tree, type HierarchyNode } from "d3-hierarchy";
import { type Simulation, type SimulationNodeDatum } from "d3-force";
import { runForceLayout } from "@/lib/graphFlow/layoutUtils";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import type { RawNodeDatum } from "react-d3-tree";

export interface ForceTreeProps {
  data: RawNodeDatum | null;
  dataRevision?: string | null;
  initialSeedCount?: number;
  onVisibleCountChange?: (visible: number) => void;
  onNodeSelect?: (node: RawNodeDatum) => void;
}

type SimNode = HierarchyNode<RawNodeDatum> &
  SimulationNodeDatum & {
    anchorX: number;
    anchorY: number;
  };

type LayoutLink = { source: SimNode; target: SimNode };

type PosSnapshot = { x: number; y: number; vx: number; vy: number };

const TYPE_COLOR: Record<string, string> = {
  root: "#ffffff",
  story: "#00e0ff",
  entity: "#7c5cff",
  lab: "#ff5c8a",
  model: "#34d399",
  person: "#fbbf24",
  risk: "#ef4444",
  topic: "#22d3ee",
  product: "#a78bfa",
  year: "#94a3b8",
  community: "#f97316",
};

const NODE_CSS = `
.signal-tree__node { cursor: pointer; }
.signal-tree__node circle { transition: r 180ms ease, stroke-width 180ms ease; }
.signal-tree__node:hover circle.signal-tree__core { stroke-width: 3; }
.signal-tree__hit { fill: transparent; pointer-events: all; }
.signal-tree__label {
  font: 11px/1.2 var(--font-mono, monospace);
  fill: rgba(245,245,245,0.92);
  paint-order: stroke;
  stroke: rgba(5,2,2,0.9);
  stroke-width: 3px;
  pointer-events: none;
  user-select: none;
}
.signal-tree__sub {
  font: 8px/1 var(--font-mono, monospace);
  fill: rgba(255,255,255,0.4);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  pointer-events: none;
}
.signal-tree__link { fill: none; stroke-linecap: round; pointer-events: none; }
`;

const MAX_LABEL = 26;
const DRAG_THRESHOLD_PX = 3;

function truncate(text: string): string {
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text;
}

function radiusFor(datum: RawNodeDatum, hasChildren: boolean): number {
  if (datum.attributes?.type === "root") return 16;
  const importance =
    typeof datum.attributes?.importance === "number"
      ? datum.attributes.importance
      : 0;
  return Math.max(5, Math.min(13, 6 + importance * 0.6 + (hasChildren ? 2 : 0)));
}

function hitRadiusFor(datum: RawNodeDatum, hasChildren: boolean): number {
  const visualR = radiusFor(datum, hasChildren);
  return Math.max(18, visualR + 12);
}

function idOf(datum: RawNodeDatum): string {
  const raw = datum.attributes?.id;
  return typeof raw === "string" ? raw : datum.name;
}

function accentFor(datum: RawNodeDatum): string {
  const type = datum.attributes?.type;
  if (typeof type === "string" && TYPE_COLOR[type]) return TYPE_COLOR[type];
  return TYPE_COLOR.story;
}

function outDegreeOf(datum: RawNodeDatum): number {
  const raw = datum.attributes?.outDegree;
  if (typeof raw === "number") return raw;
  return datum.children?.length ?? 0;
}

/** Visible tree leaf — no expanded children rendered. */
function isVisibleLeaf(node: SimNode): boolean {
  return !node.children || node.children.length === 0;
}

/** Frontier expand: visible leaf with hidden children. */
function canExpandFrontier(node: SimNode, collapsedIds: Set<string>): boolean {
  const fullChildCount = node.data.children?.length ?? 0;
  if (fullChildCount === 0) return false;
  return collapsedIds.has(idOf(node.data)) && isVisibleLeaf(node);
}

function normalizeScores(values: number[]): (v: number) => number {
  if (values.length === 0) return () => 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range <= 0) return () => 0.5;
  return (v) => (v - min) / range;
}

/** Radial tree coords → screen anchors with root at canvas center. */
function applyRadialAnchors(
  nodes: SimNode[],
  cx: number,
  cy: number,
  maxRadius: number,
): void {
  for (const n of nodes) {
    const angle = (n as unknown as { x: number }).x;
    const radius = (n as unknown as { y: number }).y;
    const norm = maxRadius > 0 ? radius / maxRadius : 0;
    const spread = 0.55 + norm * 0.85;
    n.anchorX = cx + Math.cos(angle - Math.PI / 2) * radius * spread;
    n.anchorY = cy + Math.sin(angle - Math.PI / 2) * radius * spread;
  }
}

/**
 * Top `seedCount` direct children of __root__ start expanded; all other
 * branches with children default to collapsed.
 */
function buildPriorityCollapsed(
  data: RawNodeDatum,
  options: { seedCount: number; rootId: string },
): Set<string> {
  const { seedCount, rootId } = options;
  const next = new Set<string>();
  const rootChildren = data.children ?? [];
  if (rootChildren.length === 0) return next;

  const importances = rootChildren.map((c) =>
    typeof c.attributes?.importance === "number" ? c.attributes.importance : 0,
  );
  const outDegrees = rootChildren.map(outDegreeOf);
  const normImportance = normalizeScores(importances);
  const normOutDegree = normalizeScores(outDegrees);

  const ranked = rootChildren
    .map((child, i) => ({
      id: idOf(child),
      score: 0.6 * normImportance(importances[i]) + 0.4 * normOutDegree(outDegrees[i]),
    }))
    .sort((a, b) => b.score - a.score);

  const expandedIds = new Set(
    ranked.slice(0, Math.max(0, seedCount)).map((r) => r.id),
  );

  hierarchy(data).each((n) => {
    if (!n.children?.length) return;
    const id = idOf(n.data);
    if (id === rootId || n.depth === 0) return;
    if (n.depth === 1) {
      if (!expandedIds.has(id)) next.add(id);
      return;
    }
    next.add(id);
  });

  return next;
}

export default function ForceTree({
  data,
  dataRevision,
  initialSeedCount = 8,
  onVisibleCountChange,
  onNodeSelect,
}: ForceTreeProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);

  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [layout, setLayout] = useState<{ nodes: SimNode[]; links: LayoutLink[] }>({
    nodes: [],
    links: [],
  });
  /** User expand/collapse overrides keyed by node id. */
  const [userToggles, setUserToggles] = useState<Map<string, boolean>>(
    () => new Map(),
  );
  const lastRevisionRef = useRef<string | null>(null);

  // Default collapse computed synchronously — never render full tree on frame 1.
  const defaultCollapsed = useMemo(() => {
    if (!data) return new Set<string>();
    return buildPriorityCollapsed(data, { seedCount: initialSeedCount, rootId: '__root__' });
  }, [data, initialSeedCount]);

  const collapsed = useMemo(() => {
    const next = new Set(defaultCollapsed);
    for (const [id, isCollapsed] of userToggles) {
      if (isCollapsed) next.add(id);
      else next.delete(id);
    }
    return next;
  }, [defaultCollapsed, userToggles]);

  // Clear stale toggles when scraper ships new graph revision.
  useEffect(() => {
    if (!dataRevision || dataRevision === lastRevisionRef.current) return;
    lastRevisionRef.current = dataRevision;
    setUserToggles(new Map());
  }, [dataRevision]);

  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const positionsRef = useRef<Map<string, PosSnapshot>>(new Map());
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const dragRef = useRef<{
    node: SimNode;
    moved: boolean;
    startX: number;
    startY: number;
  } | null>(null);
  const zoomReadyRef = useRef(false);
  const lastStructuralKeyRef = useRef("");
  const tickRafRef = useRef<number | null>(null);

  const [, tick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!data || !dims) return;
    let cancelled = false;

    const cx = dims.w / 2;
    const cy = dims.h / 2;
    const maxRadius = Math.min(dims.w, dims.h) * 0.42;
    const viewportScale = Math.min(dims.w, dims.h) / 800;

    const root = hierarchy<RawNodeDatum>(data, (d) =>
      collapsed.has(idOf(d)) ? null : d.children,
    );

    tree<RawNodeDatum>()
      .size([2 * Math.PI, maxRadius])
      .separation((a, b) => (a.parent === b.parent ? 1.2 : 1.8) / (a.depth + 1))(root);

    const nodes = root.descendants() as SimNode[];
    const links = root.links() as unknown as LayoutLink[];
    applyRadialAnchors(nodes, cx, cy, maxRadius);

    const structuralKey = `${nodes.map((n) => idOf(n.data)).join(",")}|${collapsed.size}`;
    const structuralChange = structuralKey !== lastStructuralKeyRef.current;
    lastStructuralKeyRef.current = structuralKey;

    const saved = positionsRef.current;
    for (const n of nodes) {
      const id = idOf(n.data);
      const prior = saved.get(id);
      if (prior) {
        n.x = prior.x;
        n.y = prior.y;
        n.vx = prior.vx;
        n.vy = prior.vy;
      } else if (n.parent) {
        const parent = n.parent as SimNode;
        const angle = Math.random() * Math.PI * 2;
        const dist = 40 + Math.random() * 30;
        n.x = (parent.x ?? parent.anchorX) + Math.cos(angle) * dist;
        n.y = (parent.y ?? parent.anchorY) + Math.sin(angle) * dist;
        n.vx = 0;
        n.vy = 0;
      } else {
        n.x = n.anchorX;
        n.y = n.anchorY;
        n.vx = 0;
        n.vy = 0;
      }
    }

    queueMicrotask(() => {
      if (!cancelled) {
        setLayout({ nodes, links });
        onVisibleCountChange?.(nodes.length);
      }
    });

    const linkDistance = 140 * Math.max(0.75, Math.min(1.25, viewportScale));

    simRef.current?.stop();
    const sim = runForceLayout(nodes, links, {
      chargeStrength: -800,
      collidePadding: 12,
      collideRadius: (d) =>
        hitRadiusFor(d.data, (d.children?.length ?? 0) > 0),
      linkDistance,
      cx,
      cy,
      getAnchorX: (d) => d.anchorX,
      getAnchorY: (d) => d.anchorY,
      warmupTicks: structuralChange ? 25 : 0,
    })
      .alpha(structuralChange ? 0.55 : 0.12)
      .alphaDecay(0.006)
      .alphaMin(0.001)
      .on("tick", () => {
        for (const n of nodes) {
          saved.set(idOf(n.data), {
            x: n.x ?? 0,
            y: n.y ?? 0,
            vx: n.vx ?? 0,
            vy: n.vy ?? 0,
          });
        }
        if (tickRafRef.current !== null) return;
        tickRafRef.current = requestAnimationFrame(() => {
          tickRafRef.current = null;
          tick();
        });
      });

    simRef.current = sim;
    return () => {
      cancelled = true;
      if (tickRafRef.current !== null) {
        cancelAnimationFrame(tickRafRef.current);
        tickRafRef.current = null;
      }
      sim.stop();
    };
  }, [data, dims, collapsed, onVisibleCountChange]);

  // Subtle drift only when tree is small enough to stay readable.
  useEffect(() => {
    const id = window.setInterval(() => {
      const sim = simRef.current;
      const visible = layout.nodes.length;
      if (!sim || sim.alpha() > 0.08 || visible > 80) return;
      sim.alpha(0.06).restart();
    }, 5000);
    return () => window.clearInterval(id);
  }, [layout.nodes.length]);

  useEffect(() => {
    if (!svgRef.current || !dims) return;
    const svgSel = select(svgRef.current);
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 4])
      .filter((event) => {
        const target = event.target as Element | null;
        if (target?.closest?.(".signal-tree__node")) return false;
        return !event.ctrlKey && !event.button;
      })
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        if (gRef.current) {
          select(gRef.current).attr("transform", event.transform.toString());
        }
      });

    svgSel.call(zoomBehavior);
    if (!zoomReadyRef.current) {
      const initial = zoomIdentity.translate(0, 0).scale(0.85);
      svgSel.call(zoomBehavior.transform, initial);
      transformRef.current = initial;
      if (gRef.current) {
        select(gRef.current).attr("transform", initial.toString());
      }
      zoomReadyRef.current = true;
    }

    return () => {
      svgSel.on(".zoom", null);
    };
  }, [dims]);

  const onNodePointerDown = (node: SimNode, event: ReactPointerEvent) => {
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    simRef.current?.alphaTarget(0.15).restart();
    node.fx = node.x;
    node.fy = node.y;
    dragRef.current = {
      node,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const onNodePointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !svgRef.current) return;
    if (!drag.moved) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const [wx, wy] = transformRef.current.invert([
      event.clientX - rect.left,
      event.clientY - rect.top,
    ]);
    drag.node.fx = wx;
    drag.node.fy = wy;
  };

  const toggleCollapse = useCallback((node: SimNode) => {
    setUserToggles((prev) => {
      const next = new Map(prev);
      const id = idOf(node.data);
      const currently = collapsed.has(id);
      next.set(id, !currently);
      
      if (currently && node.parent && node.parent.children) {
        for (const sibling of node.parent.children) {
          const siblingId = idOf(sibling.data);
          if (siblingId !== id && (sibling.data.children?.length ?? 0) > 0) {
            next.set(siblingId, true);
          }
        }
      }
      return next;
    });
  }, [collapsed]);

  const onNodePointerUp = (node: SimNode, event: ReactPointerEvent) => {
    const drag = dragRef.current;
    simRef.current?.alphaTarget(0);
    node.fx = null;
    node.fy = null;
    dragRef.current = null;
    if (drag && !drag.moved) {
      event.stopPropagation();
      const fullChildCount = node.data.children?.length ?? 0;
      if (canExpandFrontier(node, collapsed)) {
        toggleCollapse(node);
      } else if (fullChildCount > 0 && !isVisibleLeaf(node)) {
        toggleCollapse(node);
      } else {
        onNodeSelect?.(node.data);
      }
    }
  };

  const { nodes, links } = layout;
  const showLabels = nodes.length <= 60;
  const nodesByDepth = useMemo(
    () => [...nodes].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0)),
    [nodes],
  );

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%" }}>
      <style>{NODE_CSS}</style>
      <svg ref={svgRef} width="100%" height="100%" style={{ cursor: "grab" }}>
        <g ref={gRef}>
          {links.map((link, i) => {
            const s = link.source;
            const t = link.target;
            const depth = t.depth ?? 1;
            const width = Math.max(0.4, 2.2 - depth * 0.28);
            const opacity = Math.max(0.04, 0.26 - depth * 0.025);
            const mx = (s.x! + t.x!) / 2;
            const my = (s.y! + t.y!) / 2;
            return (
              <path
                key={`${idOf(s.data)}-${idOf(t.data)}-${i}`}
                className="signal-tree__link"
                stroke={`rgba(0,224,255,${opacity})`}
                strokeWidth={width}
                d={`M${s.x},${s.y} Q${mx},${my} ${t.x},${t.y}`}
              />
            );
          })}

          {nodesByDepth.map((node) => {
            const datum = node.data;
            const accent = accentFor(datum);
            const type =
              typeof datum.attributes?.type === "string"
                ? (datum.attributes.type as string)
                : "node";
            const childCount = datum.children?.length ?? 0;
            const nodeId = idOf(datum);
            const isCollapsed = childCount > 0 && collapsed.has(nodeId);
            const frontierExpand = canExpandFrontier(node, collapsed);
            const r = radiusFor(datum, childCount > 0);
            const hitR = hitRadiusFor(datum, childCount > 0);
            return (
              <g
                key={nodeId}
                className="signal-tree__node"
                transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
                onPointerDown={(e) => onNodePointerDown(node, e)}
                onPointerMove={onNodePointerMove}
                onPointerUp={(e) => onNodePointerUp(node, e)}
                style={{
                  touchAction: "none",
                  cursor: frontierExpand ? "pointer" : "grab",
                }}
              >
                <circle className="signal-tree__hit" r={hitR} />
                <title>
                  {datum.name}
                  {frontierExpand
                    ? ` (${childCount} hidden — click to expand)`
                    : childCount > 0 && !isVisibleLeaf(node)
                      ? ` (${node.children?.length ?? 0} visible — click to collapse)`
                      : ""}
                </title>
                <circle r={r + 6} fill={accent} opacity={0.16} pointerEvents="none" />
                {isCollapsed && (
                  <circle
                    r={r + 4}
                    fill="none"
                    stroke={accent}
                    strokeWidth={frontierExpand ? 1.5 : 1}
                    strokeDasharray="2 3"
                    opacity={frontierExpand ? 0.9 : 0.45}
                    pointerEvents="none"
                  />
                )}
                <circle
                  className="signal-tree__core"
                  r={r}
                  fill="rgba(8,2,2,0.9)"
                  stroke={accent}
                  strokeWidth={2}
                  pointerEvents="none"
                />
                <circle r={r * 0.42} fill={accent} pointerEvents="none" />
                {showLabels && (
                  <>
                    <text className="signal-tree__label" x={r + 6} dy="0.32em">
                      {truncate(datum.name)}
                    </text>
                    <text className="signal-tree__sub" x={r + 6} dy="1.7em">
                      {type}
                      {childCount > 0 ? ` · ${childCount}${isCollapsed ? " +" : ""}` : ""}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
