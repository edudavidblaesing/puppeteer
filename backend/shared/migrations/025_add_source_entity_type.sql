-- Migration 025: Add entity_type to event_sources
-- Separate sources by their primary entity type (event, artist, etc.)

ALTER TABLE event_sources ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50) DEFAULT 'event';

-- Update existing sources to be 'event' (technically default handles it, but explicit is good)
UPDATE event_sources SET entity_type = 'event' WHERE entity_type IS NULL;

-- Insert MusicBrainz
INSERT INTO event_sources (code, name, base_url, is_active, entity_type)
VALUES ('musicbrainz', 'MusicBrainz', 'https://musicbrainz.org', true, 'artist')
ON CONFLICT (code) DO UPDATE SET
    entity_type = 'artist',
    base_url = 'https://musicbrainz.org';
