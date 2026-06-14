"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Tree, {
  type CustomNodeElementProps,
  type RawNodeDatum,
  type TreeLinkDatum,
} from "react-d3-tree";

export interface D3TreeContainerProps {
  data: RawNodeDatum | null;
  initialDepth?: number;
}

/** Branch palette — blue / purple / pink families like classic react-d3-tree demos. */
const BRANCH_PALETTE = [
  "#7986cb",
  "#5c6bc0",
  "#9575cd",
  "#7e57c2",
  "#e57373",
  "#ec407a",
  "#f06292",
  "#4db6ac",
  "#26a69a",
  "#ffb74d",
];

const TREE_CSS = `
.signal-tree__link {
  fill: none;
  stroke-width: 1.5px;
  stroke-opacity: 0.75;
}
${BRANCH_PALETTE.map(
  (color, index) => `.signal-tree__link--b${index} { stroke: ${color}; }`,
).join("\n")}
.signal-tree__node circle {
  transition: r 200ms ease, stroke-width 200ms ease;
}
.signal-tree__node:hover circle {
  stroke-width: 3px;
  filter: brightness(1.12);
}
.signal-tree__label {
  font: 600 10px/1.2 var(--font-sans, system-ui, sans-serif);
  fill: rgba(245, 245, 245, 0.95);
  paint-order: stroke;
  stroke: rgba(5, 2, 2, 0.85);
  stroke-width: 3px;
  pointer-events: none;
  user-select: none;
}
.signal-tree__sub {
  font: 8px/1 var(--font-mono, monospace);
  fill: rgba(255, 255, 255, 0.38);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  pointer-events: none;
}
`;

function truncateLabel(text: string, depth: number): string {
  const max = depth <= 1 ? 18 : depth === 2 ? 14 : 10;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function branchKey(node: CustomNodeElementProps["hierarchyPointNode"]): number {
  if (node.depth <= 1) {
    return node.parent?.children?.indexOf(node) ?? 0;
  }
  let current = node;
  while (current.depth > 1 && current.parent) {
    current = current.parent;
  }
  return current.parent?.children?.indexOf(current) ?? 0;
}

function branchColor(node: CustomNodeElementProps["hierarchyPointNode"]): string {
  if (node.depth === 0) {
    return "#4fc3f7";
  }
  return BRANCH_PALETTE[branchKey(node) % BRANCH_PALETTE.length];
}

function nodeRadius(depth: number, hasChildren: boolean): number {
  if (depth === 0) return 14;
  if (depth === 1) return 15;
  if (depth === 2) return 12;
  return Math.max(8, 11 - depth * 0.5 + (hasChildren ? 1 : 0));
}

function renderCircleNode({
  nodeDatum,
  toggleNode,
  hierarchyPointNode,
}: CustomNodeElementProps) {
  const hasChildren = Array.isArray(nodeDatum.children) && nodeDatum.children.length > 0;
  const depth = hierarchyPointNode.depth;
  const fill = branchColor(hierarchyPointNode);
  const radius = nodeRadius(depth, hasChildren);
  const label = truncateLabel(nodeDatum.name, depth);
  const fontSize = Math.max(8, 11 - depth * 0.6);
  const type =
    typeof nodeDatum.attributes?.type === "string"
      ? (nodeDatum.attributes.type as string)
      : "node";
  const showLabel = depth > 0;
  const labelY = radius + 14;

  return (
    <g
      className="signal-tree__node"
      onClick={hasChildren ? toggleNode : undefined}
      style={{ cursor: hasChildren ? "pointer" : "default" }}
    >
      <circle r={radius} fill={fill} stroke="#ffffff" strokeWidth={depth === 0 ? 1.5 : 2} />
      {showLabel && (
        <>
          <text
            className="signal-tree__label"
            textAnchor="middle"
            y={labelY}
            fontSize={fontSize}
          >
            {label}
          </text>
          {depth <= 2 && (
            <text className="signal-tree__sub" textAnchor="middle" y={labelY + 12}>
              {type}
              {hasChildren ? " · +" : ""}
            </text>
          )}
        </>
      )}
    </g>
  );
}

function pathClassFunc(linkData: TreeLinkDatum): string {
  const index = branchKey(linkData.target) % BRANCH_PALETTE.length;
  return `signal-tree__link signal-tree__link--b${index}`;
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
    return { x: dimensions.width / 2, y: 72 };
  }, [dimensions]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        background: "transparent",
      }}
    >
      <style>{TREE_CSS}</style>
      {data && dimensions && (
        <Tree
          data={data}
          orientation="vertical"
          translate={translate}
          dimensions={dimensions}
          pathFunc="step"
          pathClassFunc={pathClassFunc}
          renderCustomNodeElement={renderCircleNode}
          collapsible
          initialDepth={initialDepth}
          shouldCollapseNeighborNodes
          zoomable
          draggable
          zoom={0.72}
          scaleExtent={{ min: 0.12, max: 2.2 }}
          nodeSize={{ x: 156, y: 96 }}
          separation={{ siblings: 1.12, nonSiblings: 1.28 }}
          enableLegacyTransitions
          transitionDuration={350}
          centeringTransitionDuration={450}
        />
      )}
    </div>
  );
}
