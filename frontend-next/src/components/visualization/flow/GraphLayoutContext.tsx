"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { LayoutMode } from "@/lib/graphFlow/layoutUtils";

type GraphLayout = {
  mode: LayoutMode;
  onToggleExpand?: (nodeId: string) => void;
};

const GraphLayoutContext = createContext<GraphLayout>({ mode: "flow" });

export function GraphLayoutProvider({ mode, onToggleExpand, children }: GraphLayout & { children: ReactNode }) {
  return <GraphLayoutContext.Provider value={{ mode, onToggleExpand }}>{children}</GraphLayoutContext.Provider>;
}

export function useGraphLayout(): GraphLayout {
  return useContext(GraphLayoutContext);
}
