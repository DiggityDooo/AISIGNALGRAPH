"use client";

import { memo, type CSSProperties } from "react";
import Link from "next/link";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useGraphLayout } from "@/components/visualization/flow/GraphLayoutContext";
import {
  DOCUMENT_CARD_HEIGHT,
  DOCUMENT_CARD_WIDTH,
} from "@/lib/graphFlow/layoutUtils";
import { glowShadowForAccent } from "@/lib/graphFlow/nodeColors";
import { buildLatticeFocusHref } from "@/lib/graphFlow/latticeBridge";

export type DocumentCardData = {
  label: string;
  nodeType: string;
  accentColor: string;
  hasChildren: boolean;
  expanded: boolean;
  childCount: number;
  depth: number;
  nodeId: string;
  progressive?: boolean;
  /** Connection-count-based card size — falls back to the default constants. */
  width?: number;
  height?: number;
  /**
   * Stagger delay (ms) for the slide-down reveal. Set only on children freshly
   * revealed by an expand; undefined means "already on screen" → no animation.
   */
  revealDelayMs?: number;
};

export type DocumentCardNodeType = Node<DocumentCardData, "documentCard">;

const HANDLE_CLASS =
  "!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-cyan-500/60 rounded-full opacity-0";

function DocumentCardNodeComponent({ data, selected }: NodeProps<DocumentCardNodeType>) {
  const {
    label,
    nodeType,
    accentColor,
    hasChildren,
    expanded,
    childCount,
    nodeId,
    progressive = true,
    width = DOCUMENT_CARD_WIDTH,
    height = DOCUMENT_CARD_HEIGHT,
    revealDelayMs,
  } = data;
  const isHub = nodeType === "root";
  const isSection = nodeType === "section";
  const { mode, onToggleExpand } = useGraphLayout();
  const loadMore = nodeType === "load_more";
  const canToggle = Boolean(onToggleExpand && progressive && (hasChildren || loadMore));
  const indexedNode = nodeId.startsWith("story:") || nodeId.startsWith("entity:");
  const targetPos = mode === "tree" ? Position.Top : Position.Left;
  const sourcePos = mode === "tree" ? Position.Bottom : Position.Right;
  const glow = glowShadowForAccent(accentColor);
  const isRevealing = typeof revealDelayMs === "number";
  const style: CSSProperties = {
    width,
    maxWidth: width,
    minHeight: height,
    boxShadow: glow,
    borderWidth: isHub ? 2 : 1,
    borderStyle: isSection ? "dashed" : "solid",
  };
  (style as Record<string, string>)["--glass-accent"] = accentColor;
  if (isRevealing) {
    (style as Record<string, string>)["--card-reveal-delay"] = `${revealDelayMs}ms`;
  }

  return (
    <div
      className={`glass-card relative flex rounded-xl transition-shadow ${
        selected ? "ring-2 ring-primary/70" : ""
      }${isRevealing ? " card-reveal" : ""}`}
      style={style}
    >
      <span
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{
          background: "linear-gradient(160deg, rgba(255,255,255,0.10) 0%, transparent 40%)",
        }}
        aria-hidden
      />
      <span
        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      />
      <div className="flex flex-1 flex-col gap-1.5 break-words p-3 pl-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold leading-tight text-white/92 break-words">
            {label}
          </p>
          {canToggle && !loadMore && (
            <button type="button" className="nodrag nopan shrink-0 rounded border border-primary/45 bg-primary/10 px-2 py-0.5 text-xs text-white hover:bg-primary/25"
              aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
              onClick={event => { event.stopPropagation(); onToggleExpand?.(nodeId); }}
              onDoubleClick={event => event.stopPropagation()}>
              {expanded ? "−" : `+${childCount}`}
            </button>
          )}
          {!progressive && childCount > 0 && (
            <span className="shrink-0 rounded border border-cyan-500/20 bg-cyan-500/5 px-1.5 py-0.5 font-mono text-[9px] text-cyan-200/55">
              →{childCount}
            </span>
          )}
        </div>
        <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/38">
          {nodeType}
        </p>
        {indexedNode && (
          <Link
            href={buildLatticeFocusHref(nodeId)}
            className="nodrag nopan mt-0.5 w-fit rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-cyan-300/90 hover:bg-cyan-500/20"
            onClick={(event) => event.stopPropagation()}
          >
            View in Lattice
          </Link>
        )}
        {loadMore && canToggle && (
          <button type="button" className="nodrag nopan w-fit rounded border border-primary/45 px-2 py-1 text-xs hover:bg-primary/20"
            onClick={event => { event.stopPropagation(); onToggleExpand?.(nodeId); }}
            onDoubleClick={event => event.stopPropagation()}>Show more</button>
        )}
      </div>
      <Handle type="target" position={targetPos} className={HANDLE_CLASS} />
      <Handle type="source" position={sourcePos} className={HANDLE_CLASS} />
    </div>
  );
}

export const DocumentCardNode = memo(DocumentCardNodeComponent);
