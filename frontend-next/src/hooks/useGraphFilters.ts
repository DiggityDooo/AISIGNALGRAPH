"use client";

import { useCallback, useState } from "react";
import { NODE_TYPES } from "@/lib/graph/constants.js";
import type { GraphFilterState, GraphLens, GraphNodeSummary } from "@/lib/graph/types";

export function useGraphFilters() {
  const [searchQuery, setSearchQuery] = useState("");
  const [lens, setLens] = useState<GraphLens>("global");
  const [activeYear, setActiveYear] = useState(2026);
  const [activeEra, setActiveEra] = useState("");
  const [serverYearFilter] = useState(true);
  const [signalSpeed, setSignalSpeed] = useState(1);
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<ReadonlySet<string>>(
    () => new Set(NODE_TYPES),
  );
  const [selectedNode, setSelectedNode] = useState<GraphNodeSummary | null>(null);
  const [signalCount, setSignalCount] = useState(0);

  const getFilterState = useCallback(
    (): GraphFilterState => ({
      searchQuery,
      lens,
      activeYear,
      activeEra,
      serverYearFilter,
      signalSpeed,
      visibleNodeTypes,
    }),
    [searchQuery, lens, activeYear, activeEra, serverYearFilter, signalSpeed, visibleNodeTypes],
  );

  const toggleNodeType = useCallback((type: string, enabled: boolean) => {
    setVisibleNodeTypes((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.add(type);
      } else {
        next.delete(type);
      }
      return next;
    });
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    lens,
    setLens,
    activeYear,
    setActiveYear,
    activeEra,
    setActiveEra,
    serverYearFilter,
    signalSpeed,
    setSignalSpeed,
    visibleNodeTypes,
    toggleNodeType,
    selectedNode,
    setSelectedNode,
    signalCount,
    setSignalCount,
    getFilterState,
  };
}
