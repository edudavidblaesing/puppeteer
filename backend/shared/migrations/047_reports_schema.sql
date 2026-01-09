-- 047_reports_schema.sql
-- Content Reporting System

CREATE TABLE IF NOT EXISTS content_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content_type VARCHAR(50) NOT NULL, -- 'event', 'comment', 'user', 'message'
    content_id VARCHAR(255) NOT NULL, -- UUID or ID string
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, resolved, dismissed
    admin_notes TEXT,
    resolved_by UUID, -- Reference to admin user if we had that, or just store ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON content_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_content ON content_reports(content_type, content_id);

CREATE TRIGGER update_content_reports_updated_at BEFORE UPDATE ON content_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
