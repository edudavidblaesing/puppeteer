-- Migration: Add scrape history tracking
-- Created: 2024-12-04

-- Table to track scraping activity over time
CREATE TABLE IF NOT EXISTS scrape_history (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    city VARCHAR(255),
    source_code VARCHAR(50),
    events_fetched INTEGER DEFAULT 0,
    events_inserted INTEGER DEFAULT 0,
    events_updated INTEGER DEFAULT 0,
    venues_created INTEGER DEFAULT 0,
    artists_created INTEGER DEFAULT 0,
    duration_ms INTEGER,
    error TEXT,
    metadata JSONB DEFAULT '{}'
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_scrape_history_created_at ON scrape_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_history_city ON scrape_history(city);
CREATE INDEX IF NOT EXISTS idx_scrape_history_source ON scrape_history(source_code);

-- View for daily aggregates
CREATE OR REPLACE VIEW scrape_daily_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as scrape_runs,
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
