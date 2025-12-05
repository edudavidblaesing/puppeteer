-- Migration 008: Add source linking for artists and venues
-- Creates event_scraped_links table for events, venue_scraped_links for venues, artist_scraped_links for artists

-- Link events to their scraped sources
CREATE TABLE IF NOT EXISTS event_scraped_links (
    event_id VARCHAR(50) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    scraped_event_id INTEGER NOT NULL REFERENCES scraped_events(id) ON DELETE CASCADE,
    match_confidence DECIMAL(5, 4) DEFAULT 1.0,
    is_primary BOOLEAN DEFAULT false,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, scraped_event_id)
);

-- Link venues to their scraped sources
CREATE TABLE IF NOT EXISTS venue_scraped_links (
    venue_id VARCHAR(50) NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    scraped_venue_id INTEGER NOT NULL REFERENCES scraped_venues(id) ON DELETE CASCADE,
    match_confidence DECIMAL(5, 4) DEFAULT 1.0,
    is_primary BOOLEAN DEFAULT false,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (venue_id, scraped_venue_id)
);

-- Link artists to their scraped sources
CREATE TABLE IF NOT EXISTS artist_scraped_links (
    artist_id VARCHAR(50) NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    scraped_artist_id INTEGER NOT NULL REFERENCES scraped_artists(id) ON DELETE CASCADE,
    match_confidence DECIMAL(5, 4) DEFAULT 1.0,
    is_primary BOOLEAN DEFAULT false,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (artist_id, scraped_artist_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_scraped_links_event_id ON event_scraped_links(event_id);
CREATE INDEX IF NOT EXISTS idx_event_scraped_links_scraped_id ON event_scraped_links(scraped_event_id);
CREATE INDEX IF NOT EXISTS idx_venue_scraped_links_venue_id ON venue_scraped_links(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_scraped_links_scraped_id ON venue_scraped_links(scraped_venue_id);
CREATE INDEX IF NOT EXISTS idx_artist_scraped_links_artist_id ON artist_scraped_links(artist_id);
CREATE INDEX IF NOT EXISTS idx_artist_scraped_links_scraped_id ON artist_scraped_links(scraped_artist_id);
