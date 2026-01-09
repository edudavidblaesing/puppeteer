-- Migration 020: Dynamic Source Configuration
-- Move source-specific configurations to a dedicated table

-- Ensure Ticketmaster is in sources
INSERT INTO event_sources (code, name, base_url) VALUES 
    ('ticketmaster', 'Ticketmaster', 'https://ticketmaster.com')
ON CONFLICT (code) DO NOTHING;

-- Create table for city-source configurations
CREATE TABLE IF NOT EXISTS city_source_configs (
    id SERIAL PRIMARY KEY,
    city_id INTEGER REFERENCES cities(id) ON DELETE CASCADE,
    source_id INTEGER REFERENCES event_sources(id) ON DELETE CASCADE,
    external_id VARCHAR(255), -- Main ID (e.g. RA Area ID, TM City Name)
    config_json JSONB DEFAULT '{}', -- Extra config (e.g. TM Country Code)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(city_id, source_id)
);

-- Migrate existing RA configurations from cities table
INSERT INTO city_source_configs (city_id, source_id, external_id, is_active)
SELECT 
    c.id, 
    (SELECT id FROM event_sources WHERE code = 'ra'),
    c.ra_area_id::text,
    c.is_active
FROM cities c
WHERE c.ra_area_id IS NOT NULL
ON CONFLICT (city_id, source_id) DO UPDATE 
SET external_id = EXCLUDED.external_id;

-- Seed Ticketmaster configurations (Migrating from hardcoded TICKETMASTER_CITY_MAP)
-- We need to ensure cities exist first. This assumes cities from migration 003 exist.
DO $$
DECLARE
    tm_source_id INTEGER;
    city_rec RECORD;
BEGIN
    SELECT id INTO tm_source_id FROM event_sources WHERE code = 'ticketmaster';

    -- Helper to insert/update TM config
    -- Format: City Name key -> { city: 'CityName', countryCode: 'Code' }
    
    -- New York
    SELECT id INTO city_rec FROM cities WHERE name = 'New York';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id, config_json)
        VALUES (city_rec.id, tm_source_id, 'New York', '{"countryCode": "US"}'::jsonb)
        ON CONFLICT DO NOTHING;
    END IF;

    -- London
    SELECT id INTO city_rec FROM cities WHERE name = 'London';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id, config_json)
        VALUES (city_rec.id, tm_source_id, 'London', '{"countryCode": "GB"}'::jsonb)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Paris
    SELECT id INTO city_rec FROM cities WHERE name = 'Paris';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id, config_json)
        VALUES (city_rec.id, tm_source_id, 'Paris', '{"countryCode": "FR"}'::jsonb)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Berlin
    SELECT id INTO city_rec FROM cities WHERE name = 'Berlin';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id, config_json)
        VALUES (city_rec.id, tm_source_id, 'Berlin', '{"countryCode": "DE"}'::jsonb)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Amsterdam
    SELECT id INTO city_rec FROM cities WHERE name = 'Amsterdam';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id, config_json)
        VALUES (city_rec.id, tm_source_id, 'Amsterdam', '{"countryCode": "NL"}'::jsonb)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Barcelona
    SELECT id INTO city_rec FROM cities WHERE name = 'Barcelona';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id, config_json)
        VALUES (city_rec.id, tm_source_id, 'Barcelona', '{"countryCode": "ES"}'::jsonb)
        ON CONFLICT DO NOTHING;
    END IF;

END $$;

-- Drop the specific column from cities now that we have migrated
ALTER TABLE cities DROP COLUMN IF EXISTS ra_area_id;

-- Add triggers or functions if needed
