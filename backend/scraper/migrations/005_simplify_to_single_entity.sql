-- Migration 005: Simplify Architecture - Single Main Entity
-- 
-- The main tables (events, venues, artists) are THE entity
-- scraped_* tables store raw source data and link to main tables
-- Users see only main tables, can pull data from any linked source

-- =====================================================
-- STEP 1: Add missing columns to main tables
-- =====================================================

-- Add source_links column to track which scraped sources are linked
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
ALTER TABLE events ADD COLUMN IF NOT EXISTS field_sources JSONB DEFAULT '{}';
ALTER TABLE events ADD COLUMN IF NOT EXISTS price_info JSONB;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_url VARCHAR(500);

ALTER TABLE venues ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS field_sources JSONB DEFAULT '{}';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS website VARCHAR(500);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);

ALTER TABLE artists ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS field_sources JSONB DEFAULT '{}';
ALTER TABLE artists ADD COLUMN IF NOT EXISTS genres JSONB;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS website VARCHAR(500);
ALTER TABLE artists ADD COLUMN IF NOT EXISTS spotify_url VARCHAR(500);
ALTER TABLE artists ADD COLUMN IF NOT EXISTS soundcloud_url VARCHAR(500);
ALTER TABLE artists ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(500);

-- =====================================================
-- STEP 2: Change scraped table IDs from SERIAL to VARCHAR for better linking
-- =====================================================

-- Update scraped_events.id if needed (already has serial, add varchar id)
ALTER TABLE scraped_events ADD COLUMN IF NOT EXISTS scraped_id VARCHAR(100);
UPDATE scraped_events SET scraped_id = source_code || '_' || source_event_id WHERE scraped_id IS NULL;

ALTER TABLE scraped_venues ADD COLUMN IF NOT EXISTS scraped_id VARCHAR(100);
UPDATE scraped_venues SET scraped_id = source_code || '_' || source_venue_id WHERE scraped_id IS NULL;

ALTER TABLE scraped_artists ADD COLUMN IF NOT EXISTS scraped_id VARCHAR(100);
UPDATE scraped_artists SET scraped_id = source_code || '_' || source_artist_id WHERE scraped_id IS NULL;

-- =====================================================
-- STEP 3: Create new linking tables (scraped -> main entity)
-- =====================================================

-- Link scraped events to main events table
CREATE TABLE IF NOT EXISTS event_scraped_links (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(50) REFERENCES events(id) ON DELETE CASCADE,
    scraped_event_id INTEGER REFERENCES scraped_events(id) ON DELETE CASCADE,
    match_confidence DECIMAL(3,2) DEFAULT 1.0,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, scraped_event_id)
);

-- Link scraped venues to main venues table
CREATE TABLE IF NOT EXISTS venue_scraped_links (
    id SERIAL PRIMARY KEY,
    venue_id VARCHAR(50) REFERENCES venues(id) ON DELETE CASCADE,
    scraped_venue_id INTEGER REFERENCES scraped_venues(id) ON DELETE CASCADE,
    match_confidence DECIMAL(3,2) DEFAULT 1.0,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(venue_id, scraped_venue_id)
);

-- Link scraped artists to main artists table  
CREATE TABLE IF NOT EXISTS artist_scraped_links (
    id SERIAL PRIMARY KEY,
    artist_id VARCHAR(50) REFERENCES artists(id) ON DELETE CASCADE,
    scraped_artist_id INTEGER REFERENCES scraped_artists(id) ON DELETE CASCADE,
    match_confidence DECIMAL(3,2) DEFAULT 1.0,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(artist_id, scraped_artist_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_scraped_links_event ON event_scraped_links(event_id);
CREATE INDEX IF NOT EXISTS idx_event_scraped_links_scraped ON event_scraped_links(scraped_event_id);
CREATE INDEX IF NOT EXISTS idx_venue_scraped_links_venue ON venue_scraped_links(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_scraped_links_scraped ON venue_scraped_links(scraped_venue_id);
CREATE INDEX IF NOT EXISTS idx_artist_scraped_links_artist ON artist_scraped_links(artist_id);
CREATE INDEX IF NOT EXISTS idx_artist_scraped_links_scraped ON artist_scraped_links(scraped_artist_id);

-- =====================================================
-- STEP 4: Migrate data from unified_* to main tables
-- =====================================================

-- Migrate unified_events to events (if not already there)
INSERT INTO events (id, title, date, start_time, end_time, description, flyer_front, content_url, 
                   venue_name, venue_address, venue_city, venue_country, is_published, price_info, ticket_url)
SELECT 
    ue.id::varchar,
    ue.title,
    ue.date,
    ue.start_time,
    ue.end_time,
    ue.description,
    ue.flyer_front,
    ue.ticket_url,
    ue.venue_name,
    ue.venue_address,
    ue.venue_city,
    ue.venue_country,
    ue.is_published,
    ue.price_info,
    ue.ticket_url
FROM unified_events ue
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = ue.id::varchar)
ON CONFLICT (id) DO NOTHING;

-- Migrate event_source_links to event_scraped_links
INSERT INTO event_scraped_links (event_id, scraped_event_id, match_confidence)
SELECT 
    esl.unified_event_id::varchar,
    esl.scraped_event_id,
    esl.match_confidence
FROM event_source_links esl
WHERE EXISTS (SELECT 1 FROM events e WHERE e.id = esl.unified_event_id::varchar)
ON CONFLICT (event_id, scraped_event_id) DO NOTHING;

-- Migrate unified_venues to venues
INSERT INTO venues (id, name, address, city, country, latitude, longitude, website, capacity, description)
SELECT 
    uv.id::varchar,
    uv.name,
    uv.address,
    uv.city,
    uv.country,
    uv.latitude,
    uv.longitude,
    uv.website,
    uv.capacity,
    uv.description
FROM unified_venues uv
WHERE NOT EXISTS (SELECT 1 FROM venues v WHERE v.id = uv.id::varchar)
ON CONFLICT (id) DO NOTHING;

-- Migrate venue_source_links to venue_scraped_links
INSERT INTO venue_scraped_links (venue_id, scraped_venue_id, match_confidence)
SELECT 
    vsl.unified_venue_id::varchar,
    vsl.scraped_venue_id,
    vsl.match_confidence
FROM venue_source_links vsl
WHERE EXISTS (SELECT 1 FROM venues v WHERE v.id = vsl.unified_venue_id::varchar)
ON CONFLICT (venue_id, scraped_venue_id) DO NOTHING;

-- Migrate unified_artists to artists
INSERT INTO artists (id, name, country, image_url, website, genres)
SELECT 
    ua.id::varchar,
    ua.name,
    ua.country,
    ua.image_url,
    ua.website,
    ua.genres
FROM unified_artists ua
WHERE NOT EXISTS (SELECT 1 FROM artists a WHERE a.id = ua.id::varchar)
ON CONFLICT (id) DO NOTHING;

-- Migrate artist_source_links to artist_scraped_links
INSERT INTO artist_scraped_links (artist_id, scraped_artist_id, match_confidence)
SELECT 
    asl.unified_artist_id::varchar,
    asl.scraped_artist_id,
    asl.match_confidence
FROM artist_source_links asl
WHERE EXISTS (SELECT 1 FROM artists a WHERE a.id = asl.unified_artist_id::varchar)
ON CONFLICT (artist_id, scraped_artist_id) DO NOTHING;

-- =====================================================
-- STEP 5: Add manual source to event_sources
-- =====================================================
INSERT INTO event_sources (code, name, base_url) VALUES 
    ('manual', 'Manual Entry', NULL)
ON CONFLICT (code) DO NOTHING;
