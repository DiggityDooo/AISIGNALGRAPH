"use client";

import { PointerEventsRoot } from "@/components/layout/PointerEventsRoot";
import PageHero from "@/components/layout/PageHero";
import BentoCard from "@/components/ui/BentoCard";
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
    <PointerEventsRoot className="relative min-h-screen w-full flex flex-col">
      <PageHero
        compact
        eyebrow="Entity Surveillance"
        bgTitle="ACTORS"
        title="Actor Directory"
        description="Interactive dossiers for labs, model families, people, infrastructure brokers, and strategic risk actors."
        primaryCta={{ label: "Map the Lattice", href: "/graph" }}
      />

      <div className="max-w-6xl mx-auto w-full px-6 md:px-8 pb-32 pointer-events-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading ? (
            <div className="col-span-full text-center font-mono text-primary animate-pulse py-20">
              IDENTIFYING ACTORS...
            </div>
          ) : (
            entities.map((entity, i) => (
              <motion.div
                key={entity.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
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
      </div>
    </PointerEventsRoot>
  );
}
