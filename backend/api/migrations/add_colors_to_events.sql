-- Add colors column to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS colors JSONB DEFAULT NULL;
