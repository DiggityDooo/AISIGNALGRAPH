"use client";

import PageHero from "@/components/layout/PageHero";
import BentoCard from "@/components/ui/BentoCard";
import { usePagedList } from "@/hooks/usePagedList";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface Entity {
  id: string;
  name: string;
  type: string;
  excerpt?: string;
}

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const { visibleItems, hasMore, loadMore, totalCount, visibleCount } =
    usePagedList(entities);

  useEffect(() => {
    fetch("/api/entities")
      .then((res) => res.json())
      .then((data) => {
        setEntities(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch entities:", err);
        setLoading(false);
      });
  }, []);

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading ? (
            <div className="col-span-full text-center font-mono text-primary animate-pulse py-20">
              IDENTIFYING ACTORS...
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

        {!loading && totalCount > 0 && (
          <div className="mt-12 flex flex-col items-center gap-4">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">
              Showing {visibleCount} of {totalCount} actors
            </p>
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                className="glass-pill px-6 py-3 font-mono text-xs uppercase tracking-[0.2em] text-foreground hover:text-primary transition-colors"
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
