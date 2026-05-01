"use client";

import TopNav from "@/components/ui/TopNav";
import KineticText from "@/components/ui/KineticText";
import BentoCard from "@/components/ui/BentoCard";
import { motion } from "framer-motion";

import { useEffect, useState } from "react";

export default function EntitiesPage() {
  const [entities, setEntities] = useState<any[]>([]);
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
    <main className="relative min-h-screen w-full flex flex-col pt-32 px-8 pb-32">
      <TopNav />
      
      <div className="max-w-6xl mx-auto w-full">
        <header className="mb-16 text-center">
          <span className="font-mono text-xs text-primary uppercase tracking-[0.3em] mb-4 block">Entity Surveillance</span>
          <h1 className="font-display text-5xl md:text-6xl font-bold uppercase tracking-wider text-foreground mb-4">
            <KineticText text="Actor Directory" />
          </h1>
          <p className="font-mono text-sm text-muted max-w-2xl mx-auto">
            Interactive dossiers for labs, model families, people, infrastructure brokers, and strategic risk actors.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading ? (
            <div className="col-span-full text-center font-mono text-primary animate-pulse py-20">
              IDENTIFYING ACTORS...
            </div>
          ) : entities.map((entity, i) => (
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
          ))}
        </div>
      </div>
    </main>
  );
}
