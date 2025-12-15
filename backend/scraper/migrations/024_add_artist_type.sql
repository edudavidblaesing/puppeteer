-- Migration 024: Add artist type field
-- Add type column to artists and scraped_artists tables

ALTER TABLE artists ADD COLUMN IF NOT EXISTS artist_type VARCHAR(50);
ALTER TABLE scraped_artists ADD COLUMN IF NOT EXISTS artist_type VARCHAR(50); -- Using artist_type to avoid reserved word conflict if any, though type is usually fine.
-- User asked for "type", but artist_type is safer.
-- I'll use "artist_type" in DB, "type" in frontend/JSON.

-- Add index
CREATE INDEX IF NOT EXISTS idx_artists_type ON artists(artist_type);
