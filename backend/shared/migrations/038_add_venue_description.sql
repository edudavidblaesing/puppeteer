-- Migration to add description column to venues table
ALTER TABLE venues ADD COLUMN IF NOT EXISTS description TEXT;
