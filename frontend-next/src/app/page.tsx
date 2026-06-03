"use client";

import { PointerEventsRoot } from "@/components/layout/PointerEventsRoot";
import PageHero from "@/components/layout/PageHero";
import StatFloatCard from "@/components/ui/StatFloatCard";
import ArchivePortal from "@/components/ui/ArchivePortal";
import { useOverviewStats } from "@/hooks/useOverviewStats";

export default function Home() {
  const {
    indexedLabel,
    edgesLabel,
    signalsLabel,
    storiesLabel,
    entitiesLabel,
  } = useOverviewStats();

  return (
    <PointerEventsRoot className="relative min-h-screen w-full flex flex-col">
      <section className="relative w-full">
        <StatFloatCard
          title="Indexed Nodes"
          value={indexedLabel}
          href="/entities"
          className="hero-stat hero-stat--bl"
        />
        <StatFloatCard
          title="Edge Lattice"
          value={edgesLabel}
          href="/graph"
          className="hero-stat hero-stat--tr"
        />
        <StatFloatCard
          title="Active Signals"
          value={signalsLabel}
          href="/stories"
          className="hero-stat hero-stat--mr"
        />

        <PageHero
          eyebrow="Neural Signal Platform"
          bgTitle="AISIGNAL"
          title="The Intelligence Hub for the AI Era"
          description="Track labs, models, safety pressure, and strategic pivots through a live neural archive built for high-signal operational awareness."
          primaryCta={{ label: "Enter Neural Signal", href: "/graph" }}
          secondaryCta={{ label: "Review Matrix", href: "/stories" }}
          showScroll
        />
      </section>

      <section
        id="archives"
        className="relative w-full max-w-6xl mx-auto px-6 py-24 md:py-32 flex flex-col md:flex-row justify-between items-center gap-16 pointer-events-auto scroll-mt-28"
      >
        <ArchivePortal
          title="INTELLIGENCE LIBRARY"
          subtitle="Query the Archive"
          stats={`${storiesLabel} RECORDS RECOVERED`}
          href="/stories"
          align="left"
        />
        <ArchivePortal
          title="ACTOR DIRECTORY"
          subtitle="Identify Node"
          stats={`${entitiesLabel} NODES IDENTIFIED`}
          href="/entities"
          align="right"
        />
      </section>
    </PointerEventsRoot>
  );
}
