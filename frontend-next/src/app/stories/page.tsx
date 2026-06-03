"use client";

import { PointerEventsRoot } from "@/components/layout/PointerEventsRoot";
import PageHero from "@/components/layout/PageHero";
import BentoCard from "@/components/ui/BentoCard";
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
    <PointerEventsRoot className="relative min-h-screen w-full flex flex-col">
      <PageHero
        compact
        eyebrow="Archive Protocol"
        bgTitle="ARCHIVE"
        title="Intelligence Library"
        description="Recovered reports on model launches, infrastructure shocks, policy turns, and emergent risk vectors."
        primaryCta={{ label: "Enter Neural Signal", href: "/graph" }}
      />

      <div className="max-w-6xl mx-auto w-full px-6 md:px-8 pb-32 pointer-events-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading ? (
            <div className="col-span-full text-center font-mono text-primary animate-pulse py-20">
              DECRYPTING ARCHIVES...
            </div>
          ) : (
            stories.map((story, i) => (
              <motion.div
                key={story.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
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
      </div>
    </PointerEventsRoot>
  );
}
