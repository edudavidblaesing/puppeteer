-- Migration 036: Add Wikipedia Source

INSERT INTO event_sources (code, name, base_url, scopes, enabled_scopes, is_active)
VALUES (
    'wiki', 
    'Wikipedia', 
    'https://en.wikipedia.org', 
    '["artist", "venue"]'::jsonb, 
    '["artist", "venue"]'::jsonb, 
    true
)
ON CONFLICT (code) DO UPDATE SET
    scopes = EXCLUDED.scopes,
    enabled_scopes = EXCLUDED.enabled_scopes,
    is_active = EXCLUDED.is_active;
