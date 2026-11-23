"use client";

import Link from "next/link";
import { useOverviewStats } from "@/hooks/useOverviewStats";

export default function Home() {
  const { indexedLabel, edgesLabel, storiesLabel, entitiesLabel } = useOverviewStats();
  return (
    <main className="atlas-home">
      <div className="desk-wrap">
        <section className="atlas-intro">
          <p className="desk-kicker">Knowledge graph</p>
          <h1>The intelligence hub<br/>for the <em>AI era.</em></h1>
          <p className="atlas-deck">Follow the stories, people, and organizations shaping AI. Explore their connections and the safety questions behind the headlines.</p>
          <div className="atlas-actions">
            <Link className="desk-button" href="/graph">Explore the graph <span aria-hidden="true">↗</span></Link>
            <Link className="desk-text-link" href="/safety">Visit the safety desk <span aria-hidden="true">→</span></Link>
          </div>
        </section>
        <dl className="atlas-metrics">
          {[[indexedLabel, "Indexed nodes"], [edgesLabel, "Connections"], [storiesLabel, "Stories"], [entitiesLabel, "Entities"]].map(([value, label]) =>
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <section id="archives" className="atlas-sections" aria-label="Explore the archive">
          <Link href="/stories"><h2>Story archive <span>↗</span></h2><p>Browse reports on research, releases, and policy.</p></Link>
          <Link href="/entities"><h2>Entity directory <span>↗</span></h2><p>Find the people, labs, and models behind a story.</p></Link>
          <Link href="/safety"><h2>AI safety desk <span>↗</span></h2><p>Read conduct reports and guidance on protecting yourself.</p></Link>
        </section>
      </div>
    </main>
  );
}
