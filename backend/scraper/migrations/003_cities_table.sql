-- Migration 003: Cities Table
-- Add cities as a separate entity

-- Cities table
CREATE TABLE IF NOT EXISTS cities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    country VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    timezone VARCHAR(50),
    ra_area_id INTEGER,
    is_active BOOLEAN DEFAULT true,
    event_count INTEGER DEFAULT 0,
    venue_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert cities based on existing events
INSERT INTO cities (name, country, latitude, longitude, ra_area_id)
SELECT DISTINCT 
    venue_city as name,
    venue_country as country,
    CASE venue_city
        WHEN 'Berlin' THEN 52.52
        WHEN 'Hamburg' THEN 53.5511
        WHEN 'London' THEN 51.5074
        WHEN 'Paris' THEN 48.8566
        WHEN 'Amsterdam' THEN 52.3676
        WHEN 'Barcelona' THEN 41.3851
        WHEN 'New York' THEN 40.7128
        ELSE NULL
    END as latitude,
    CASE venue_city
        WHEN 'Berlin' THEN 13.405
        WHEN 'Hamburg' THEN 9.9937
        WHEN 'London' THEN -0.1278
        WHEN 'Paris' THEN 2.3522
        WHEN 'Amsterdam' THEN 4.9041
        WHEN 'Barcelona' THEN 2.1734
        WHEN 'New York' THEN -74.0060
        ELSE NULL
    END as longitude,
    CASE venue_city
        WHEN 'Berlin' THEN 34
        WHEN 'Hamburg' THEN 148
        WHEN 'London' THEN 13
        WHEN 'Paris' THEN 12
        WHEN 'Amsterdam' THEN 29
        WHEN 'Barcelona' THEN 214
        WHEN 'New York' THEN 8
        ELSE NULL
    END as ra_area_id
FROM events
WHERE venue_city IS NOT NULL AND venue_city != ''
ON CONFLICT (name) DO NOTHING;

-- Update event and venue counts
UPDATE cities SET 
    event_count = (SELECT COUNT(*) FROM events WHERE venue_city = cities.name),
    venue_count = (SELECT COUNT(DISTINCT venue_name) FROM events WHERE venue_city = cities.name);

-- Create index
CREATE INDEX IF NOT EXISTS idx_cities_name ON cities(name);
CREATE INDEX IF NOT EXISTS idx_cities_active ON cities(is_active);

-- Function to update city counts (can be called periodically or via trigger)
CREATE OR REPLACE FUNCTION update_city_counts()
RETURNS void AS $$
BEGIN
    UPDATE cities SET 
        event_count = (SELECT COUNT(*) FROM events WHERE venue_city = cities.name),
        venue_count = (SELECT COUNT(DISTINCT venue_name) FROM events WHERE venue_city = cities.name),
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;
