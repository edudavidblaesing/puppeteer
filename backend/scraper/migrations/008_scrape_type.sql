-- Migration: Add scrape_type to track manual vs scheduled scrapes
-- Created: 2024-12-07

-- Add scrape_type column
ALTER TABLE scrape_history 
ADD COLUMN IF NOT EXISTS scrape_type VARCHAR(20) DEFAULT 'manual' CHECK (scrape_type IN ('manual', 'scheduled'));

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_scrape_history_type ON scrape_history(scrape_type);

-- Update view to include scrape_type
CREATE OR REPLACE VIEW scrape_daily_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as scrape_runs,
    COUNT(*) FILTER (WHERE scrape_type = 'manual') as manual_runs,
    COUNT(*) FILTER (WHERE scrape_type = 'scheduled') as scheduled_runs,
    SUM(events_fetched) as total_events_fetched,
    SUM(events_inserted) as total_events_inserted,
    SUM(events_updated) as total_events_updated,
    SUM(venues_created) as total_venues_created,
    SUM(artists_created) as total_artists_created,
    COUNT(DISTINCT city) as cities_scraped,
    COUNT(DISTINCT source_code) as sources_used
FROM scrape_history
WHERE error IS NULL
GROUP BY DATE(created_at)
ORDER BY date DESC;
