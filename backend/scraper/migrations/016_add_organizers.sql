-- Migration 016: Add organizers (clubs/promoters) entity
-- Creates organizers, scraped_organizers, and link tables

-- Organizers (Clubs/Promoters)
CREATE TABLE IF NOT EXISTS organizers (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT,
    website TEXT,
    email VARCHAR(255),
    facebook TEXT,
    instagram TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scraped Organizers
CREATE TABLE IF NOT EXISTS scraped_organizers (
    id SERIAL PRIMARY KEY,
    source_code VARCHAR(50) NOT NULL, -- 'ra', 'ticketmaster'
    source_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT,
    url TEXT,
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_code, source_id)
);

-- Link Table: Organizers <-> Scraped Organizers
CREATE TABLE IF NOT EXISTS organizer_scraped_links (
    organizer_id VARCHAR(50) NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    scraped_organizer_id INTEGER NOT NULL REFERENCES scraped_organizers(id) ON DELETE CASCADE,
    match_confidence DECIMAL(5, 4) DEFAULT 1.0,
    is_primary BOOLEAN DEFAULT false,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organizer_id, scraped_organizer_id)
);

-- Event Organizers Junction
CREATE TABLE IF NOT EXISTS event_organizers (
    event_id VARCHAR(50) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    organizer_id VARCHAR(50) NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'promoter', -- 'promoter', 'host', 'co-host'
    PRIMARY KEY (event_id, organizer_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_organizers_name ON organizers(name);
CREATE INDEX IF NOT EXISTS idx_scraped_organizers_source ON scraped_organizers(source_code, source_id);
CREATE INDEX IF NOT EXISTS idx_organizer_scraped_links_org_id ON organizer_scraped_links(organizer_id);
CREATE INDEX IF NOT EXISTS idx_organizer_scraped_links_scraped_id ON organizer_scraped_links(scraped_organizer_id);
CREATE INDEX IF NOT EXISTS idx_event_organizers_event_id ON event_organizers(event_id);
CREATE INDEX IF NOT EXISTS idx_event_organizers_organizer_id ON event_organizers(organizer_id);

-- Add organizers_json to scraped_events for raw storage
ALTER TABLE scraped_events ADD COLUMN IF NOT EXISTS organizers_json JSONB;
