-- Migration 014: Add update status tracking and back-references
-- This migration adds status tracking for when entities have pending updates from scraped sources

-- Add update status columns to events
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS has_scraped_updates BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS scraped_updates_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS scraped_updates_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_scraped_data JSONB;

-- Add update status columns to venues
ALTER TABLE venues
ADD COLUMN IF NOT EXISTS has_scraped_updates BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS scraped_updates_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS scraped_updates_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_scraped_data JSONB;

-- Add update status columns to artists
ALTER TABLE artists
ADD COLUMN IF NOT EXISTS has_scraped_updates BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS scraped_updates_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS scraped_updates_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_scraped_data JSONB;

-- Create indexes for efficient querying of entities with pending updates
CREATE INDEX IF NOT EXISTS idx_events_has_scraped_updates ON events(has_scraped_updates) WHERE has_scraped_updates = TRUE;
CREATE INDEX IF NOT EXISTS idx_venues_has_scraped_updates ON venues(has_scraped_updates) WHERE has_scraped_updates = TRUE;
CREATE INDEX IF NOT EXISTS idx_artists_has_scraped_updates ON artists(has_scraped_updates) WHERE has_scraped_updates = TRUE;

-- Create event_artists junction table for many-to-many relationships
CREATE TABLE IF NOT EXISTS event_artists (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    event_id VARCHAR NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    artist_id VARCHAR NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    artist_name VARCHAR NOT NULL,
    performance_order INTEGER,
    is_headliner BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_event_artists_event_id ON event_artists(event_id);
CREATE INDEX IF NOT EXISTS idx_event_artists_artist_id ON event_artists(artist_id);

-- Add comments for documentation
COMMENT ON COLUMN events.has_scraped_updates IS 'TRUE when scraped sources have newer/different data than current event';
COMMENT ON COLUMN events.scraped_updates_at IS 'Timestamp when scraped updates were last detected';
COMMENT ON COLUMN events.last_scraped_data IS 'Preview of the changes from scraped sources';

COMMENT ON COLUMN venues.has_scraped_updates IS 'TRUE when scraped sources have newer/different data than current venue';
COMMENT ON COLUMN artists.has_scraped_updates IS 'TRUE when scraped sources have newer/different data than current artist';

COMMENT ON TABLE event_artists IS 'Junction table linking events to artists with performance details';
