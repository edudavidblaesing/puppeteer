ALTER TABLE event_scraped_links ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;
ALTER TABLE venue_scraped_links ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;
ALTER TABLE artist_scraped_links ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;
