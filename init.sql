-- RA Events Database Schema

-- Events table
CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(20) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    date TIMESTAMP,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    content_url VARCHAR(255),
    flyer_front VARCHAR(500),
    description TEXT,
    venue_id VARCHAR(20),
    venue_name VARCHAR(255),
    venue_address VARCHAR(500),
    venue_city VARCHAR(100),
    venue_country VARCHAR(100),
    artists TEXT,
    listing_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Venues table with full details
CREATE TABLE IF NOT EXISTS venues (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    city VARCHAR(100),
    country VARCHAR(100),
    blurb TEXT,
    content_url VARCHAR(255),
    area_id VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Artists table with full details
CREATE TABLE IF NOT EXISTS artists (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    content_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event-Artist junction table
CREATE TABLE IF NOT EXISTS event_artists (
    event_id VARCHAR(20) REFERENCES events(id) ON DELETE CASCADE,
    artist_id VARCHAR(20) REFERENCES artists(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, artist_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_venue_city ON events(venue_city);
CREATE INDEX IF NOT EXISTS idx_events_listing_date ON events(listing_date);
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for events table
DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for venues table
DROP TRIGGER IF EXISTS update_venues_updated_at ON venues;
CREATE TRIGGER update_venues_updated_at
    BEFORE UPDATE ON venues
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for artists table
DROP TRIGGER IF EXISTS update_artists_updated_at ON artists;
CREATE TRIGGER update_artists_updated_at
    BEFORE UPDATE ON artists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
