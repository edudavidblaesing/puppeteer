-- Migration: Add proper event-artist relationship table
-- Created: 2025-12-05

-- Create event_artists junction table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS event_artists (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    artist_id VARCHAR(255) NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'performer', -- performer, headliner, support, dj, host
    billing_order INTEGER DEFAULT 0, -- order on the lineup (0 = headliner)
    start_time TIME, -- artist's set time if known
    end_time TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, artist_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_artists_event_id ON event_artists(event_id);
CREATE INDEX IF NOT EXISTS idx_event_artists_artist_id ON event_artists(artist_id);

-- Add genres to artists table if not exists
ALTER TABLE artists ADD COLUMN IF NOT EXISTS genres TEXT[];
ALTER TABLE artists ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS social_links JSONB;

-- Add capacity and type to venues if not exists
ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_type VARCHAR(50); -- club, concert_hall, festival_grounds, bar, etc.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS social_links JSONB;

-- Create a distinct cities table for dropdowns (populated from events data)
CREATE TABLE IF NOT EXISTS cities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(255) NOT NULL,
    country_code VARCHAR(5),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    timezone VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    event_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, country)
);

-- Create countries table for dropdowns
CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(5) UNIQUE,
    continent VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert common countries
INSERT INTO countries (name, code, continent) VALUES
    ('Germany', 'DE', 'Europe'),
    ('United Kingdom', 'GB', 'Europe'),
    ('United States', 'US', 'North America'),
    ('Netherlands', 'NL', 'Europe'),
    ('France', 'FR', 'Europe'),
    ('Spain', 'ES', 'Europe'),
    ('Italy', 'IT', 'Europe'),
    ('Austria', 'AT', 'Europe'),
    ('Switzerland', 'CH', 'Europe'),
    ('Belgium', 'BE', 'Europe'),
    ('Poland', 'PL', 'Europe'),
    ('Czech Republic', 'CZ', 'Europe'),
    ('Denmark', 'DK', 'Europe'),
    ('Sweden', 'SE', 'Europe'),
    ('Norway', 'NO', 'Europe'),
    ('Portugal', 'PT', 'Europe'),
    ('Ireland', 'IE', 'Europe'),
    ('Canada', 'CA', 'North America'),
    ('Australia', 'AU', 'Oceania'),
    ('Japan', 'JP', 'Asia')
ON CONFLICT (name) DO NOTHING;

-- Populate cities from existing events data
INSERT INTO cities (name, country, event_count)
SELECT DISTINCT 
    venue_city as name,
    COALESCE(venue_country, 'Unknown') as country,
    COUNT(*) as event_count
FROM events 
WHERE venue_city IS NOT NULL AND venue_city != ''
GROUP BY venue_city, venue_country
ON CONFLICT (name, country) DO UPDATE SET
    event_count = EXCLUDED.event_count,
    updated_at = CURRENT_TIMESTAMP;

-- Create function to sync event_artists from events.artists JSON
CREATE OR REPLACE FUNCTION sync_event_artists_from_json(p_event_id VARCHAR(255))
RETURNS INTEGER AS $$
DECLARE
    artists_json JSONB;
    artist_record RECORD;
    artist_id_val VARCHAR(255);
    synced_count INTEGER := 0;
BEGIN
    -- Get the artists JSON from the event
    SELECT artists::jsonb INTO artists_json 
    FROM events WHERE id = p_event_id;
    
    IF artists_json IS NULL OR jsonb_array_length(artists_json) = 0 THEN
        RETURN 0;
    END IF;
    
    -- Loop through each artist in the JSON array
    FOR artist_record IN SELECT * FROM jsonb_array_elements(artists_json) AS elem
    LOOP
        -- Try to find or create the artist
        SELECT id INTO artist_id_val 
        FROM artists 
        WHERE LOWER(name) = LOWER(artist_record.elem->>'name')
        LIMIT 1;
        
        IF artist_id_val IS NOT NULL THEN
            -- Insert into event_artists if not exists
            INSERT INTO event_artists (event_id, artist_id, billing_order)
            VALUES (p_event_id, artist_id_val, synced_count)
            ON CONFLICT (event_id, artist_id) DO NOTHING;
            
            synced_count := synced_count + 1;
        END IF;
    END LOOP;
    
    RETURN synced_count;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON TABLE event_artists IS 'Junction table linking events to artists with role and billing information';
COMMENT ON TABLE cities IS 'Curated list of cities for dropdown selections';
COMMENT ON TABLE countries IS 'List of countries for dropdown selections';
