-- Migration 043: Change event times to TIME type
-- Fixes "invalid input syntax for type timestamp" errors when saving HH:mm strings

-- Drop view that depends on columns
DROP VIEW IF EXISTS events_with_location;

-- Change start_time to TIME
ALTER TABLE events 
ALTER COLUMN start_time TYPE TIME USING start_time::TIME;

-- Change end_time to TIME
ALTER TABLE events 
ALTER COLUMN end_time TYPE TIME USING end_time::TIME;

-- Recreate view
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
