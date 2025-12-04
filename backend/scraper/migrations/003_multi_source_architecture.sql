-- Migration 003: Multi-Source Architecture
-- Separates scraped data from user-curated data with association/matching

-- Add Ticketmaster source
INSERT INTO event_sources (code, name, base_url) VALUES 
    ('ticketmaster', 'Ticketmaster', 'https://www.ticketmaster.com')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- SCRAPED DATA TABLES (raw data from sources)
-- =====================================================

-- Scraped Events (raw data from all sources)
CREATE TABLE IF NOT EXISTS scraped_events (
    id SERIAL PRIMARY KEY,
    source_code VARCHAR(50) NOT NULL,
    source_event_id VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    date DATE,
    start_time TIME,
    end_time TIME,
    content_url VARCHAR(500),
    flyer_front VARCHAR(500),
    description TEXT,
    venue_name VARCHAR(255),
    venue_address VARCHAR(500),
    venue_city VARCHAR(100),
    venue_country VARCHAR(100),
    venue_latitude DECIMAL(10, 8),
    venue_longitude DECIMAL(11, 8),
    artists_json JSONB,
    price_info JSONB,
    raw_data JSONB,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_code, source_event_id),
    CONSTRAINT fk_scraped_event_source FOREIGN KEY (source_code) REFERENCES event_sources(code)
);

-- Scraped Venues (raw venue data from sources)
CREATE TABLE IF NOT EXISTS scraped_venues (
    id SERIAL PRIMARY KEY,
    source_code VARCHAR(50) NOT NULL,
    source_venue_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    city VARCHAR(100),
    country VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    content_url VARCHAR(500),
    phone VARCHAR(50),
    capacity INTEGER,
    raw_data JSONB,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_code, source_venue_id),
    CONSTRAINT fk_scraped_venue_source FOREIGN KEY (source_code) REFERENCES event_sources(code)
);

-- Scraped Artists (raw artist data from sources)
CREATE TABLE IF NOT EXISTS scraped_artists (
    id SERIAL PRIMARY KEY,
    source_code VARCHAR(50) NOT NULL,
    source_artist_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    genres JSONB,
    image_url VARCHAR(500),
    content_url VARCHAR(500),
    raw_data JSONB,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_code, source_artist_id),
    CONSTRAINT fk_scraped_artist_source FOREIGN KEY (source_code) REFERENCES event_sources(code)
);

-- =====================================================
-- UNIFIED/CURATED TABLES (user-editable data)
-- =====================================================

-- Add columns to existing events table for curation
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_curated BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS curated_at TIMESTAMP;
ALTER TABLE events ADD COLUMN IF NOT EXISTS curated_by VARCHAR(100);

-- Unified Venues (curated, deduplicated venues)
CREATE TABLE IF NOT EXISTS unified_venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    city VARCHAR(100),
    country VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    phone VARCHAR(50),
    website VARCHAR(500),
    capacity INTEGER,
    description TEXT,
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Unified Artists (curated, deduplicated artists)
CREATE TABLE IF NOT EXISTS unified_artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    genres JSONB,
    country VARCHAR(100),
    bio TEXT,
    image_url VARCHAR(500),
    website VARCHAR(500),
    spotify_url VARCHAR(500),
    soundcloud_url VARCHAR(500),
    instagram_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Unified Events (curated events with references to scraped data)
CREATE TABLE IF NOT EXISTS unified_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    date DATE,
    start_time TIME,
    end_time TIME,
    description TEXT,
    flyer_front VARCHAR(500),
    ticket_url VARCHAR(500),
    price_info JSONB,
    unified_venue_id UUID REFERENCES unified_venues(id) ON DELETE SET NULL,
    -- Fallback venue info if no unified venue linked
    venue_name VARCHAR(255),
    venue_address VARCHAR(500),
    venue_city VARCHAR(100),
    venue_country VARCHAR(100),
    is_published BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP
);

-- =====================================================
-- ASSOCIATION/LINKING TABLES
-- =====================================================

-- Link unified events to scraped events (many-to-many for merged events)
CREATE TABLE IF NOT EXISTS event_source_links (
    unified_event_id UUID NOT NULL REFERENCES unified_events(id) ON DELETE CASCADE,
    scraped_event_id INTEGER NOT NULL REFERENCES scraped_events(id) ON DELETE CASCADE,
    match_confidence DECIMAL(5, 4) DEFAULT 1.0,
    is_primary BOOLEAN DEFAULT false,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (unified_event_id, scraped_event_id)
);

-- Link unified venues to scraped venues
CREATE TABLE IF NOT EXISTS venue_source_links (
    unified_venue_id UUID NOT NULL REFERENCES unified_venues(id) ON DELETE CASCADE,
    scraped_venue_id INTEGER NOT NULL REFERENCES scraped_venues(id) ON DELETE CASCADE,
    match_confidence DECIMAL(5, 4) DEFAULT 1.0,
    is_primary BOOLEAN DEFAULT false,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (unified_venue_id, scraped_venue_id)
);

-- Link unified artists to scraped artists
CREATE TABLE IF NOT EXISTS artist_source_links (
    unified_artist_id UUID NOT NULL REFERENCES unified_artists(id) ON DELETE CASCADE,
    scraped_artist_id INTEGER NOT NULL REFERENCES scraped_artists(id) ON DELETE CASCADE,
    match_confidence DECIMAL(5, 4) DEFAULT 1.0,
    is_primary BOOLEAN DEFAULT false,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (unified_artist_id, scraped_artist_id)
);

-- Link unified events to unified artists (lineup)
CREATE TABLE IF NOT EXISTS unified_event_artists (
    unified_event_id UUID NOT NULL REFERENCES unified_events(id) ON DELETE CASCADE,
    unified_artist_id UUID NOT NULL REFERENCES unified_artists(id) ON DELETE CASCADE,
    billing_order INTEGER DEFAULT 0,
    set_time TIME,
    PRIMARY KEY (unified_event_id, unified_artist_id)
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_scraped_events_source ON scraped_events(source_code);
CREATE INDEX IF NOT EXISTS idx_scraped_events_date ON scraped_events(date);
CREATE INDEX IF NOT EXISTS idx_scraped_events_city ON scraped_events(venue_city);
CREATE INDEX IF NOT EXISTS idx_scraped_events_scraped_at ON scraped_events(scraped_at);

CREATE INDEX IF NOT EXISTS idx_scraped_venues_source ON scraped_venues(source_code);
CREATE INDEX IF NOT EXISTS idx_scraped_venues_city ON scraped_venues(city);
CREATE INDEX IF NOT EXISTS idx_scraped_venues_name ON scraped_venues(name);

CREATE INDEX IF NOT EXISTS idx_scraped_artists_source ON scraped_artists(source_code);
CREATE INDEX IF NOT EXISTS idx_scraped_artists_name ON scraped_artists(name);

CREATE INDEX IF NOT EXISTS idx_unified_events_date ON unified_events(date);
CREATE INDEX IF NOT EXISTS idx_unified_events_city ON unified_events(venue_city);
CREATE INDEX IF NOT EXISTS idx_unified_events_published ON unified_events(is_published);
CREATE INDEX IF NOT EXISTS idx_unified_events_venue ON unified_events(unified_venue_id);

CREATE INDEX IF NOT EXISTS idx_unified_venues_city ON unified_venues(city);
CREATE INDEX IF NOT EXISTS idx_unified_venues_name ON unified_venues(name);

CREATE INDEX IF NOT EXISTS idx_unified_artists_name ON unified_artists(name);

-- =====================================================
-- TRIGGERS
-- =====================================================

DROP TRIGGER IF EXISTS update_scraped_events_updated_at ON scraped_events;
CREATE TRIGGER update_scraped_events_updated_at
    BEFORE UPDATE ON scraped_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scraped_venues_updated_at ON scraped_venues;
CREATE TRIGGER update_scraped_venues_updated_at
    BEFORE UPDATE ON scraped_venues
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scraped_artists_updated_at ON scraped_artists;
CREATE TRIGGER update_scraped_artists_updated_at
    BEFORE UPDATE ON scraped_artists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_unified_events_updated_at ON unified_events;
CREATE TRIGGER update_unified_events_updated_at
    BEFORE UPDATE ON unified_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_unified_venues_updated_at ON unified_venues;
CREATE TRIGGER update_unified_venues_updated_at
    BEFORE UPDATE ON unified_venues
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_unified_artists_updated_at ON unified_artists;
CREATE TRIGGER update_unified_artists_updated_at
    BEFORE UPDATE ON unified_artists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- HELPER VIEWS
-- =====================================================

-- View: Unified events with source counts
CREATE OR REPLACE VIEW unified_events_with_sources AS
SELECT 
    ue.*,
    uv.name as linked_venue_name,
    uv.address as linked_venue_address,
    uv.city as linked_venue_city,
    COALESCE(ue.venue_name, uv.name) as display_venue_name,
    COALESCE(ue.venue_city, uv.city) as display_venue_city,
    (SELECT COUNT(*) FROM event_source_links esl WHERE esl.unified_event_id = ue.id) as source_count,
    (SELECT array_agg(DISTINCT se.source_code) FROM event_source_links esl 
     JOIN scraped_events se ON se.id = esl.scraped_event_id 
     WHERE esl.unified_event_id = ue.id) as sources
FROM unified_events ue
LEFT JOIN unified_venues uv ON uv.id = ue.unified_venue_id;

-- View: Scraped events not yet linked to unified events
CREATE OR REPLACE VIEW unlinked_scraped_events AS
SELECT se.* 
FROM scraped_events se
WHERE NOT EXISTS (
    SELECT 1 FROM event_source_links esl WHERE esl.scraped_event_id = se.id
);
