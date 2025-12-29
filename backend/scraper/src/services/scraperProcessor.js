const { pool } = require('../db');
const { cleanVenueAddress } = require('../utils/stringUtils');
const { geocodeAddress } = require('./geocoder');
const { EVENT_STATES } = require('../models/eventStateMachine');

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

// Helper: Normalize strings (empty string == null)
function normalizeString(str) {
    if (!str) return null;
    return str.trim();
}

// Helper: Normalize time (HH:MM)
function normalizeTime(t) {
    if (!t) return null;
    // Extract HH:MM
    const match = t.match(/(\d{2}:\d{2})/);
    return match ? match[1] : t;
}

// Helper: Compare artists array ignoring order
function artistsEqual(arr1, arr2) {
    if (!arr1 && !arr2) return true;
    if (!arr1 || !arr2) return false;
    if (arr1.length !== arr2.length) return false;

    // Sort by name for comparison
    const sorted1 = [...arr1].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const sorted2 = [...arr2].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Compare each element (minimal check on name and headliner status if exists)
    return sorted1.every((a, i) => {
        const b = sorted2[i];
        return a.name === b.name && deepEqual(a.genres, b.genres);
    });
}

// Helper: Check if event has meaningful changes
function hasEventChanged(existing, incoming) {
    if (normalizeString(existing.title) !== normalizeString(incoming.title)) return true;
    if (!datesEqual(existing.date, incoming.date)) return true;
    if (normalizeTime(existing.start_time) !== normalizeTime(incoming.start_time)) return true;
    if (normalizeTime(existing.end_time) !== normalizeTime(incoming.end_time)) return true;
    if (normalizeString(existing.venue_name) !== normalizeString(incoming.venue_name)) return true;
    if (normalizeString(existing.venue_city) !== normalizeString(incoming.venue_city)) return true;

    // Compare parsed JSON fields
    // existing.artists_json is likely an object from PG driver
    // incoming.artists_json is an object
    // Use specialized comparison for artists
    if (!artistsEqual(existing.artists_json, incoming.artists_json)) return true;

    // Price info might be subtle, deepEqual is usually safe if structure is consistent
    if (!deepEqual(existing.price_info, incoming.price_info)) return true;

    // Check URLs
    if (normalizeString(existing.content_url) !== normalizeString(incoming.content_url)) return true;
    if (normalizeString(existing.flyer_front) !== normalizeString(incoming.flyer_front)) return true;

    // Check Lat/Lon ONLY if incoming has it and it differs significantly
    // (Float comparison issue? Usually these are strings or exact floats)
    if (incoming.venue_latitude && existing.venue_latitude) {
        if (Math.abs(parseFloat(existing.venue_latitude) - parseFloat(incoming.venue_latitude)) > 0.0001) return true;
    }
    if (incoming.venue_longitude && existing.venue_longitude) {
        if (Math.abs(parseFloat(existing.venue_longitude) - parseFloat(incoming.venue_longitude)) > 0.0001) return true;
    }

    return false;
}

// Process and save scraped events
async function processScrapedEvents(events, options = {}) {
    const { geocodeMissing = true, scopes = ['event', 'venue', 'artist', 'organizer'] } = options;

    // Track stats
    const stats = {
        inserted: 0,
        updated: 0,
        unmodified: 0,
        geocoded: 0,
        venuesCreated: 0,
        venuesUpdated: 0,
        artistsCreated: 0,
        artistsUpdated: 0,
        organizersCreated: 0,
        organizersUpdated: 0
    };

    if (!events || events.length === 0) return stats;

    const canScrapeEvent = scopes.includes('event');
    const canScrapeVenue = scopes.includes('venue');
    const canScrapeArtist = scopes.includes('artist');
    const canScrapeOrganizer = scopes.includes('organizer');

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
            // Only geocode if we are capturing venue data OR event data (which also stores lat/lon)
            let venueLat = event.venue_latitude;
            let venueLon = event.venue_longitude;

            if (geocodeMissing && (canScrapeVenue || canScrapeEvent) && (!venueLat || !venueLon) && (event.venue_address || event.venue_name)) {
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

            // Determine Status
            let status = EVENT_STATES.SCRAPED_DRAFT;
            try {
                const now = new Date();
                let endDateTime = null;

                if (event.date) {
                    const dateStr = event.date instanceof Date ? event.date.toISOString().split('T')[0] : event.date;
                    let timeStr = event.end_time || event.start_time || '23:59:59';
                    // Ensure timeStr format HH:MM:SS or HH:MM
                    if (timeStr.length === 5) timeStr += ':00';

                    endDateTime = new Date(`${dateStr}T${timeStr}`);

                    if (!isNaN(endDateTime.getTime()) && endDateTime < now) {
                        status = EVENT_STATES.REJECTED;
                    }
                }
            } catch (e) {
                console.warn(`[Scraper] Failed to calculate status date for ${event.title}:`, e);
            }

            // --- 1. Save Scraped Event ---
            if (canScrapeEvent) {
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
                            artists_json, organizers_json, price_info, raw_data, status, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, CURRENT_TIMESTAMP)
                    `, [
                        event.source_code, event.source_event_id, event.title, event.date,
                        event.start_time, event.end_time, event.content_url, event.flyer_front,
                        event.description, event.venue_name, event.venue_address, event.venue_city,
                        event.venue_country, venueLat, venueLon,
                        artistsJsonStr, organizersJsonStr, priceInfoJsonStr, event.raw_data, status
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
            }

            // --- 2. Save Scraped Venue ---
            if (canScrapeVenue && event.venue_raw) {
                const v = event.venue_raw;
                // Normalize description
                if (!v.description && v.blurb) v.description = v.blurb;

                // Fallback: If name is missing, try to use address
                if (!v.name && v.address) {
                    v.name = v.address;
                    event.venue_name = v.name; // Keep valid for event record
                    console.warn(`[Scraper] Venue name missing for event ${event.title}. Using address as name: "${v.name}"`);
                }

                if (!v.name) {
                    console.warn(`[Scraper] Skipping venue for event ${event.title} (Source: ${event.source_code}, ID: ${event.source_event_id}) - Missing venue name and address`);
                } else {
                    const venueRes = await pool.query(`
                    INSERT INTO scraped_venues (
                        source_code, source_venue_id, name, address, city, country,
                        latitude, longitude, content_url, description, raw_data, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
                    ON CONFLICT (source_code, source_venue_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        address = EXCLUDED.address,
                        city = EXCLUDED.city,
                        country = EXCLUDED.country,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        content_url = EXCLUDED.content_url,
                        description = COALESCE(EXCLUDED.description, scraped_venues.description),
                        raw_data = EXCLUDED.raw_data,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING (xmax = 0) as inserted
                `, [
                        event.source_code, v.source_venue_id, v.name, v.address,
                        v.city, v.country, v.latitude || venueLat, v.longitude || venueLon, v.content_url,
                        v.description || null,
                        v // Save entire venue object as raw_data
                    ]);
                    if (venueRes.rows[0].inserted) {
                        stats.venuesCreated++;
                    } else {
                        stats.venuesUpdated++;
                    }
                }
            }

            // --- 3. Save Scraped Artists ---
            if (canScrapeArtist && event.artists_json && Array.isArray(event.artists_json)) {
                for (const artist of event.artists_json) {
                    if (!artist.name) continue;
                    const artistRes = await pool.query(`
                        INSERT INTO scraped_artists (
                            source_code, source_artist_id, name, genres, image_url, content_url, artist_type, raw_data, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
                        ON CONFLICT (source_code, source_artist_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            genres = EXCLUDED.genres,
                            image_url = EXCLUDED.image_url,
                            content_url = EXCLUDED.content_url,
                            artist_type = EXCLUDED.artist_type,
                            raw_data = EXCLUDED.raw_data,
                            updated_at = CURRENT_TIMESTAMP
                        RETURNING (xmax = 0) as inserted
                    `, [
                        event.source_code, artist.source_artist_id, artist.name,
                        artist.genres ? JSON.stringify(artist.genres) : null,
                        artist.image_url, artist.content_url || null,
                        artist.type || null,
                        artist // Save entire artist object as raw_data
                    ]);
                    if (artistRes.rows[0].inserted) {
                        stats.artistsCreated++;
                    } else {
                        stats.artistsUpdated++;
                    }
                }
            }

            // --- 4. Save Scraped Organizers ---
            if (canScrapeOrganizer && event.organizers_json && Array.isArray(event.organizers_json)) {
                for (const organizer of event.organizers_json) {
                    if (!organizer.name) continue;
                    if (!organizer.source_organizer_id) continue;

                    const organizerRes = await pool.query(`
                        INSERT INTO scraped_organizers (
                            source_code, source_id, name, description, image_url, url, raw_data, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                        ON CONFLICT (source_code, source_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            description = EXCLUDED.description,
                            image_url = EXCLUDED.image_url,
                            url = EXCLUDED.url,
                            raw_data = EXCLUDED.raw_data,
                            updated_at = CURRENT_TIMESTAMP
                        RETURNING (xmax = 0) as inserted
                    `, [
                        event.source_code,
                        organizer.source_organizer_id,
                        organizer.name,
                        organizer.description || null,
                        organizer.image_url || null,
                        organizer.content_url || null,
                        organizer // Save entire organizer object as raw_data
                    ]);

                    if (organizerRes.rows[0].inserted) {
                        stats.organizersCreated++;
                    } else {
                        stats.organizersUpdated++;
                    }
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
        const metadata = {
            ...(data.metadata || {}),
            venues_updated: data.venues_updated || 0,
            artists_updated: data.artists_updated || 0,
            organizers_created: data.organizers_created || 0,
            organizers_updated: data.organizers_updated || 0
        };

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
            JSON.stringify(metadata),
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
