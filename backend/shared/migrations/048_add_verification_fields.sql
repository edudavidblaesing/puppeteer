-- Add verification fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMP;
