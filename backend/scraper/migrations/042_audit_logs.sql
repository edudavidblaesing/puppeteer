-- Create audit_logs table to track content changes
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL, -- 'event', 'venue', 'artist', 'organizer', 'city'
    entity_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'SCRAPER_UPDATE'
    changes JSONB DEFAULT '{}', -- { field: { old: val, new: val } }
    performed_by VARCHAR(100) DEFAULT 'system', -- user_id or 'system' or 'scraper'
    metadata JSONB DEFAULT '{}', -- extra info
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for lookup
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON audit_logs(performed_by);
