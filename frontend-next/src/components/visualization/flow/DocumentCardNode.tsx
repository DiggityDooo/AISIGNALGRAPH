"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useGraphLayoutMode } from "@/components/visualization/flow/GraphLayoutContext";

export type DocumentCardData = {
  label: string;
  nodeType: string;
  accentColor: string;
  hasChildren: boolean;
  expanded: boolean;
  childCount: number;
  depth: number;
  layoutWidth?: number;
  layoutHeight?: number;
};

export type DocumentCardNodeType = Node<DocumentCardData, "documentCard">;

const HANDLE_CLASS =
  "!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-cyan-500/60 rounded-full opacity-0";

function DocumentCardNodeComponent({ data, selected }: NodeProps<DocumentCardNodeType>) {
  const { label, nodeType, accentColor, hasChildren, expanded, childCount } = data;
  const canExpand = hasChildren && !expanded;
  const mode = useGraphLayoutMode();
  const targetPos = mode === "tree" ? Position.Top : Position.Left;
  const sourcePos = mode === "tree" ? Position.Bottom : Position.Right;

  return (
    <div
      className={`relative flex w-[280px] max-w-[280px] rounded-md border shadow-md transition-shadow ${
        canExpand ? "border-white/15" : "border-white/8"
      } bg-black/80 ${
        selected ? "ring-2 ring-primary/70 shadow-lg shadow-primary/10" : ""
      }`}
      style={{ minHeight: 100 }}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-md"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      />
      <div className="flex flex-1 flex-col gap-1.5 break-words p-3 pl-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold leading-tight text-white/92 break-words">
            {label}
          </p>
          {hasChildren && (
            <span
              className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${
                canExpand
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-white/15 bg-white/5 text-white/45"
              }`}
              title={expanded ? "Double-tap to collapse" : `Double-tap to expand ${childCount} children`}
            >
              {expanded ? "−" : `+${childCount}`}
            </span>
          )}
        </div>
        <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/38">
          {nodeType}
        </p>
        <div className="flex flex-col gap-1" aria-hidden>
          <span className="h-1 w-full rounded-full bg-white/8" />
          <span className="h-1 w-[80%] rounded-full bg-white/6" />
          <span className="h-1 w-[60%] rounded-full bg-white/5" />
        </div>
      </div>
      <Handle type="target" position={targetPos} className={HANDLE_CLASS} />
      <Handle type="source" position={sourcePos} className={HANDLE_CLASS} />
    </div>
  );
}

export const DocumentCardNode = memo(DocumentCardNodeComponent);
