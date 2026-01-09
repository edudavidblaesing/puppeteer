-- Add indexes to improve listEvents query performance

-- Filter indexes
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_publish_status ON events(publish_status);
CREATE INDEX IF NOT EXISTS idx_events_is_published ON events(is_published);
CREATE INDEX IF NOT EXISTS idx_events_venue_city_lower ON events(lower(venue_city));
CREATE INDEX IF NOT EXISTS idx_events_source_code ON events(source_code);

-- Sorting optimization (date + time)
CREATE INDEX IF NOT EXISTS idx_events_date_start_time ON events(date, start_time);

-- Join optimization (though usually covered by primary keys, venue_id is a foreign key)
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id);
