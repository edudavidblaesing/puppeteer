-- Migration 028: Fix Ticketmaster Scopes
-- Migration 027 used 'tm' but the source code in DB is 'ticketmaster'

UPDATE event_sources 
SET 
  scopes = '["event", "venue", "organizer", "artist"]',
  enabled_scopes = '["event", "venue", "organizer", "artist"]'
WHERE code = 'ticketmaster';
