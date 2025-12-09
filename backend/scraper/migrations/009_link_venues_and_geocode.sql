-- Migration 009: Link events to venues and ensure venues have coordinates
-- This migration ensures all events are linked to venues and venues have coordinates

-- Step 1: Create missing venues from events
INSERT INTO venues (id, name, address, city, country, created_at, updated_at)
SELECT 
    gen_random_uuid(),
    e.venue_name,
    e.venue_address,
    e.venue_city,
    e.venue_country,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (LOWER(venue_name), LOWER(venue_city))
        venue_name,
        venue_address,
        venue_city,
        venue_country
    FROM events
    WHERE venue_name IS NOT NULL 
    AND venue_name != ''
) e
WHERE NOT EXISTS (
    SELECT 1 FROM venues v 
    WHERE LOWER(v.name) = LOWER(e.venue_name) 
    AND LOWER(v.city) = LOWER(e.venue_city)
);

-- Step 2: Link events to venues by matching name and city
UPDATE events e
SET venue_id = v.id
FROM venues v
WHERE e.venue_id IS NULL
AND LOWER(e.venue_name) = LOWER(v.name)
AND LOWER(e.venue_city) = LOWER(v.city);

-- Step 3: Create index on venue_id for better performance
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id) WHERE venue_id IS NOT NULL;

-- Step 4: Add a comment noting that geocoding must be done via API endpoint
-- (Geocoding requires external API calls and should be done via /db/venues/geocode-all endpoint)
COMMENT ON TABLE venues IS 'Venues table - use /db/venues/geocode-all API endpoint to geocode missing coordinates';
