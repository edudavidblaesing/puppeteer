-- Migration 023: Link Venues to Cities Entity
-- Replace text-based city/country in venues with a foreign key to cities table

-- 1. Add city_id column
ALTER TABLE venues ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES cities(id);

-- 2. Backfill city_id based on name matching
UPDATE venues v
SET city_id = c.id
FROM cities c
WHERE LOWER(v.city) = LOWER(c.name)
  AND v.city_id IS NULL;

-- 3. Index for performance
CREATE INDEX IF NOT EXISTS idx_venues_city_id ON venues(city_id);

-- 4. Clean up: In future we might drop city/country columns, 
-- but for now we keep them as fallback/searchable text, 
-- though app logic will prioritize city_id.
