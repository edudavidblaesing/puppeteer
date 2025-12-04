-- Migration 004: Add 'original' source and unified flow improvements
-- Manual/user entries are now treated as source='original' in scraped tables
-- All data flows through scraped -> unified with matching

-- Add 'original' source for manual entries
INSERT INTO event_sources (code, name, base_url) VALUES 
    ('original', 'Manual Entry', NULL)
ON CONFLICT (code) DO NOTHING;

-- Add priority field to source links (original has highest priority = 1)
ALTER TABLE event_source_links ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 10;
ALTER TABLE venue_source_links ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 10;
ALTER TABLE artist_source_links ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 10;

-- Add override fields to unified tables to track which source provides each field
ALTER TABLE unified_events ADD COLUMN IF NOT EXISTS field_sources JSONB DEFAULT '{}';
ALTER TABLE unified_venues ADD COLUMN IF NOT EXISTS field_sources JSONB DEFAULT '{}';
ALTER TABLE unified_artists ADD COLUMN IF NOT EXISTS field_sources JSONB DEFAULT '{}';

-- Priority mapping: original=1, ra=5, ticketmaster=6, etc.
-- Lower number = higher priority

-- Create index for faster priority-based queries
CREATE INDEX IF NOT EXISTS idx_event_source_links_priority ON event_source_links(priority);
CREATE INDEX IF NOT EXISTS idx_venue_source_links_priority ON venue_source_links(priority);
CREATE INDEX IF NOT EXISTS idx_artist_source_links_priority ON artist_source_links(priority);

-- Update existing links to set proper priorities
UPDATE event_source_links esl SET priority = 
    CASE 
        WHEN (SELECT source_code FROM scraped_events WHERE id = esl.scraped_event_id) = 'original' THEN 1
        WHEN (SELECT source_code FROM scraped_events WHERE id = esl.scraped_event_id) = 'ra' THEN 5
        WHEN (SELECT source_code FROM scraped_events WHERE id = esl.scraped_event_id) = 'ticketmaster' THEN 6
        ELSE 10
    END
WHERE priority = 10 OR priority IS NULL;

UPDATE venue_source_links vsl SET priority = 
    CASE 
        WHEN (SELECT source_code FROM scraped_venues WHERE id = vsl.scraped_venue_id) = 'original' THEN 1
        WHEN (SELECT source_code FROM scraped_venues WHERE id = vsl.scraped_venue_id) = 'ra' THEN 5
        WHEN (SELECT source_code FROM scraped_venues WHERE id = vsl.scraped_venue_id) = 'ticketmaster' THEN 6
        ELSE 10
    END
WHERE priority = 10 OR priority IS NULL;

UPDATE artist_source_links asl SET priority = 
    CASE 
        WHEN (SELECT source_code FROM scraped_artists WHERE id = asl.scraped_artist_id) = 'original' THEN 1
        WHEN (SELECT source_code FROM scraped_artists WHERE id = asl.scraped_artist_id) = 'ra' THEN 5
        WHEN (SELECT source_code FROM scraped_artists WHERE id = asl.scraped_artist_id) = 'ticketmaster' THEN 6
        ELSE 10
    END
WHERE priority = 10 OR priority IS NULL;
