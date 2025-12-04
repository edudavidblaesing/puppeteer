-- Add publish_status column to events and unified_events tables
-- Status: 'pending' (needs review), 'approved' (published), 'rejected' (hidden)

-- Add to unified_events table
ALTER TABLE unified_events 
ADD COLUMN IF NOT EXISTS publish_status VARCHAR(20) DEFAULT 'pending';

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_unified_events_publish_status ON unified_events(publish_status);

-- Migrate existing is_published data to new status
UPDATE unified_events 
SET publish_status = CASE 
    WHEN is_published = true THEN 'approved'
    ELSE 'pending'
END
WHERE publish_status IS NULL OR publish_status = 'pending';

-- Add to scraped_events table for tracking review status
ALTER TABLE scraped_events 
ADD COLUMN IF NOT EXISTS publish_status VARCHAR(20) DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_scraped_events_publish_status ON scraped_events(publish_status);

-- Add to events table if it exists (legacy support)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'events') THEN
        ALTER TABLE events ADD COLUMN IF NOT EXISTS publish_status VARCHAR(20) DEFAULT 'pending';
        CREATE INDEX IF NOT EXISTS idx_events_publish_status ON events(publish_status);
        
        UPDATE events 
        SET publish_status = CASE 
            WHEN is_published = true THEN 'approved'
            ELSE 'pending'
        END
        WHERE publish_status IS NULL;
    END IF;
END $$;
