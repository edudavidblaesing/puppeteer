-- Migration 015: Remove duplicate location data from events
-- Events should get coordinates from venues, not store them directly
-- This migration removes redundant location fields from events table

-- First, ensure all events have venue_id where possible by syncing from venue name/city
UPDATE events e
SET venue_id = v.id
FROM venues v
WHERE e.venue_id IS NULL
  AND e.venue_name IS NOT NULL
  AND LOWER(TRIM(e.venue_name)) = LOWER(TRIM(v.name))
  AND LOWER(TRIM(e.venue_city)) = LOWER(TRIM(v.city));

-- Drop the redundant columns from events
-- Note: We keep venue_name, venue_city, venue_country as denormalized cache for performance
-- but remove latitude/longitude as they should come from venues

-- Remove indexes first
DROP INDEX IF EXISTS idx_events_coordinates;

-- Comment out the actual column drops for now - we'll do this in phases
-- ALTER TABLE events DROP COLUMN IF EXISTS latitude;
-- ALTER TABLE events DROP COLUMN IF EXISTS longitude;
-- These columns will be kept for backward compatibility but should not be edited

-- Create a view that always gets coordinates from venue
CREATE OR REPLACE VIEW events_with_location AS
SELECT 
    e.*,
    v.latitude as venue_latitude,
    v.longitude as venue_longitude,
    v.address as venue_full_address,
    COALESCE(v.latitude, e.latitude) as display_latitude,
    COALESCE(v.longitude, e.longitude) as display_longitude
FROM events e
LEFT JOIN venues v ON e.venue_id = v.id;

-- Add comment to document this
COMMENT ON COLUMN events.latitude IS 'DEPRECATED: Use venue coordinates instead. Kept for backward compatibility.';
COMMENT ON COLUMN events.longitude IS 'DEPRECATED: Use venue coordinates instead. Kept for backward compatibility.';

-- Create function to sync event coordinates from venue when venue_id is set
CREATE OR REPLACE FUNCTION sync_event_coordinates()
RETURNS TRIGGER AS $$
BEGIN
    -- When venue_id is set or updated, copy coordinates from venue
    IF NEW.venue_id IS NOT NULL AND NEW.venue_id IS DISTINCT FROM OLD.venue_id THEN
        UPDATE events e
        SET 
            latitude = v.latitude,
            longitude = v.longitude
        FROM venues v
        WHERE e.id = NEW.id AND v.id = NEW.venue_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-sync coordinates
DROP TRIGGER IF EXISTS trigger_sync_event_coordinates ON events;
CREATE TRIGGER trigger_sync_event_coordinates
    AFTER INSERT OR UPDATE OF venue_id ON events
    FOR EACH ROW
    EXECUTE FUNCTION sync_event_coordinates();

-- Initial sync: Copy all venue coordinates to events
UPDATE events e
SET 
    latitude = v.latitude,
    longitude = v.longitude
FROM venues v
WHERE e.venue_id = v.id
  AND v.latitude IS NOT NULL
  AND v.longitude IS NOT NULL;
