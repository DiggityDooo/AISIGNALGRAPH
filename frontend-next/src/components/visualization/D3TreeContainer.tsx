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
  stroke-opacity: 0.85;
}
${BRANCH_PALETTE.map(
  (color, index) => `.signal-tree__link--b${index} { stroke: ${color}; }`,
).join("\n")}
.signal-tree__node circle {
  transition: r 200ms ease, stroke-width 200ms ease;
}
.signal-tree__node:hover circle {
  stroke-width: 3px;
  filter: brightness(1.08);
}
.signal-tree__label {
  font: 600 11px/1 var(--font-sans, system-ui, sans-serif);
  fill: #ffffff;
  pointer-events: none;
  user-select: none;
}
`;

function truncateLabel(text: string, depth: number): string {
  const max = depth <= 1 ? 14 : depth === 2 ? 10 : 8;
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
  if (depth === 0) return 20;
  if (depth === 1) return 16;
  if (depth === 2) return 13;
  return Math.max(9, 12 - depth + (hasChildren ? 1 : 0));
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
  const fontSize = Math.max(8, 12 - depth * 0.8);

  return (
    <g className="signal-tree__node" onClick={toggleNode} style={{ cursor: hasChildren ? "pointer" : "default" }}>
      <circle r={radius} fill={fill} stroke="#ffffff" strokeWidth={2} />
      <text
        className="signal-tree__label"
        textAnchor="middle"
        dy="0.35em"
        fontSize={fontSize}
      >
        {label}
      </text>
    </g>
  );
}

function pathClassFunc(linkData: TreeLinkDatum): string {
  const index = branchKey(linkData.target) % BRANCH_PALETTE.length;
  return `signal-tree__link signal-tree__link--b${index}`;
}

export default function D3TreeContainer({
  data,
  initialDepth = 2,
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
    return { x: dimensions.width / 2, y: 56 };
  }, [dimensions]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        background: "#ffffff",
        borderRadius: 8,
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
          shouldCollapseNeighborNodes={false}
          zoomable
          draggable
          zoom={0.85}
          scaleExtent={{ min: 0.15, max: 2.5 }}
          nodeSize={{ x: 120, y: 72 }}
          separation={{ siblings: 1.05, nonSiblings: 1.2 }}
          enableLegacyTransitions
          transitionDuration={400}
          centeringTransitionDuration={500}
        />
      )}
    </div>
  );
}
