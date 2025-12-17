-- Migration 032: Add field_sources to artists and venues
BEGIN;

ALTER TABLE artists ADD COLUMN field_sources JSONB DEFAULT '{}';
ALTER TABLE venues ADD COLUMN field_sources JSONB DEFAULT '{}';

COMMIT;
