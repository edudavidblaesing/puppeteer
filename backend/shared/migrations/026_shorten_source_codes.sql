BEGIN;

-- Update event_sources
UPDATE event_sources SET code = 'tm' WHERE code = 'ticketmaster';
UPDATE event_sources SET code = 'mb' WHERE code = 'musicbrainz';
UPDATE event_sources SET code = 'fb' WHERE code = 'facebook';
UPDATE event_sources SET code = 'eb' WHERE code = 'eventbrite';
UPDATE event_sources SET code = 'di' WHERE code = 'dice';
UPDATE event_sources SET code = 'og' WHERE code = 'original';

-- Update scraped events
UPDATE scraped_events SET source_code = 'tm' WHERE source_code = 'ticketmaster';
UPDATE scraped_events SET source_code = 'mb' WHERE source_code = 'musicbrainz';
UPDATE scraped_events SET source_code = 'fb' WHERE source_code = 'facebook';
UPDATE scraped_events SET source_code = 'eb' WHERE source_code = 'eventbrite';
UPDATE scraped_events SET source_code = 'di' WHERE source_code = 'dice';
UPDATE scraped_events SET source_code = 'og' WHERE source_code = 'original';

-- Update scraped venues
UPDATE scraped_venues SET source_code = 'tm' WHERE source_code = 'ticketmaster';
UPDATE scraped_venues SET source_code = 'mb' WHERE source_code = 'musicbrainz';
UPDATE scraped_venues SET source_code = 'fb' WHERE source_code = 'facebook';
UPDATE scraped_venues SET source_code = 'eb' WHERE source_code = 'eventbrite';
UPDATE scraped_venues SET source_code = 'di' WHERE source_code = 'dice';
UPDATE scraped_venues SET source_code = 'og' WHERE source_code = 'original';

-- Update scraped artists
UPDATE scraped_artists SET source_code = 'tm' WHERE source_code = 'ticketmaster';
UPDATE scraped_artists SET source_code = 'mb' WHERE source_code = 'musicbrainz';
UPDATE scraped_artists SET source_code = 'fb' WHERE source_code = 'facebook';
UPDATE scraped_artists SET source_code = 'eb' WHERE source_code = 'eventbrite';
UPDATE scraped_artists SET source_code = 'di' WHERE source_code = 'dice';
UPDATE scraped_artists SET source_code = 'og' WHERE source_code = 'original';

-- Update scraped organizers
UPDATE scraped_organizers SET source_code = 'tm' WHERE source_code = 'ticketmaster';
UPDATE scraped_organizers SET source_code = 'mb' WHERE source_code = 'musicbrainz';
UPDATE scraped_organizers SET source_code = 'fb' WHERE source_code = 'facebook';
UPDATE scraped_organizers SET source_code = 'eb' WHERE source_code = 'eventbrite';
UPDATE scraped_organizers SET source_code = 'di' WHERE source_code = 'dice';
UPDATE scraped_organizers SET source_code = 'og' WHERE source_code = 'original';

-- Update scrape history
UPDATE scrape_history SET source_code = 'tm' WHERE source_code = 'ticketmaster';
UPDATE scrape_history SET source_code = 'mb' WHERE source_code = 'musicbrainz';
UPDATE scrape_history SET source_code = 'fb' WHERE source_code = 'facebook';
UPDATE scrape_history SET source_code = 'eb' WHERE source_code = 'eventbrite';
UPDATE scrape_history SET source_code = 'di' WHERE source_code = 'dice';
UPDATE scrape_history SET source_code = 'og' WHERE source_code = 'original';

COMMIT;
