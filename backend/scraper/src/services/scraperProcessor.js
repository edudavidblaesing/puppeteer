const { pool } = require('../db');
const { cleanVenueAddress } = require('../utils/stringUtils');
const { geocodeAddress } = require('./geocoder');

// Helper: Check for existing coordinates in DB
async function checkExistingCoordinates(event) {
    // 1. Check by Source Venue ID
    if (event.venue_raw && event.venue_raw.source_venue_id) {
        const res = await pool.query(`
            SELECT latitude, longitude FROM scraped_venues
            WHERE source_code = $1 AND source_venue_id = $2
            AND latitude IS NOT NULL AND longitude IS NOT NULL
        `, [event.source_code, event.venue_raw.source_venue_id]);
        if (res.rows.length > 0) return res.rows[0];
    }

    // 2. Check by Name + City (Fuzzyish exact match)
    if (event.venue_name && event.venue_city) {
        // Check scraped venues
        const resScraped = await pool.query(`
            SELECT latitude, longitude FROM scraped_venues
            WHERE LOWER(name) = LOWER($1) AND LOWER(city) = LOWER($2)
            AND latitude IS NOT NULL AND longitude IS NOT NULL
            LIMIT 1
        `, [event.venue_name, event.venue_city]);
        if (resScraped.rows.length > 0) return resScraped.rows[0];

        // Check main venues
        const resMain = await pool.query(`
            SELECT latitude, longitude FROM venues
            WHERE LOWER(name) = LOWER($1) AND LOWER(city) = LOWER($2)
            AND latitude IS NOT NULL AND longitude IS NOT NULL
            LIMIT 1
        `, [event.venue_name, event.venue_city]);
        if (resMain.rows.length > 0) return resMain.rows[0];
    }
    return null;
}

// Helper: Deep comparison for objects
function deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true;
    if (obj1 == null || obj2 == null) return false;
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
        if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
            return false;
        }
    }
    return true;
}

// Helper: Normalize and compare dates
function datesEqual(d1, d2) {
    if (!d1 && !d2) return true;
    if (!d1 || !d2) return false;
    const s1 = d1 instanceof Date ? d1.toISOString().split('T')[0] : d1;
    const s2 = d2 instanceof Date ? d2.toISOString().split('T')[0] : d2;
    return s1 === s2;
}

// Helper: Check if event has meaningful changes
function hasEventChanged(existing, incoming) {
    if (existing.title !== incoming.title) return true;
    if (!datesEqual(existing.date, incoming.date)) return true;
    if (existing.start_time !== incoming.start_time) return true;
    if (existing.end_time !== incoming.end_time) return true;
    if (existing.venue_name !== incoming.venue_name) return true;
    if (existing.venue_city !== incoming.venue_city) return true;

    // Compare parsed JSON fields
    // existing.artists_json is likely an object from PG driver
    // incoming.artists_json is an object
    if (!deepEqual(existing.artists_json, incoming.artists_json)) return true;
    if (!deepEqual(existing.price_info, incoming.price_info)) return true;

    // Check URLs
    if (existing.content_url !== incoming.content_url) return true;
    if (existing.flyer_front !== incoming.flyer_front) return true;

    // Check Lat/Lon if provided in incoming (sometimes geocoding fills this late, but here we check scraped data)
    // If incoming has explicit lat/lon different from existing
    if (incoming.venue_latitude && existing.venue_latitude !== incoming.venue_latitude) return true;
    if (incoming.venue_longitude && existing.venue_longitude !== incoming.venue_longitude) return true;

    return false;
}

// Helper: Check for existing coordinates in DB

// Process and save scraped events
async function processScrapedEvents(events, options = {}) {
    const { geocodeMissing = true } = options;
    let inserted = 0, updated = 0, geocoded = 0;

    // Track stats
    const stats = {
        inserted: 0,
        updated: 0,
        unmodified: 0,
        geocoded: 0,
        venuesCreated: 0,
        artistsCreated: 0
    };

    if (!events || events.length === 0) return stats;

    for (const event of events) {
        try {
            // Clean venue address before processing and extract postal code
            let venuePostalCode = null;
            if (event.venue_address) {
                const cleaned = cleanVenueAddress(
                    event.venue_address,
                    event.venue_city,
                    event.venue_country
                );
                event.venue_address = cleaned.address;
                venuePostalCode = cleaned.postalCode;
            }

            // Helper to clean time
            const extractTime = (str) => {
                if (!str) return null;
                // If full ISO date, extract time part
                if (str.includes('T')) {
                    // 2023-01-01T20:00:00
                    return str.split('T')[1].split('.')[0].slice(0, 8);
                }
                return str;
            };

            // Normalize times
            event.start_time = extractTime(event.start_time);
            event.end_time = extractTime(event.end_time);

            // Geocode if coordinates are missing and we have address info
            let venueLat = event.venue_latitude;
            let venueLon = event.venue_longitude;

            if (geocodeMissing && (!venueLat || !venueLon) && (event.venue_address || event.venue_name)) {
                try {
                    // Try to find existing coordinates first
                    const existingCoords = await checkExistingCoordinates(event);

                    if (existingCoords) {
                        venueLat = existingCoords.latitude;
                        venueLon = existingCoords.longitude;
                        // stats.geocoded++; // Not technically geocoded newly, but resolved
                        if (event.venue_raw) {
                            event.venue_raw.latitude = venueLat;
                            event.venue_raw.longitude = venueLon;
                        }
                    } else {
                        // Try geocoding (with basic caching implied by geocoder service if we implemented one, 
                        // otherwise it hits the API - be careful with rates)
                        // The geocoder service implementation has caching.
                        const coords = await geocodeAddress(
                            event.venue_address || event.venue_name,
                            event.venue_city,
                            event.venue_country
                        );

                        if (coords) {
                            venueLat = coords.latitude;
                            venueLon = coords.longitude;
                            stats.geocoded++;

                            // Update lat/lon in raw data too if present
                            if (event.venue_raw) {
                                event.venue_raw.latitude = venueLat;
                                event.venue_raw.longitude = venueLon;
                            }
                        }
                    }
                } catch (geoErr) {
                    console.warn(`[Geocode] Failed for ${event.venue_name}: ${geoErr.message}`);
                }
            }

            // Process artists/organizers JSON
            // Note: event.artists_json is the Object structure.
            // We stringify it for the INSERT param:
            const artistsJsonStr = event.artists_json ? JSON.stringify(event.artists_json) : null;
            const organizersJsonStr = event.organizers_json ? JSON.stringify(event.organizers_json) : null;
            const priceInfoJsonStr = event.price_info ? JSON.stringify(event.price_info) : null;

            // Check if existing
            const existingResult = await pool.query(
                `SELECT * FROM scraped_events WHERE source_code = $1 AND source_event_id = $2`,
                [event.source_code, event.source_event_id]
            );

            let shouldUpdate = false;
            let isNew = false;

            if (existingResult.rows.length === 0) {
                isNew = true;
                stats.inserted++;
            } else {
                const existing = existingResult.rows[0];
                if (hasEventChanged(existing, event)) {
                    shouldUpdate = true;
                    stats.updated++;
                } else {
                    stats.unmodified++;
                }
            }

            if (isNew) {
                // Insert New
                await pool.query(`
                    INSERT INTO scraped_events (
                        source_code, source_event_id, title, date, start_time, end_time,
                        content_url, flyer_front, description, venue_name, venue_address,
                        venue_city, venue_country, venue_latitude, venue_longitude,
                        artists_json, organizers_json, price_info, raw_data, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_TIMESTAMP)
                `, [
                    event.source_code, event.source_event_id, event.title, event.date,
                    event.start_time, event.end_time, event.content_url, event.flyer_front,
                    event.description, event.venue_name, event.venue_address, event.venue_city,
                    event.venue_country, venueLat, venueLon,
                    artistsJsonStr, organizersJsonStr, priceInfoJsonStr, event.raw_data
                ]);
            } else if (shouldUpdate) {
                // Update Existing
                await pool.query(`
                    UPDATE scraped_events SET
                        title = $1,
                        date = $2,
                        start_time = $3,
                        end_time = $4,
                        content_url = $5,
                        flyer_front = $6,
                        description = $7,
                        venue_name = $8,
                        venue_address = $9,
                        venue_city = $10,
                        venue_country = $11,
                        venue_latitude = $12,
                        venue_longitude = $13,
                        artists_json = $14,
                        organizers_json = $15,
                        price_info = $16,
                        raw_data = $17,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE source_code = $18 AND source_event_id = $19
                `, [
                    event.title, event.date,
                    event.start_time, event.end_time, event.content_url, event.flyer_front,
                    event.description, event.venue_name, event.venue_address, event.venue_city,
                    event.venue_country, venueLat, venueLon,
                    artistsJsonStr, organizersJsonStr, priceInfoJsonStr, event.raw_data,
                    event.source_code, event.source_event_id
                ]);
            }

            // Save Scraped Venue
            if (event.venue_raw) {
                const v = event.venue_raw;
                const venueRes = await pool.query(`
                    INSERT INTO scraped_venues (
                        source_code, source_venue_id, name, address, city, country,
                        latitude, longitude, content_url, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
                    ON CONFLICT (source_code, source_venue_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        address = EXCLUDED.address,
                        city = EXCLUDED.city,
                        country = EXCLUDED.country,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        content_url = EXCLUDED.content_url,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING (xmax = 0) as inserted
                `, [
                    event.source_code, v.source_venue_id, v.name, v.address,
                    v.city, v.country, v.latitude || venueLat, v.longitude || venueLon, v.content_url
                ]);
                if (venueRes.rows[0].inserted) stats.venuesCreated++;
            }

            // Save Scraped Artists
            if (event.artists_json && Array.isArray(event.artists_json)) {
                for (const artist of event.artists_json) {
                    if (!artist.name) continue;
                    const artistRes = await pool.query(`
                        INSERT INTO scraped_artists (
                            source_code, source_artist_id, name, genres, image_url, content_url, artist_type, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                        ON CONFLICT (source_code, source_artist_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            genres = EXCLUDED.genres,
                            image_url = EXCLUDED.image_url,
                            content_url = EXCLUDED.content_url,
                            artist_type = EXCLUDED.artist_type,
                            updated_at = CURRENT_TIMESTAMP
                        RETURNING (xmax = 0) as inserted
                    `, [
                        event.source_code, artist.source_artist_id, artist.name,
                        artist.genres ? JSON.stringify(artist.genres) : null,
                        artist.image_url, artist.content_url || null,
                        artist.type || null
                    ]);
                    if (artistRes.rows[0].inserted) stats.artistsCreated++; // Reuse metric or add new one? Keeping it simple.
                }
            }

            // Save Scraped Organizers
            if (event.organizers_json && Array.isArray(event.organizers_json)) {
                for (const organizer of event.organizers_json) {
                    if (!organizer.name) continue;
                    // Use source_organizer_id if available, otherwise fallback to name as ID could be tricky
                    // RA provides ID.
                    if (!organizer.source_organizer_id) continue;

                    await pool.query(`
                        INSERT INTO scraped_organizers (
                            source_code, source_id, name, description, image_url, url, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                        ON CONFLICT (source_code, source_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            description = EXCLUDED.description,
                            image_url = EXCLUDED.image_url,
                            url = EXCLUDED.url,
                            updated_at = CURRENT_TIMESTAMP
                    `, [
                        event.source_code,
                        organizer.source_organizer_id,
                        organizer.name,
                        organizer.description || null,
                        organizer.image_url || null,
                        organizer.content_url || null
                    ]);
                }
            }

        } catch (err) {
            console.error(`Error saving event ${event.title}: ${err.message}`);
        }
    }

    return stats;
}

async function logScrapeHistory(data) {
    try {
        await pool.query(`
            INSERT INTO scrape_history (city, source_code, events_fetched, events_inserted, events_updated, venues_created, artists_created, duration_ms, error, metadata, scrape_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
            data.city,
            data.source_code,
            data.events_fetched || 0,
            data.events_inserted || 0,
            data.events_updated || 0,
            data.venues_created || 0,
            data.artists_created || 0,
            data.duration_ms || null,
            data.error || null,
            JSON.stringify(data.metadata || {}),
            data.scrape_type || 'manual'
        ]);
    } catch (err) {
        console.error('Failed to log scrape history:', err.message);
    }
}

module.exports = {
    processScrapedEvents,
    logScrapeHistory
};
