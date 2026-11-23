"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePagedList } from "@/hooks/usePagedList";

const sections = { all: "All records", awareness: "Safety awareness", conduct: "Industry conduct", guidance: "Protect yourself" } as const;
type Section = keyof typeof sections;
type SafetyRecord = {
  id: string;
  title: string;
  date: string;
  section: Exclude<Section, "all">;
  summary: string;
  source_name: string | null;
  source_url: string | null;
  entities: { id: string; name: string; type: string }[];
};

function RecordList({ records }: { records: SafetyRecord[] }) {
  const { visibleItems, hasMore, loadMore } = usePagedList(records, 15);
  return <>
    <div className="brief-list">{visibleItems.map((record) => (
      <article key={record.id} className="brief">
        <div className="brief-dateline"><span data-section={record.section}>{sections[record.section]}</span>
          <span>{record.date || "Undated"}</span></div>
        <div className="brief-body">
          <h3><a href={`/stories/${encodeURIComponent(record.id)}`}>{record.title}</a></h3>
          <p>{record.summary}</p>
          <div className="brief-links">
            {record.source_url && <a className="source-link" href={record.source_url} rel="external">{record.source_name || "Original source"} ↗</a>}
            <a href={`/graph?focus=${encodeURIComponent("story:" + record.id)}`}>Locate in graph →</a>
          </div>
          {record.entities.length > 0 && <details className="brief-entities">
            <summary>Related entities ({record.entities.length})</summary>
            <ul>{record.entities.map(e => <li key={e.id}><a href={`/entities/${encodeURIComponent(e.id)}`}>{e.name}</a></li>)}</ul>
          </details>}
        </div>
      </article>
    ))}</div>
    {hasMore && <button type="button" className="desk-button" onClick={loadMore}>Show more records</button>}
  </>;
}

export default function SafetyDesk() {
  const [records, setRecords] = useState<SafetyRecord[] | null>(null);
  const [error, setError] = useState(false);
  const [section, setSection] = useState<Section>("all");
  const pending = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    try {
      const res = await fetch("/api/safety", { signal: controller.signal, cache: "no-store" });
      if (!res.ok) throw new Error("Safety feed unavailable");
      const payload = await res.json();
      if (!Array.isArray(payload.records)) throw new Error("Invalid safety feed");
      setRecords(payload.records);
      setError(false);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }, []);

  useEffect(() => {
    const firstCheck = window.setTimeout(refresh, 0);
    const check = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(check, 300_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(firstCheck);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      pending.current?.abort();
      pending.current = null;
    };
  }, [refresh]);

  const guide = records?.find(r => r.section === "guidance");
  const visible = (records ?? []).filter(r => section === "all" || r.section === section);
  return (
    <main className="safety-desk"><div className="desk-wrap">
      <header className="safety-intro">
        <div><p className="desk-kicker">Public awareness</p><h1>AI safety <em>desk.</em></h1>
          <p className="atlas-deck">Track emerging risks, examine reported industry conduct, and find practical ways to protect yourself.</p></div>
        {guide && <aside className="guidance-spotlight"><p className="desk-kicker"><span>Latest guidance</span> · {guide.date}</p>
          <h2><a href={`/stories/${encodeURIComponent(guide.id)}`}>{guide.title}</a></h2>
          <p>{guide.summary}</p>
          {guide.source_url && <a className="source-link" href={guide.source_url}>{guide.source_name} ↗</a>}
        </aside>}
      </header>
      <section aria-labelledby="desk-records">
        <div className="desk-heading"><h2 id="desk-records">Safety records</h2>
          {records && <span>{visible.length} {visible.length === 1 ? "record" : "records"}</span>}</div>
        <div role="group" aria-label="Filter safety records" className="desk-filters">
          {(Object.keys(sections) as Section[]).map(key => <button key={key} type="button" aria-pressed={key === section}
            onClick={() => setSection(key)}>{sections[key]}</button>)}
        </div>
        {section === "conduct" && <p className="section-note">These records follow dated regulatory actions. Each source identifies the parties and describes the status of its case.</p>}
        {error && <div className="desk-status" role="alert">{records ? "Refresh failed. Showing the last records received." : "The safety feed is unavailable."}
          {" "}<button onClick={() => void refresh()}>Try again</button></div>}
        {!records && !error && <p className="desk-status" role="status">Loading graph records…</p>}
        {records && (visible.length ? <RecordList key={section} records={visible}/> :
          <p className="desk-status" role="status">No matching story nodes yet.</p>)}
      </section>
    </div></main>
  );
}
