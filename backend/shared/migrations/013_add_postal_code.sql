-- Add postal_code field to venues and scraped_venues tables

ALTER TABLE venues ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
ALTER TABLE scraped_venues ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);

-- Extract postal codes from existing addresses before they were cleaned
-- This won't work now since we already cleaned them, but will be useful for future reference

-- Add index for postal code searches
CREATE INDEX IF NOT EXISTS idx_venues_postal_code ON venues(postal_code);
CREATE INDEX IF NOT EXISTS idx_scraped_venues_postal_code ON scraped_venues(postal_code);
