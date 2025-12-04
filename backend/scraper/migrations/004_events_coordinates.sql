-- Migration 004: Add coordinates and is_published to events table
-- Add latitude/longitude columns for geocoded venue addresses
-- Add is_published for publishing workflow

-- Add columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'latitude') THEN
        ALTER TABLE events ADD COLUMN latitude DECIMAL(10, 8);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'longitude') THEN
        ALTER TABLE events ADD COLUMN longitude DECIMAL(11, 8);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'is_published') THEN
        ALTER TABLE events ADD COLUMN is_published BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Create index for spatial queries
CREATE INDEX IF NOT EXISTS idx_events_coordinates ON events(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Create index for published status
CREATE INDEX IF NOT EXISTS idx_events_is_published ON events(is_published);

-- Update events with coordinates from venues table where available
UPDATE events e
SET 
    latitude = v.latitude,
    longitude = v.longitude
FROM venues v
WHERE e.venue_id = v.id
AND e.latitude IS NULL
AND v.latitude IS NOT NULL;
