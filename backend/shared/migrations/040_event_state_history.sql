-- Create event_state_history table
CREATE TABLE IF NOT EXISTS event_state_history (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(50) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    previous_state VARCHAR(50),
    new_state VARCHAR(50) NOT NULL,
    actor VARCHAR(100) DEFAULT 'system',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster history lookups
CREATE INDEX IF NOT EXISTS idx_event_state_history_event_id ON event_state_history(event_id);
CREATE INDEX IF NOT EXISTS idx_event_state_history_created_at ON event_state_history(created_at);
