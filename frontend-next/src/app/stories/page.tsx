"use client";

import PageHero from "@/components/layout/PageHero";
import BentoCard from "@/components/ui/BentoCard";
import { usePagedList } from "@/hooks/usePagedList";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface Story {
  id: string;
  kind: string;
  title: string;
  excerpt?: string;
}

export default function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const { visibleItems, hasMore, loadMore, totalCount, visibleCount } =
    usePagedList(stories);

  useEffect(() => {
    fetch("/api/stories")
      .then((res) => res.json())
      .then((data) => {
        setStories(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch stories:", err);
        setLoading(false);
      });
  }, []);

  return (
    <main className="relative min-h-screen w-full flex flex-col">
      <PageHero
        compact
        eyebrow="Archive Protocol"
        bgTitle="ARCHIVE"
        title="Intelligence Library"
        description="Recovered reports on model launches, infrastructure shocks, policy turns, and emergent risk vectors."
        primaryCta={{ label: "Enter Neural Signal", href: "/graph" }}
      />

      <div className="max-w-6xl mx-auto w-full px-6 md:px-8 pb-32">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading ? (
            <div className="col-span-full text-center font-mono text-primary animate-pulse py-20">
              DECRYPTING ARCHIVES...
            </div>
          ) : (
            visibleItems.map((story, i) => (
              <motion.div
                key={story.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.6) }}
              >
                <BentoCard
                  title={story.kind}
                  value={story.title}
                  description={story.excerpt}
                  href={`/stories/${story.id}`}
                  className="w-full aspect-video"
                />
              </motion.div>
            ))
          )}
        </div>

        {!loading && totalCount > 0 && (
          <div className="mt-12 flex flex-col items-center gap-4">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">
              Showing {visibleCount} of {totalCount} records
            </p>
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                className="glass-pill px-6 py-3 font-mono text-xs uppercase tracking-[0.2em] text-foreground hover:text-primary transition-colors"
              >
                Load more archives
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
