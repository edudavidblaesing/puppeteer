-- Migration 044: Fix audit_logs entity_id type
-- Change from UUID to VARCHAR to support integer IDs (like Cities)

ALTER TABLE audit_logs 
ALTER COLUMN entity_id TYPE VARCHAR(100) USING entity_id::VARCHAR;
