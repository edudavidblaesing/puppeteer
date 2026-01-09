-- Migration 002: Add source columns to existing tables
-- This migration ensures all columns exist for multi-source support

-- Add source columns to events if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'source_code') THEN
        ALTER TABLE events ADD COLUMN source_code VARCHAR(50) DEFAULT 'ra';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'source_id') THEN
        ALTER TABLE events ADD COLUMN source_id VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'raw_data') THEN
        ALTER TABLE events ADD COLUMN raw_data JSONB;
    END IF;
END $$;

-- Add source columns to venues if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'source_code') THEN
        ALTER TABLE venues ADD COLUMN source_code VARCHAR(50) DEFAULT 'ra';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'source_id') THEN
        ALTER TABLE venues ADD COLUMN source_id VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'latitude') THEN
        ALTER TABLE venues ADD COLUMN latitude DECIMAL(10, 8);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'longitude') THEN
        ALTER TABLE venues ADD COLUMN longitude DECIMAL(11, 8);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'raw_data') THEN
        ALTER TABLE venues ADD COLUMN raw_data JSONB;
    END IF;
END $$;

-- Add source columns to artists if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'artists' AND column_name = 'source_code') THEN
        ALTER TABLE artists ADD COLUMN source_code VARCHAR(50) DEFAULT 'ra';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'artists' AND column_name = 'source_id') THEN
        ALTER TABLE artists ADD COLUMN source_id VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'artists' AND column_name = 'image_url') THEN
        ALTER TABLE artists ADD COLUMN image_url VARCHAR(500);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'artists' AND column_name = 'raw_data') THEN
        ALTER TABLE artists ADD COLUMN raw_data JSONB;
    END IF;
END $$;

-- Create event_sources table if it doesn't exist
CREATE TABLE IF NOT EXISTS event_sources (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    base_url VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default sources
INSERT INTO event_sources (code, name, base_url) VALUES 
    ('ra', 'Resident Advisor', 'https://ra.co'),
    ('eventbrite', 'Eventbrite', 'https://eventbrite.com'),
    ('facebook', 'Facebook Events', 'https://facebook.com'),
    ('dice', 'DICE', 'https://dice.fm')
ON CONFLICT (code) DO NOTHING;

-- Add indexes for source columns
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source_code);
CREATE INDEX IF NOT EXISTS idx_venues_source ON venues(source_code);
CREATE INDEX IF NOT EXISTS idx_artists_source ON artists(source_code);
