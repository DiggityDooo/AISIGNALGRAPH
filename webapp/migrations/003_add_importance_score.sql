-- importance_score: 0.0-1.0, used for LOD node sizing in the graph
ALTER TABLE stories ADD COLUMN importance_score REAL DEFAULT 0.5;
ALTER TABLE entities ADD COLUMN degree_centrality REAL DEFAULT 0.0;
ALTER TABLE entities ADD COLUMN first_seen_year INTEGER;
ALTER TABLE entities ADD COLUMN last_seen_year INTEGER;
-- Scrape metadata table: track when we last ran, lock against concurrent runs
CREATE TABLE IF NOT EXISTS scrape_meta (
    id INTEGER PRIMARY KEY,
    last_scrape_iso TEXT,
    last_scrape_ts INTEGER,
    stories_added INTEGER DEFAULT 0,
    scrape_duration_s REAL,
    status TEXT DEFAULT 'ok'
);
