
-- Migration 019: Add missing columns to scraped tables for better reset functionality

-- Add columns to scraped_venues
ALTER TABLE scraped_venues ADD COLUMN IF NOT EXISTS venue_type VARCHAR(100);
ALTER TABLE scraped_venues ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Add columns to scraped_artists
ALTER TABLE scraped_artists ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE scraped_artists ADD COLUMN IF NOT EXISTS country VARCHAR(100);

-- Add columns to scraped_events if needed (already seems comprehensive)
-- But ensuring alignment
