"use client";

import PageHero from "@/components/layout/PageHero";
import BentoCard from "@/components/ui/BentoCard";
import { usePagedList } from "@/hooks/usePagedList";
import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

interface Entity {
  id: string;
  name: string;
  type: string;
  excerpt?: string;
}

const SKELETON_COUNT = 6;

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { visibleItems, hasMore, loadMore, totalCount, visibleCount } =
    usePagedList(entities);

  const fetchEntities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/entities");
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const data: unknown = await res.json();
      if (!Array.isArray(data)) {
        throw new Error("Invalid actor response");
      }
      setEntities(data);
    } catch (err) {
      console.error("Failed to fetch entities:", err);
      setEntities([]);
      setError("Actor feed unavailable. Check the API and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEntities();
  }, [fetchEntities]);

  return (
    <main className="relative min-h-screen w-full flex flex-col">
      <PageHero
        compact
        eyebrow="Entity Surveillance"
        bgTitle="ACTORS"
        title="Actor Directory"
        description="Interactive dossiers for labs, model families, people, infrastructure brokers, and strategic risk actors."
        primaryCta={{ label: "Map the Lattice", href: "/graph" }}
      />

      <div className="max-w-6xl mx-auto w-full px-6 md:px-8 pb-32">
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 min-h-[28rem]"
          aria-busy={loading}
        >
          {loading ? (
            Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <div
                key={`skeleton-${i}`}
                className="glass-panel w-full aspect-square animate-pulse bg-white/[0.03] border-white/5"
                aria-hidden="true"
              />
            ))
          ) : error ? (
            <div
              className="col-span-full flex flex-col items-center gap-4 py-16 text-center"
              role="alert"
            >
              <p className="font-mono text-sm text-primary uppercase tracking-widest">
                {error}
              </p>
              <button
                type="button"
                onClick={() => void fetchEntities()}
                className="glass-pill px-6 py-3 font-mono text-xs uppercase tracking-[0.2em] text-foreground hover:text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Retry actor sync
              </button>
            </div>
          ) : totalCount === 0 ? (
            <div className="col-span-full py-16 text-center" role="status">
              <p className="font-mono text-sm text-muted uppercase tracking-widest">
                No actors identified yet.
              </p>
            </div>
          ) : (
            visibleItems.map((entity, i) => (
              <motion.div
                key={entity.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.6) }}
              >
                <BentoCard
                  title={entity.type}
                  value={entity.name}
                  description={entity.excerpt}
                  href={`/entities/${entity.id}`}
                  className="w-full aspect-square"
                />
              </motion.div>
            ))
          )}
        </div>

        {!loading && !error && totalCount > 0 && (
          <div className="mt-12 flex flex-col items-center gap-4">
            <p
              className="font-mono text-xs uppercase tracking-[0.25em] text-muted"
              role="status"
              aria-live="polite"
            >
              Showing {visibleCount.toLocaleString()} of{" "}
              {totalCount.toLocaleString()} actors
            </p>
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                aria-label={`Load more actors. Currently showing ${visibleCount} of ${totalCount}.`}
                className="glass-pill px-6 py-3 font-mono text-xs uppercase tracking-[0.2em] text-foreground hover:text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Load more actors
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
