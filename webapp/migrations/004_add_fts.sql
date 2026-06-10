-- SQLite FTS5 for full-text search across stories.
-- stories.id is TEXT, so external-content FTS (integer rowid) is not usable;
-- a standalone FTS table keyed by story_id is used instead.
CREATE VIRTUAL TABLE IF NOT EXISTS stories_fts USING fts5(
    story_id UNINDEXED,
    title,
    summary
);
-- Populate FTS index
INSERT INTO stories_fts(story_id, title, summary)
    SELECT id, title, summary FROM stories;
-- Triggers: keep FTS in sync
CREATE TRIGGER IF NOT EXISTS stories_fts_ai AFTER INSERT ON stories BEGIN
    INSERT INTO stories_fts(story_id, title, summary) VALUES (new.id, new.title, new.summary);
END;
CREATE TRIGGER IF NOT EXISTS stories_fts_ad AFTER DELETE ON stories BEGIN
    DELETE FROM stories_fts WHERE story_id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS stories_fts_au AFTER UPDATE OF title, summary ON stories BEGIN
    DELETE FROM stories_fts WHERE story_id = old.id;
    INSERT INTO stories_fts(story_id, title, summary) VALUES (new.id, new.title, new.summary);
END;
