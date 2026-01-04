-- Migration 044: Add end_date column
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date DATE;
