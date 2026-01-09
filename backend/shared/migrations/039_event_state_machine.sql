-- Migration: 039_event_state_machine.sql
-- Description: Introduce event state machine status and migrate existing data

-- 1. Add status column to unified_events
ALTER TABLE unified_events
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'SCRAPED_DRAFT';

-- 2. Add status column to scraped_events
ALTER TABLE scraped_events
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'SCRAPED_DRAFT';

-- 3. Add status column to events
ALTER TABLE events
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'MANUAL_DRAFT';

-- 4. Create indexes for status
CREATE INDEX IF NOT EXISTS idx_unified_events_status ON unified_events(status);
CREATE INDEX IF NOT EXISTS idx_scraped_events_status ON scraped_events(status);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

-- 5. Migrate existing data in unified_events
-- If publish_status was 'approved', it is now 'PUBLISHED'
-- If publish_status was 'rejected', it is now 'REJECTED'
-- If publish_status was 'pending', key off 'source_code' or similar if possible. 
-- unified_events usually aggregates. If it has a scraped source, it likely started as scraped. 
-- But safe default for pending is SCRAPED_DRAFT as it requires approval.
UPDATE unified_events
SET status = CASE
    WHEN publish_status = 'approved' THEN 'PUBLISHED'
    WHEN publish_status = 'rejected' THEN 'REJECTED'
    ELSE 'SCRAPED_DRAFT'
END
WHERE status IS NULL OR status = 'SCRAPED_DRAFT';

-- 6. Migrate existing data in scraped_events
UPDATE scraped_events
SET status = CASE
    WHEN publish_status = 'approved' THEN 'PUBLISHED'
    WHEN publish_status = 'rejected' THEN 'REJECTED'
    ELSE 'SCRAPED_DRAFT'
END
WHERE status IS NULL OR status = 'SCRAPED_DRAFT';

-- 7. Migrate existing data in events
-- Note: 'events' table contains both manually created and synced events.
-- We can try to distinguish manual events if they don't have a source_code or external ID, but currently many might be mixed.
-- If 'approved', we assume PUBLISHED.
-- If 'pending', we check if it looks like a manual draft or scraped draft.
-- For now, we'll map 'pending' to 'MANUAL_DRAFT' if it has no source info, or 'SCRAPED_DRAFT' if it does?
-- To keep it simple and safe:
-- approved -> PUBLISHED
-- rejected -> REJECTED
-- pending -> MANUAL_DRAFT (Assigning to manual draft forces review, which is safe)
UPDATE events
SET status = CASE
    WHEN publish_status = 'approved' THEN 'PUBLISHED'
    WHEN publish_status = 'rejected' THEN 'REJECTED'
    -- If it has a scraped_event_id links, it might be better as SCRAPED_DRAFT, but MANUAL_DRAFT allows editing too.
    ELSE 'MANUAL_DRAFT' 
END
WHERE status IS NULL OR status = 'MANUAL_DRAFT';

-- Optional: You might want to drop the old publish_status column later, but we keep it for now for safety.
