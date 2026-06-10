-- era values: 'founding' | 'symbolic' | 'first_winter' | 'connectionist'
-- | 'second_winter' | 'statistical' | 'deep_learning' | 'transformer'
-- | 'frontier' | 'agentic'
ALTER TABLE stories ADD COLUMN era TEXT DEFAULT 'frontier';
ALTER TABLE stories ADD COLUMN year INTEGER;
UPDATE stories SET year = CAST(substr(event_date, 1, 4) AS INTEGER) WHERE event_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stories_year ON stories(year);
CREATE INDEX IF NOT EXISTS idx_stories_era ON stories(era);
