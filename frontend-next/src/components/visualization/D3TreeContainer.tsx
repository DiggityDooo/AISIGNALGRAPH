"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Tree, {
  type CustomNodeElementProps,
  type RawNodeDatum,
} from "react-d3-tree";

export interface D3TreeContainerProps {
  /** Hierarchical tree produced by `useDataTransformer`. */
  data: RawNodeDatum | null;
  /** Collapse all branches beyond this depth on first render (perf for large graphs). */
  initialDepth?: number;
}

/** Brand accent per signal node type; falls back to the primary cyan. */
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

function accentFor(nodeDatum: RawNodeDatum): string {
  const type = nodeDatum.attributes?.type;
  if (typeof type === "string" && TYPE_COLOR[type]) return TYPE_COLOR[type];
  return TYPE_COLOR.story;
}

/**
 * Organic-motion CSS injected once. react-d3-tree pins nodes to fixed tree
 * coordinates, so true force-directed momentum isn't possible; this mimics the
 * old engine's "alive" feel with a subtle per-node float and a hover spring,
 * while `enableLegacyTransitions` interpolates nodes between layout positions.
 */
const NODE_MOTION_CSS = `
@keyframes rd3t-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
.signal-tree__card {
  animation: rd3t-float 6s ease-in-out infinite;
  transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 220ms ease;
  will-change: transform;
}
.signal-tree__card:hover {
  transform: scale(1.06);
  box-shadow: 0 8px 26px rgba(0,0,0,0.55);
}
@media (prefers-reduced-motion: reduce) {
  .signal-tree__card { animation: none; }
}
`;

function renderDocumentCardNode({
  nodeDatum,
  toggleNode,
  hierarchyPointNode,
}: CustomNodeElementProps) {
  const accent = accentFor(nodeDatum);
  const type =
    typeof nodeDatum.attributes?.type === "string"
      ? (nodeDatum.attributes.type as string)
      : "node";
  const hasChildren =
    Array.isArray(nodeDatum.children) && nodeDatum.children.length > 0;
  const collapsed = nodeDatum.__rd3t.collapsed;
  // Stagger the float so siblings drift out of phase (organic, not uniform).
  const floatDelay = `${(hierarchyPointNode.x % 6).toFixed(2)}s`;

  return (
    <g>
      {/* foreignObject lets us render a branded HTML card inside the SVG tree. */}
      <foreignObject x={-110} y={-28} width={220} height={56} overflow="visible">
        <button
          type="button"
          className="signal-tree__card"
          onClick={toggleNode}
          title={hasChildren ? (collapsed ? "Expand" : "Collapse") : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            height: "100%",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.1)",
            borderLeft: `4px solid ${accent}`,
            background: "rgba(8,2,2,0.85)",
            backdropFilter: "blur(6px)",
            color: "#f5f5f5",
            font: '500 12px/1.2 var(--font-mono, monospace)',
            textAlign: "left",
            cursor: hasChildren ? "pointer" : "default",
            boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
            animationDelay: floatDelay,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: accent,
              flexShrink: 0,
              boxShadow: `0 0 8px ${accent}`,
            }}
          />
          <span style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {nodeDatum.name}
            </span>
            <span
              style={{
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              {type}
              {hasChildren ? ` · ${nodeDatum.children!.length}` : ""}
            </span>
          </span>
        </button>
      </foreignObject>
    </g>
  );
}

export default function D3TreeContainer({
  data,
  initialDepth = 1,
}: D3TreeContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () => {
      setDimensions({ width: element.clientWidth, height: element.clientHeight });
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const translate = useMemo(() => {
    if (!dimensions) return { x: 0, y: 0 };
    return { x: dimensions.width / 2, y: dimensions.height / 2 };
  }, [dimensions]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      <style>{NODE_MOTION_CSS}</style>
      {data && dimensions && (
        <Tree
          data={data}
          orientation="horizontal"
          translate={translate}
          dimensions={dimensions}
          pathFunc="step"
          renderCustomNodeElement={renderDocumentCardNode}
          collapsible
          initialDepth={initialDepth}
          shouldCollapseNeighborNodes
          zoomable
          draggable
          zoom={0.7}
          scaleExtent={{ min: 0.1, max: 3 }}
          nodeSize={{ x: 260, y: 90 }}
          separation={{ siblings: 1, nonSiblings: 1.4 }}
          centeringTransitionDuration={600}
        />
      )}
    </div>
  );
}
