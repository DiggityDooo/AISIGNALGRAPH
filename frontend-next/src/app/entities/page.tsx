"use client";

import ArchiveDirectory from "@/components/layout/ArchiveDirectory";
import PageHero from "@/components/layout/PageHero";

export default function EntitiesPage() {
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
      <ArchiveDirectory section="entities" />
    </main>
  );
}
