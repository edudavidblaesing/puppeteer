-- Migration 029: Force Shorten Source Codes (Revisited 4 & Complete FK Safe)
BEGIN;

-- Drop foreign key constraints temporarily
ALTER TABLE events DROP CONSTRAINT IF EXISTS fk_event_source;
ALTER TABLE artists DROP CONSTRAINT IF EXISTS fk_artist_source;
ALTER TABLE venues DROP CONSTRAINT IF EXISTS fk_venue_source;
ALTER TABLE scraped_events DROP CONSTRAINT IF EXISTS fk_scraped_event_source;
ALTER TABLE scraped_venues DROP CONSTRAINT IF EXISTS fk_scraped_venue_source;
ALTER TABLE scraped_artists DROP CONSTRAINT IF EXISTS fk_scraped_artist_source;

-- Update event_sources
-- Note: city_source_configs links by ID, so it is unaffected by code changes.
UPDATE event_sources SET code = 'tm' WHERE code = 'ticketmaster';
UPDATE event_sources SET code = 'mb' WHERE code = 'musicbrainz';
UPDATE event_sources SET code = 'fb' WHERE code = 'facebook';
UPDATE event_sources SET code = 'eb' WHERE code = 'eventbrite';
UPDATE event_sources SET code = 'di' WHERE code = 'dice';

-- Update events table
UPDATE events SET source_code = 'tm' WHERE source_code = 'ticketmaster';
UPDATE events SET source_code = 'mb' WHERE source_code = 'musicbrainz';
UPDATE events SET source_code = 'fb' WHERE source_code = 'facebook';
UPDATE events SET source_code = 'eb' WHERE source_code = 'eventbrite';
UPDATE events SET source_code = 'di' WHERE source_code = 'dice';

-- Update artists table
UPDATE artists SET source_code = 'tm' WHERE source_code = 'ticketmaster';
UPDATE artists SET source_code = 'mb' WHERE source_code = 'musicbrainz';
UPDATE artists SET source_code = 'fb' WHERE source_code = 'facebook';
UPDATE artists SET source_code = 'eb' WHERE source_code = 'eventbrite';
UPDATE artists SET source_code = 'di' WHERE source_code = 'dice';

-- Update venues table
UPDATE venues SET source_code = 'tm' WHERE source_code = 'ticketmaster';
UPDATE venues SET source_code = 'mb' WHERE source_code = 'musicbrainz';
UPDATE venues SET source_code = 'fb' WHERE source_code = 'facebook';
UPDATE venues SET source_code = 'eb' WHERE source_code = 'eventbrite';
UPDATE venues SET source_code = 'di' WHERE source_code = 'dice';

-- Update scraped events
UPDATE scraped_events SET source_code = 'tm' WHERE source_code = 'ticketmaster';
UPDATE scraped_events SET source_code = 'mb' WHERE source_code = 'musicbrainz';
UPDATE scraped_events SET source_code = 'fb' WHERE source_code = 'facebook';
UPDATE scraped_events SET source_code = 'eb' WHERE source_code = 'eventbrite';
UPDATE scraped_events SET source_code = 'di' WHERE source_code = 'dice';

-- Update scraped venues
UPDATE scraped_venues SET source_code = 'tm' WHERE source_code = 'ticketmaster';
UPDATE scraped_venues SET source_code = 'mb' WHERE source_code = 'musicbrainz';
UPDATE scraped_venues SET source_code = 'fb' WHERE source_code = 'facebook';
UPDATE scraped_venues SET source_code = 'eb' WHERE source_code = 'eventbrite';
UPDATE scraped_venues SET source_code = 'di' WHERE source_code = 'dice';

-- Update scraped artists
UPDATE scraped_artists SET source_code = 'tm' WHERE source_code = 'ticketmaster';
UPDATE scraped_artists SET source_code = 'mb' WHERE source_code = 'musicbrainz';
UPDATE scraped_artists SET source_code = 'fb' WHERE source_code = 'facebook';
UPDATE scraped_artists SET source_code = 'eb' WHERE source_code = 'eventbrite';
UPDATE scraped_artists SET source_code = 'di' WHERE source_code = 'dice';

-- Update scraped organizers (no FK enforced usually, but good to keep in sync)
UPDATE scraped_organizers SET source_code = 'tm' WHERE source_code = 'ticketmaster';
UPDATE scraped_organizers SET source_code = 'mb' WHERE source_code = 'musicbrainz';
UPDATE scraped_organizers SET source_code = 'fb' WHERE source_code = 'facebook';
UPDATE scraped_organizers SET source_code = 'eb' WHERE source_code = 'eventbrite';
UPDATE scraped_organizers SET source_code = 'di' WHERE source_code = 'dice';

-- Update scrape history (no FK enforced usually)
UPDATE scrape_history SET source_code = 'tm' WHERE source_code = 'ticketmaster';
UPDATE scrape_history SET source_code = 'mb' WHERE source_code = 'musicbrainz';
UPDATE scrape_history SET source_code = 'fb' WHERE source_code = 'facebook';
UPDATE scrape_history SET source_code = 'eb' WHERE source_code = 'eventbrite';
UPDATE scrape_history SET source_code = 'di' WHERE source_code = 'dice';

-- Restore foreign key constraints
ALTER TABLE events ADD CONSTRAINT fk_event_source FOREIGN KEY (source_code) REFERENCES event_sources(code);
ALTER TABLE artists ADD CONSTRAINT fk_artist_source FOREIGN KEY (source_code) REFERENCES event_sources(code);
ALTER TABLE venues ADD CONSTRAINT fk_venue_source FOREIGN KEY (source_code) REFERENCES event_sources(code);
ALTER TABLE scraped_events ADD CONSTRAINT fk_scraped_event_source FOREIGN KEY (source_code) REFERENCES event_sources(code);
ALTER TABLE scraped_venues ADD CONSTRAINT fk_scraped_venue_source FOREIGN KEY (source_code) REFERENCES event_sources(code);
ALTER TABLE scraped_artists ADD CONSTRAINT fk_scraped_artist_source FOREIGN KEY (source_code) REFERENCES event_sources(code);

COMMIT;
