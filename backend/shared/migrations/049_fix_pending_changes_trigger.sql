-- Migration 049: Fix pending changes trigger to respect is_dismissed status

-- Function to calculate and update has_pending_changes for a specific event
CREATE OR REPLACE FUNCTION update_event_pending_changes()
RETURNS TRIGGER AS $$
DECLARE
    target_event_id UUID;
    has_pending BOOLEAN;
BEGIN
    -- Determine event_id based on the table/operation
    IF TG_TABLE_NAME = 'event_scraped_links' THEN
        IF (TG_OP = 'DELETE') THEN
            target_event_id := OLD.event_id::UUID;
        ELSE
            target_event_id := NEW.event_id::UUID;
        END IF;
    ELSIF TG_TABLE_NAME = 'scraped_events' THEN
        -- Find linked event(s)
        -- Note: scraped_events doesn't have event_id directly, need to join
        -- For efficiency, we'll do this update for all events linked to this scraped_event
        -- But usually it's 1-to-1 or 1-to-many.
        -- We can't assign to target_event_id easily if there are multiple, so we loop?
        -- Or we can run a direct UPDATE FROM?
        
        -- Let's try to update relevant events directly
        UPDATE events e
        SET has_pending_changes = EXISTS (
            SELECT 1
            FROM event_scraped_links esl
            JOIN scraped_events se ON se.id = esl.scraped_event_id
            WHERE esl.event_id = e.id
            AND se.has_changes = TRUE
            AND se.is_dismissed = FALSE
        )
        WHERE e.id IN (
            SELECT event_id::UUID 
            FROM event_scraped_links 
            WHERE scraped_event_id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END)
        );
        
        RETURN NULL; -- After trigger, return value doesn't matter for statement/after
    END IF;

    -- If we have a specific target_event_id (from links table)
    IF target_event_id IS NOT NULL THEN
        UPDATE events e
        SET has_pending_changes = EXISTS (
            SELECT 1
            FROM event_scraped_links esl
            JOIN scraped_events se ON se.id = esl.scraped_event_id
            WHERE esl.event_id = e.id
            AND se.has_changes = TRUE
            AND se.is_dismissed = FALSE
        )
        WHERE e.id = target_event_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for event_scraped_links (Insert/Delete)
DROP TRIGGER IF EXISTS trg_update_pending_changes_links ON event_scraped_links;
CREATE TRIGGER trg_update_pending_changes_links
AFTER INSERT OR DELETE ON event_scraped_links
FOR EACH ROW
EXECUTE FUNCTION update_event_pending_changes();

-- Trigger for scraped_events (Update of has_changes or is_dismissed)
DROP TRIGGER IF EXISTS trg_update_pending_changes_scraped ON scraped_events;
CREATE TRIGGER trg_update_pending_changes_scraped
AFTER UPDATE OF has_changes, is_dismissed ON scraped_events
FOR EACH ROW
EXECUTE FUNCTION update_event_pending_changes();

-- Initial Sweep: Update all events to ensure consistency
UPDATE events e
SET has_pending_changes = EXISTS (
    SELECT 1
    FROM event_scraped_links esl
    JOIN scraped_events se ON se.id = esl.scraped_event_id
    WHERE esl.event_id = e.id
    AND se.has_changes = TRUE
    AND se.is_dismissed = FALSE
);
