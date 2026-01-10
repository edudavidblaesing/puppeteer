-- Add phone_number to users
ALTER TABLE users ADD COLUMN phone_number TEXT UNIQUE;

-- Create follows table
CREATE TABLE follows (
    follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id)
);

-- Index for performance
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- Drop old friendships table (Switching to Follow system)
DROP TABLE IF EXISTS friendships;
