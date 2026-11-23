"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import BentoCard from "@/components/ui/BentoCard";
import { usePagedList } from "@/hooks/usePagedList";

type Entry = {
  id: string;
  title?: string;
  kind?: string;
  name?: string;
  type?: string;
  group?: string;
  excerpt?: string;
  tags?: string[];
  event_date?: string;
  story_count?: number;
};
type Directory = "stories" | "entities";

function Results({ items, section }: { items: Entry[]; section: Directory }) {
  const { visibleItems, hasMore, loadMore, visibleCount } = usePagedList(items);
  return <>
    <p className="directory-count" role="status">Showing {visibleCount.toLocaleString()} of {items.length.toLocaleString()} {section}</p>
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 mb-8">
      {visibleItems.map(item => <BentoCard key={item.id} title={item.kind || item.type || "Record"}
        value={item.title || item.name || item.id} description={item.excerpt}
        className={section === "stories" ? "aspect-video" : "aspect-square"}
        metadata={section === "stories" ? item.event_date : item.story_count === undefined ? undefined :
          `${item.story_count.toLocaleString()} ${item.story_count === 1 ? "linked story" : "linked stories"}`}
        href={`/${section}/${encodeURIComponent(item.id)}`}/>)}
    </div>
    {hasMore && <button className="glass-pill px-6 py-3 font-mono text-xs uppercase tracking-widest" type="button" onClick={loadMore}>Load more {section}</button>}
  </>;
}

function ArchiveResults({ section }: { section: Directory }) {
  const params = useSearchParams();
  const [records, setRecords] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState(() => params.get("q") || "");
  const [kind, setKind] = useState(() => params.get("type") || "");
  const [sort, setSort] = useState(() => {
    const order = params.get("sort");
    return order === "name" || (order === "latest" && section === "stories") ? order : "";
  });
  const [error, setError] = useState(false);
  const search = useDeferredValue(query);
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

  useEffect(() => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries({ q: query.trim(), type: kind, sort })) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [query, kind, sort]);

  const needle = search.trim().toLowerCase();
  const kinds = useMemo(() => [...new Set((records ?? []).flatMap(item => item.kind || item.type || []))].sort(), [records]);
  const filtered = useMemo(() => {
    const results = (records ?? []).filter(item => (!kind || kind === (item.kind || item.type)) &&
      (!needle || [item.title, item.name, item.kind, item.type, item.excerpt, item.group, ...(item.tags ?? [])]
        .some(value => value?.toLowerCase().includes(needle))));
    if (sort === "name") return results.sort((a, b) => (a.title || a.name || "").localeCompare(b.title || b.name || ""));
    if (sort === "latest" && section === "stories") return results.sort((a, b) => (b.event_date || "").localeCompare(a.event_date || ""));
    return results;
  }, [needle, kind, records, sort, section]);

  return <>
    <div className="directory-toolbar">
      <label className="directory-search"><span>Search {section}</span>
        <input type="search" value={query} placeholder={section === "stories" ? "Title, topic, or keyword" : "Name, type, or keyword"}
          onChange={e => setQuery(e.target.value)}/></label>
      <label className="directory-search"><span>{section === "stories" ? "Story type" : "Entity type"}</span>
        <select value={kind} onChange={e => setKind(e.target.value)}>
          <option value="">All types</option>
          {kind && !kinds.includes(kind) && <option value={kind}>{kind.replaceAll("-", " ")}</option>}
          {kinds.map(value => <option key={value} value={value}>{value.replaceAll("-", " ")}</option>)}
        </select></label>
      <label className="directory-search"><span>Sort by</span>
        <select value={sort} onChange={e => setSort(e.target.value)}>
          <option value="">{section === "stories" ? "Importance" : "Most connected"}</option>
          {section === "stories" && <option value="latest">Newest first</option>}
          <option value="name">A to Z</option>
        </select></label>
    </div>
    {error ? <p role="alert" className="desk-status">The directory is unavailable. <button type="button" onClick={() => void load()}>Try again</button></p>
      : records === null ? <p className="desk-status" role="status">Loading {section}…</p>
      : filtered.length > 0 ? <Results key={JSON.stringify([needle, kind, sort])} items={filtered} section={section}/>
      : <p className="desk-status" role="status">{needle || kind ? "No matching records." : "No records yet."}
        {(needle || kind) && <> <button type="button" onClick={() => { setQuery(""); setKind(""); }}>Clear search</button></>}</p>}
  </>;
}

export default function ArchiveDirectory({ section }: { section: Directory }) {
  return (
    <section aria-label={`Browse ${section}`} className="max-w-6xl mx-auto w-full px-6 md:px-8 pb-32">
      <Suspense fallback={<p className="desk-status" role="status">Loading {section}…</p>}>
        <ArchiveResults section={section}/>
      </Suspense>
    </section>
  );
}
