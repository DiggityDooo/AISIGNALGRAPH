"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BentoCard from "@/components/ui/BentoCard";
import { usePagedList } from "@/hooks/usePagedList";

type Entry = { id: string; title?: string; kind?: string; name?: string; type?: string; excerpt?: string };
type Directory = "stories" | "entities";

const copy = {
  stories: { title: "Intelligence library", intro: "Find reports on model releases, research, policy, and the impact of AI.", label: "Search stories" },
  entities: { title: "Actor directory", intro: "Explore the labs, people, models, and topics connected to stories in the graph.", label: "Search entities" },
};

function Results({ items, section }: { items: Entry[]; section: Directory }) {
  const { visibleItems, hasMore, loadMore, visibleCount } = usePagedList(items);
  return <>
    <p className="directory-count" role="status">Showing {visibleCount.toLocaleString()} of {items.length.toLocaleString()} {section}</p>
    <div className="directory-grid">
      {visibleItems.map(item => <BentoCard key={item.id} title={item.kind || item.type || "Record"}
        value={item.title || item.name || item.id} description={item.excerpt}
        href={`/${section}/${encodeURIComponent(item.id)}`}/>)}
    </div>
    {hasMore && <button className="desk-button" type="button" onClick={loadMore}>Load more {section}</button>}
  </>;
}

export default function ArchiveDirectory({ section }: { section: Directory }) {
  const [records, setRecords] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    try {
      const response = await fetch("/api/" + section, { signal: controller.signal });
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Invalid directory");
      setRecords(data);
      setError(false);
    } catch {
      if (!controller.signal.aborted) setError(true);
    }
  }, [section]);
  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => {
      clearTimeout(timer);
      pending.current?.abort();
    };
  }, [load]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => (records ?? []).filter(item =>
    [item.title, item.name, item.kind, item.type, item.excerpt].some(value => value?.toLowerCase().includes(needle)),
  ), [needle, records]);

  return <main className="atlas-directory"><div className="desk-wrap">
    <header className="directory-intro"><p className="desk-kicker">Knowledge graph</p><h1>{copy[section].title}</h1>
      <p className="atlas-deck">{copy[section].intro}</p></header>
    <label className="directory-search"><span>{copy[section].label}</span>
      <input type="search" value={query} placeholder={section === "stories" ? "Title, topic, or keyword" : "Name, type, or keyword"}
        onChange={e => setQuery(e.target.value)}/></label>
    {error ? <p role="alert" className="desk-status">The directory is unavailable. <button onClick={() => void load()}>Try again</button></p>
      : records === null ? <p className="desk-status" role="status">Loading {section}…</p>
      : filtered.length > 0 ? <Results key={needle} items={filtered} section={section}/>
      : <p className="desk-status" role="status">{needle ? "No matching records." : "No records yet."}
        {needle && <> <button onClick={() => setQuery("")}>Clear search</button></>}</p>}
  </div></main>;
}
