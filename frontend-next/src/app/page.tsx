"use client";

import TopNav from "@/components/ui/TopNav";
import KineticText from "@/components/ui/KineticText";
import GlassButton from "@/components/ui/GlassButton";
import BentoCard from "@/components/ui/BentoCard";
import ArchivePortal from "@/components/ui/ArchivePortal";

export default function Home() {
  return (
    <main className="relative min-h-screen w-full flex flex-col pt-24 px-8 pb-32">
      <TopNav />
      
      {/* Hero Section */}
      <section className="relative w-full min-h-[80vh] flex flex-col items-center justify-center pointer-events-auto">
        <div className="absolute inset-0 z-0 pointer-events-none">
          {/* We place floating bento cards around the center */}
          <BentoCard 
            title="Indexed Nodes" 
            value="855" 
            href="/entities"
            className="absolute top-1/4 left-1/4 w-48 -translate-x-1/2 -translate-y-1/2" 
          />
          <BentoCard 
            title="Edge Lattice" 
            value="5,187" 
            href="/graph"
            className="absolute top-[20%] right-[30%] w-48" 
          />
          <BentoCard 
            title="Active Signals" 
            value="247" 
            href="/stories"
            className="absolute bottom-1/3 left-1/3 w-48" 
          />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center gap-12 w-full max-w-4xl mx-auto">
          <h1 className="font-display font-bold text-5xl md:text-7xl leading-tight tracking-[0.05em] uppercase text-foreground drop-shadow-[0_0_15px_rgba(255,42,77,0.5)]">
            <KineticText text="The Intelligence Hub for the AI Era" />
          </h1>
          
          <div className="flex flex-col sm:flex-row gap-6 mt-8">
            <GlassButton primary href="/graph">Enter Neural Signal</GlassButton>
            <GlassButton href="/stories">Review Matrix</GlassButton>
          </div>
        </div>
      </section>

      {/* Archives Section */}
      <section className="relative w-full max-w-6xl mx-auto mt-32 flex flex-col md:flex-row justify-between items-center gap-16 pointer-events-auto">
        <ArchivePortal 
          title="INTELLIGENCE LIBRARY"
          subtitle="Query the Archive"
          stats="637 RECORDS RECOVERED"
          href="/stories"
          align="left"
        />
        
        <ArchivePortal 
          title="ACTOR DIRECTORY"
          subtitle="Identify Node"
          stats="218 NODES IDENTIFIED"
          href="/entities"
          align="right"
        />
      </section>
    </main>
  );
}
