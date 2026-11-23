"use client";

import ArchiveDirectory from "@/components/layout/ArchiveDirectory";
import PageHero from "@/components/layout/PageHero";

export default function StoriesPage() {
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
      <ArchiveDirectory section="stories" />
    </main>
  );
}
