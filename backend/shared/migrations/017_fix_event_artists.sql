-- Migration 017: Fix event_artists table columns
-- Adds missing columns if they don't exist

ALTER TABLE event_artists ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'performer';
ALTER TABLE event_artists ADD COLUMN IF NOT EXISTS billing_order INTEGER DEFAULT 0;
ALTER TABLE event_artists ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE event_artists ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE event_artists ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add ID column if it doesn't exist (might be tricky if it's not a primary key yet)
-- If it was created as a simple join table, it might not have an ID.
-- Let's check if we can add it.
-- ALTER TABLE event_artists ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY; 
-- (Skipping ID for now to avoid complications with existing data/constraints)
