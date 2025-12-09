-- Sync venues from events table
-- Creates missing venues in venues table from unique venue combinations in events

INSERT INTO venues (id, name, city, country, address, created_at, updated_at)
SELECT 
    gen_random_uuid() as id,
    venue_name as name,
    venue_city as city,
    venue_country as country,
    venue_address as address,
    NOW() as created_at,
    NOW() as updated_at
FROM (
    SELECT DISTINCT ON (LOWER(venue_name), LOWER(venue_city))
        venue_name,
        venue_city,
        venue_country,
        venue_address
    FROM events
    WHERE venue_name IS NOT NULL 
      AND venue_name != ''
      AND venue_city IS NOT NULL
      AND venue_city != ''
) unique_venues
WHERE NOT EXISTS (
    SELECT 1 FROM venues v 
    WHERE LOWER(v.name) = LOWER(unique_venues.venue_name)
      AND LOWER(v.city) = LOWER(unique_venues.venue_city)
);

-- Link events to venues
UPDATE events e
SET venue_id = v.id
FROM venues v
WHERE e.venue_id IS NULL
  AND LOWER(e.venue_name) = LOWER(v.name)
  AND LOWER(e.venue_city) = LOWER(v.city);
