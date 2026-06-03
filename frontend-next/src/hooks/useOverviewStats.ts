"use client";

import { useEffect, useState } from "react";

export type OverviewStats = {
  indexedNodes: number | null;
  edgeLattice: number | null;
  activeSignals: number | null;
  stories: number | null;
  entities: number | null;
};

const EMPTY: OverviewStats = {
  indexedNodes: null,
  edgeLattice: null,
  activeSignals: null,
  stories: null,
  entities: null,
};

function formatStat(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  return value.toLocaleString();
}

export function useOverviewStats() {
  const [stats, setStats] = useState<OverviewStats>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/overview", { headers: { Accept: "application/json" } })
      .then((res) => {
        if (!res.ok) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(`[useOverviewStats] /api/overview returned ${res.status}`);
          }
          return null;
        }
        return res.json();
      })
      .then((payload) => {
        if (cancelled || !payload?.stats) {
          return;
        }
        const raw = payload.stats as Record<string, number>;
        const stories = Number(raw.stories) || 0;
        const entities = Number(raw.entities) || 0;
        setStats({
          indexedNodes: stories + entities,
          edgeLattice: Number(raw.links) || 0,
          activeSignals: Number(raw.active_signals) || 0,
          stories,
          entities,
        });
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[useOverviewStats] /api/overview failed", err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    stats,
    formatStat,
    indexedLabel: formatStat(stats.indexedNodes),
    edgesLabel: formatStat(stats.edgeLattice),
    signalsLabel: formatStat(stats.activeSignals),
    storiesLabel: formatStat(stats.stories),
    entitiesLabel: formatStat(stats.entities),
  };
}
