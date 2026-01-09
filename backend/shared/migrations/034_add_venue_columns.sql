-- Migration 034: Add missing columns to venues table
-- Fixes issue where Venue Form fields were not saving

ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_type VARCHAR(100);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Ensure other potentially missing columns from 007 are also present
ALTER TABLE venues ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS social_links JSONB;
