-- Migration 027: Add Scopes to Event Sources

-- Add scopes (JSON array of strings) to define what a source CAN do
ALTER TABLE event_sources ADD COLUMN IF NOT EXISTS scopes JSONB DEFAULT '["event"]';

-- Add enabled_scopes (JSON array of strings) to define what a source IS ALLOWED to do
ALTER TABLE event_sources ADD COLUMN IF NOT EXISTS enabled_scopes JSONB DEFAULT '["event"]';

-- Set default scopes for known sources
UPDATE event_sources SET scopes = '["event", "venue", "organizer", "artist"]' WHERE code IN ('ra', 'tm', 'tickettailor', 'dice', 'eventbrite');
UPDATE event_sources SET scopes = '["artist"]' WHERE code IN ('musicbrainz', 'spotify', 'soundcloud');
UPDATE event_sources SET scopes = '["event"]' WHERE code IN ('facebook', 'meetup');

-- Initialize enabled_scopes to match scopes for now (or entity_type logic)
UPDATE event_sources SET enabled_scopes = scopes;

-- Special case: MusicBrainz is artist only
UPDATE event_sources SET scopes = '["artist"]', enabled_scopes = '["artist"]' WHERE code = 'musicbrainz';
