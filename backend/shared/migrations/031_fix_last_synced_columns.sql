-- Migration 031: Fix last_synced_at on correct tables
BEGIN;

-- Add to the actually used tables
ALTER TABLE event_scraped_links ADD COLUMN last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE venue_scraped_links ADD COLUMN last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE artist_scraped_links ADD COLUMN last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Initialize
UPDATE event_scraped_links SET last_synced_at = CURRENT_TIMESTAMP;
UPDATE venue_scraped_links SET last_synced_at = CURRENT_TIMESTAMP;
UPDATE artist_scraped_links SET last_synced_at = CURRENT_TIMESTAMP;

COMMIT;
