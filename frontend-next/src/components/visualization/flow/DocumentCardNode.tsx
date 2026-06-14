"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

export type DocumentCardData = {
  label: string;
  nodeType: string;
  accentColor: string;
  hasChildren: boolean;
  expanded: boolean;
  childCount: number;
};

export type DocumentCardNodeType = Node<DocumentCardData, "documentCard">;

function DocumentCardNodeComponent({ data, selected }: NodeProps<DocumentCardNodeType>) {
  const { label, nodeType, accentColor, hasChildren, expanded, childCount } = data;

  return (
    <div
      className={`relative flex w-[196px] rounded-md bg-white shadow-md transition-shadow ${
        selected ? "ring-2 ring-primary/70 shadow-lg" : ""
      }`}
      style={{ minHeight: 72 }}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-md"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      />
      <div className="flex flex-1 flex-col gap-1.5 px-3 py-2 pl-4">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-slate-900">
            {label}
          </p>
          {hasChildren && (
            <span
              className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-500"
              title={expanded ? "Double-tap to collapse" : `Double-tap to expand ${childCount} children`}
            >
              {expanded ? "−" : `+${childCount}`}
            </span>
          )}
        </div>
        <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-400">
          {nodeType}
        </p>
        <div className="flex flex-col gap-1" aria-hidden>
          <span className="h-1 w-full rounded-full bg-slate-100" />
          <span className="h-1 w-[80%] rounded-full bg-slate-100" />
          <span className="h-1 w-[60%] rounded-full bg-slate-100" />
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-slate-300 !bg-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-slate-300 !bg-white"
      />
    </div>
  );
}

export const DocumentCardNode = memo(DocumentCardNodeComponent);
