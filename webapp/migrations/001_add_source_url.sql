ALTER TABLE stories ADD COLUMN source_url TEXT;
ALTER TABLE stories ADD COLUMN source_name TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stories_source_url
    ON stories(source_url) WHERE source_url IS NOT NULL;
