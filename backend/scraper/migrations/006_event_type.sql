-- Migration 006: Add event_type column
-- Categorizes events: club, concert, festival, exhibition, workshop, party, etc.

-- Add event_type enum type
DO $$ BEGIN
    CREATE TYPE event_type AS ENUM (
        'event',       -- Default/unknown type
        'club',        -- Club night, DJ set
        'concert',     -- Live music performance
        'festival',    -- Multi-day or large-scale event
        'exhibition',  -- Art exhibition, gallery opening
        'workshop',    -- Educational/participatory event
        'party',       -- Private party, celebration
        'performance', -- Dance, theater, live show
        'rave',        -- Underground rave
        'listening'    -- Listening session, album release
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add event_type column to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type VARCHAR(50) DEFAULT 'event';

-- Add event_type column to scraped_events table  
ALTER TABLE scraped_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(50) DEFAULT 'event';

-- Create index for filtering by event type
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_scraped_events_event_type ON scraped_events(event_type);

-- Update existing events: try to classify based on title/description keywords
UPDATE events SET event_type = 
    CASE 
        WHEN LOWER(title) ~ '(festival|fest\b|open air)' THEN 'festival'
        WHEN LOWER(title) ~ '(concert|live|tour\b|in concert)' THEN 'concert'
        WHEN LOWER(title) ~ '(rave|illegal|underground)' THEN 'rave'
        WHEN LOWER(title) ~ '(exhibition|gallery|art show|vernissage)' THEN 'exhibition'
        WHEN LOWER(title) ~ '(workshop|class|learn|masterclass)' THEN 'workshop'
        WHEN LOWER(title) ~ '(performance|ballet|dance show|theater|theatre)' THEN 'performance'
        WHEN LOWER(title) ~ '(listening|album release|premiere)' THEN 'listening'
        WHEN LOWER(title) ~ '(club|techno|house|disco|dj\b)' OR LOWER(venue_name) ~ '(club|berghain|tresor|watergate|fabric)' THEN 'club'
        WHEN LOWER(title) ~ '(party|birthday|celebration|bash)' THEN 'party'
        ELSE 'event'
    END
WHERE event_type IS NULL OR event_type = 'event';
