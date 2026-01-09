ALTER TABLE scraped_events ADD COLUMN IF NOT EXISTS processing_errors jsonb DEFAULT '[]';
ALTER TABLE scraped_artists ADD COLUMN IF NOT EXISTS processing_errors jsonb DEFAULT '[]';
ALTER TABLE scraped_venues ADD COLUMN IF NOT EXISTS processing_errors jsonb DEFAULT '[]';
