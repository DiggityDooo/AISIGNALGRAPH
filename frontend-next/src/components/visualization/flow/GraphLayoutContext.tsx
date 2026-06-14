"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { LayoutMode } from "@/lib/graphFlow/layoutUtils";

const GraphLayoutContext = createContext<LayoutMode>("flow");

export function GraphLayoutProvider({
  mode,
  children,
}: {
  mode: LayoutMode;
  children: ReactNode;
}) {
  return (
    <GraphLayoutContext.Provider value={mode}>{children}</GraphLayoutContext.Provider>
  );
}

export function useGraphLayoutMode(): LayoutMode {
  return useContext(GraphLayoutContext);
}
