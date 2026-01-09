-- Migration 030: Add last_synced_at to source links
BEGIN;

ALTER TABLE event_source_links ADD COLUMN last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE venue_source_links ADD COLUMN last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE artist_source_links ADD COLUMN last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Initialize with current time for existing links
UPDATE event_source_links SET last_synced_at = CURRENT_TIMESTAMP;
UPDATE venue_source_links SET last_synced_at = CURRENT_TIMESTAMP;
UPDATE artist_source_links SET last_synced_at = CURRENT_TIMESTAMP;

COMMIT;
