-- Track changes in scraped events
-- Adds columns to detect and store actual changes between scrapes

-- Add column to store detected changes
ALTER TABLE scraped_events 
ADD COLUMN IF NOT EXISTS changes JSONB DEFAULT NULL;

-- Add column to track if event has been modified since last scrape
ALTER TABLE scraped_events
ADD COLUMN IF NOT EXISTS has_changes BOOLEAN DEFAULT false;

-- Add index for finding events with changes
CREATE INDEX IF NOT EXISTS idx_scraped_events_has_changes 
ON scraped_events(has_changes) WHERE has_changes = true;

-- Add column to main events table to track pending changes from scraped sources
ALTER TABLE events
ADD COLUMN IF NOT EXISTS has_pending_changes BOOLEAN DEFAULT false;

-- Add index for finding events with pending changes
CREATE INDEX IF NOT EXISTS idx_events_has_pending_changes 
ON events(has_pending_changes) WHERE has_pending_changes = true;

COMMENT ON COLUMN scraped_events.changes IS 'JSONB storing field-level changes detected during update';
COMMENT ON COLUMN scraped_events.has_changes IS 'True if this scraped event differs from previous version';
COMMENT ON COLUMN events.has_pending_changes IS 'True if linked scraped events have changes that need review';
