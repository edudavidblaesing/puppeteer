-- Migration 001: Initial Schema
-- Social Events Database Schema

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Event sources (RA, Eventbrite, Facebook, etc.)
CREATE TABLE IF NOT EXISTS event_sources (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    base_url VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default sources
INSERT INTO event_sources (code, name, base_url) VALUES 
    ('ra', 'Resident Advisor', 'https://ra.co'),
    ('eventbrite', 'Eventbrite', 'https://eventbrite.com'),
    ('facebook', 'Facebook Events', 'https://facebook.com'),
    ('dice', 'DICE', 'https://dice.fm')
ON CONFLICT (code) DO NOTHING;

-- Events table (generic for all sources)
CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(50) PRIMARY KEY,
    source_code VARCHAR(50) NOT NULL DEFAULT 'ra',
    source_id VARCHAR(50),
    title VARCHAR(500) NOT NULL,
    date TIMESTAMP,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    content_url VARCHAR(500),
    flyer_front VARCHAR(500),
    description TEXT,
    venue_id VARCHAR(50),
    venue_name VARCHAR(255),
    venue_address VARCHAR(500),
    venue_city VARCHAR(100),
    venue_country VARCHAR(100),
    artists TEXT,
    listing_date TIMESTAMP,
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_event_source FOREIGN KEY (source_code) REFERENCES event_sources(code)
);

-- Venues table with full details
CREATE TABLE IF NOT EXISTS venues (
    id VARCHAR(50) PRIMARY KEY,
    source_code VARCHAR(50) NOT NULL DEFAULT 'ra',
    source_id VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    city VARCHAR(100),
    country VARCHAR(100),
    blurb TEXT,
    content_url VARCHAR(500),
    area_id VARCHAR(50),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_venue_source FOREIGN KEY (source_code) REFERENCES event_sources(code)
);

-- Artists table with full details
CREATE TABLE IF NOT EXISTS artists (
    id VARCHAR(50) PRIMARY KEY,
    source_code VARCHAR(50) NOT NULL DEFAULT 'ra',
    source_id VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    content_url VARCHAR(500),
    image_url VARCHAR(500),
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_artist_source FOREIGN KEY (source_code) REFERENCES event_sources(code)
);

-- Event artists junction table (many-to-many)
CREATE TABLE IF NOT EXISTS event_artists (
    event_id VARCHAR(50) REFERENCES events(id) ON DELETE CASCADE,
    artist_id VARCHAR(50) REFERENCES artists(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, artist_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source_code);
CREATE INDEX IF NOT EXISTS idx_events_venue_city ON events(venue_city);
CREATE INDEX IF NOT EXISTS idx_events_listing_date ON events(listing_date);
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id);
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city);
CREATE INDEX IF NOT EXISTS idx_venues_source ON venues(source_code);
CREATE INDEX IF NOT EXISTS idx_venues_area_id ON venues(area_id);
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
CREATE INDEX IF NOT EXISTS idx_artists_source ON artists(source_code);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers (drop first to avoid errors on re-run)
DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_venues_updated_at ON venues;
CREATE TRIGGER update_venues_updated_at
    BEFORE UPDATE ON venues
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_artists_updated_at ON artists;
CREATE TRIGGER update_artists_updated_at
    BEFORE UPDATE ON artists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
