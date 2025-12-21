const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { geocodeAddress } = require('../services/geocoder');
const { saveOriginalEntry, linkToUnified, refreshUnifiedVenue } = require('../services/unifiedService');
const { matchAndLinkVenues } = require('../services/matchingService');

// ============================================
// VENUE GEOCODING
// ============================================

// Geocode specific venues (synchronous, for testing/manual trigger)
const geocodeVenues = async (req, res) => {
    try {
        const { limit = 10, debug = false } = req.body;

        // Get venues without coordinates
        const venues = await pool.query(`
            SELECT id, name, address, city, country
            FROM venues
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND (address IS NOT NULL OR city IS NOT NULL)
            LIMIT $1
        `, [limit]);

        let geocoded = 0;
        let failed = 0;
        const errors = [];

        for (const venue of venues.rows) {
            try {
                console.log(`[Geocode] Processing: ${venue.name}`);
                const coords = await geocodeAddress(venue.address, venue.city, venue.country);

                if (coords) {
                    await pool.query(`
                        UPDATE venues 
                        SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $3
                    `, [coords.latitude, coords.longitude, venue.id]);
                    geocoded++;
                    console.log(`[Geocode] Success: ${venue.name} -> ${coords.latitude}, ${coords.longitude}`);
                } else {
                    failed++;
                    const msg = `No coordinates returned for ${venue.name}`;
                    console.log(`[Geocode] Failed: ${msg}`);
                    if (debug) errors.push(msg);
                }
            } catch (venueError) {
                failed++;
                const msg = `Error geocoding ${venue.name}: ${venueError.message}`;
                console.error(`[Geocode] ${msg}`);
                if (debug) errors.push(msg);
            }

            // Rate limit - 1.5 seconds per request
            if (geocoded + failed < venues.rows.length) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }

        const result = {
            success: true,
            processed: venues.rows.length,
            geocoded,
            failed
        };

        if (debug) result.errors = errors;

        res.json(result);
    } catch (error) {
        console.error('Geocoding error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Geocode venues background task state
let geocodingInProgress = false;
let geocodingStats = { processed: 0, geocoded: 0, failed: 0, remaining: 0, failedVenues: [] };

const geocodeAllVenues = async (req, res) => {
    try {
        const { limit = 200, background = true } = req.body;

        if (geocodingInProgress) {
            return res.json({
                success: true,
                message: 'Geocoding already in progress',
                stats: geocodingStats
            });
        }

        const countResult = await pool.query(`
            SELECT COUNT(*) as count
            FROM venues
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND (address IS NOT NULL OR city IS NOT NULL)
        `);

        const totalToGeocode = parseInt(countResult.rows[0].count);

        if (totalToGeocode === 0) {
            return res.json({
                success: true,
                message: 'All venues already have coordinates',
                stats: { processed: 0, geocoded: 0, failed: 0, remaining: 0 }
            });
        }

        if (background) {
            geocodingInProgress = true;
            geocodingStats = { processed: 0, geocoded: 0, failed: 0, remaining: totalToGeocode, failedVenues: [] };

            // Start background geocoding
            (async () => {
                try {
                    const venues = await pool.query(`
                        SELECT id, name, address, city, country
                        FROM venues
                        WHERE (latitude IS NULL OR longitude IS NULL)
                        AND (address IS NOT NULL OR city IS NOT NULL)
                        ORDER BY name
                        LIMIT $1
                    `, [limit]);

                    for (const venue of venues.rows) {
                        try {
                            const coords = await geocodeAddress(venue.address, venue.city, venue.country);

                            if (coords) {
                                await pool.query(`
                                    UPDATE venues 
                                    SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP
                                    WHERE id = $3
                                `, [coords.latitude, coords.longitude, venue.id]);
                                geocodingStats.geocoded++;
                            } else {
                                geocodingStats.failed++;
                                geocodingStats.failedVenues.push(venue.name);
                            }
                        } catch (venueError) {
                            geocodingStats.failed++;
                            geocodingStats.failedVenues.push(venue.name);
                        }

                        geocodingStats.processed++;
                        geocodingStats.remaining = totalToGeocode - geocodingStats.processed;

                        if (geocodingStats.processed < venues.rows.length) {
                            await new Promise(resolve => setTimeout(resolve, 1500));
                        }
                    }

                    // Sync venue coordinates to events
                    await pool.query(`
                        UPDATE events e
                        SET latitude = v.latitude,
                            longitude = v.longitude,
                            updated_at = CURRENT_TIMESTAMP
                        FROM venues v
                        WHERE e.venue_name = v.name
                        AND e.venue_city = v.city
                        AND v.latitude IS NOT NULL
                        AND v.longitude IS NOT NULL
                        AND (e.latitude IS NULL OR e.longitude IS NULL)
                    `);
                } catch (error) {
                    console.error('[Geocode] Background error:', error);
                } finally {
                    geocodingInProgress = false;
                }
            })();

            return res.json({
                success: true,
                message: `Geocoding started in background for ${Math.min(limit, totalToGeocode)} venues`,
                totalToGeocode,
                limit
            });
        }

        res.json({ success: false, message: 'Use background mode for venue geocoding' });
    } catch (error) {
        console.error('Venue geocoding error:', error);
        res.status(500).json({ error: error.message });
    }
};

const getGeocodingStatus = (req, res) => {
    res.json({
        inProgress: geocodingInProgress,
        stats: geocodingStats
    });
};

const testGeocode = async (req, res) => {
    try {
        const { address, city, country } = req.body;
        console.log('[Test Geocode] Input:', { address, city, country });

        const coords = await geocodeAddress(address, city, country);
        console.log('[Test Geocode] Result:', coords);

        res.json({
            success: true,
            input: { address, city, country },
            coordinates: coords
        });
    } catch (error) {
        console.error('[Test Geocode] Error:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
};

const geocodeVenue = async (req, res) => {
    try {
        const venue = await pool.query('SELECT * FROM venues WHERE id = $1', [req.params.id]);
        if (venue.rows.length === 0) {
            return res.status(404).json({ error: 'Venue not found' });
        }

        const v = venue.rows[0];
        const coords = await geocodeAddress(v.address, v.city, v.country);

        if (coords) {
            const result = await pool.query(`
                UPDATE venues SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $3 RETURNING *
            `, [coords.latitude, coords.longitude, req.params.id]);

            res.json({ success: true, venue: result.rows[0] });
        } else {
            res.status(400).json({ error: 'Could not geocode address' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// MATCHING AND SYNCING
// ============================================

const matchVenues = async (req, res) => {
    try {
        const { dryRun = false, minConfidence = 0.7 } = req.body;
        const result = await matchAndLinkVenues({ dryRun, minConfidence });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Venue matching error:', error);
        res.status(500).json({ error: error.message });
    }
};

const syncFromEvents = async (req, res) => {
    try {
        // Get all unique venue combinations from events that don't exist in venues table
        const missingVenues = await pool.query(`
            SELECT DISTINCT 
                e.venue_name,
                e.venue_address,
                e.venue_city,
                e.venue_country,
                COUNT(*) as event_count
            FROM events e
            WHERE e.venue_name IS NOT NULL 
            AND e.venue_name != ''
            AND NOT EXISTS (
                SELECT 1 FROM venues v 
                WHERE LOWER(v.name) = LOWER(e.venue_name) 
                AND LOWER(v.city) = LOWER(e.venue_city)
            )
            GROUP BY e.venue_name, e.venue_address, e.venue_city, e.venue_country
            ORDER BY COUNT(*) DESC
        `);

        let created = 0;
        let errors = 0;
        const results = [];

        for (const venue of missingVenues.rows) {
            try {
                const venueId = uuidv4();

                // Try to geocode if no coordinates
                let latitude = null;
                let longitude = null;

                if (venue.venue_address && venue.venue_city) {
                    const coords = await geocodeAddress(venue.venue_address, venue.venue_city, venue.venue_country);
                    if (coords) {
                        latitude = coords.latitude;
                        longitude = coords.longitude;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                await pool.query(`
                    INSERT INTO venues (id, name, address, city, country, latitude, longitude, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [
                    venueId,
                    venue.venue_name,
                    venue.venue_address,
                    venue.venue_city,
                    venue.venue_country,
                    latitude,
                    longitude
                ]);

                created++;
                results.push({
                    name: venue.venue_name,
                    city: venue.venue_city,
                    event_count: venue.event_count,
                    geocoded: latitude && longitude ? true : false
                });
            } catch (error) {
                console.error(`Error creating venue ${venue.venue_name}:`, error);
                errors++;
            }
        }

        res.json({
            success: true,
            found: missingVenues.rows.length,
            created,
            errors,
            results: results.slice(0, 20)
        });
    } catch (error) {
        console.error('Error syncing venues:', error);
        res.status(500).json({ error: error.message });
    }
};

const linkEvents = async (req, res) => {
    try {
        // First, ensure all venues exist
        await pool.query(`
            INSERT INTO venues (id, name, address, city, country, created_at, updated_at)
            SELECT 
                gen_random_uuid(),
                e.venue_name,
                e.venue_address,
                e.venue_city,
                e.venue_country,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            FROM (
                SELECT DISTINCT ON (LOWER(venue_name), LOWER(venue_city))
                    venue_name,
                    venue_address,
                    venue_city,
                    venue_country
                FROM events
                WHERE venue_name IS NOT NULL 
                AND venue_name != ''
            ) e
            WHERE NOT EXISTS (
                SELECT 1 FROM venues v 
                WHERE LOWER(v.name) = LOWER(e.venue_name) 
                AND LOWER(v.city) = LOWER(e.venue_city)
            )
        `);

        // Link events to venues by matching name and city
        const linkResult = await pool.query(`
            UPDATE events e
            SET venue_id = v.id
            FROM venues v
            WHERE e.venue_id IS NULL
            AND LOWER(e.venue_name) = LOWER(v.name)
            AND LOWER(e.venue_city) = LOWER(v.city)
            RETURNING e.id
        `);

        res.json({
            success: true,
            linked: linkResult.rowCount,
            message: `Linked ${linkResult.rowCount} events to venues`
        });
    } catch (error) {
        console.error('Error linking events to venues:', error);
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// CRUD OPERATIONS
// ============================================

const listVenues = async (req, res) => {
    try {
        const { search, city, limit = 100, offset = 0, sort = 'name', order = 'asc', source } = req.query;

        let venueFilter = '';
        let eventFilter = '';
        const queryParams = [];
        let pIdx = 1;

        if (source) {
            // Real Venues Filter
            venueFilter = ` AND EXISTS (
                SELECT 1 FROM venue_scraped_links vsl 
                JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id 
                WHERE vsl.venue_id = v.id AND sv.source_code = $${pIdx}
            )`;

            // Ghost Venues Filter
            // Note: events table has source_code directly
            eventFilter = ` AND (
                source_code = $${pIdx} 
                OR EXISTS (
                    SELECT 1 FROM event_scraped_links esl
                    JOIN scraped_events se ON se.id = esl.scraped_event_id
                    WHERE esl.event_id = events.id AND se.source_code = $${pIdx}
                )
            )`;

            queryParams.push(source);
            pIdx++;
        }

        let query = `
            SELECT DISTINCT ON (LOWER(name), LOWER(city))
                name, address, city, country, latitude, longitude, id,
                (SELECT COUNT(*) FROM events e WHERE LOWER(e.venue_name) = LOWER(combined.name) AND LOWER(e.venue_city) = LOWER(combined.city)) as event_count,
                (
                    SELECT json_agg(json_build_object(
                        'source_code', sv.source_code, 
                        'id', sv.id,
                        'name', sv.name,
                        'address', sv.address,
                        'city', sv.city,
                        'content_url', sv.content_url
                    ))
                    FROM venue_scraped_links vsl
                    JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
                    WHERE vsl.venue_id = combined.id
                ) as source_references
            FROM (
                SELECT v.id, v.name, v.address, v.city, v.country, v.latitude, v.longitude, 1 as priority
                FROM venues v
                WHERE 1=1 ${venueFilter}
                UNION ALL
                SELECT NULL as id, venue_name as name, venue_address as address, venue_city as city, venue_country as country, 
                       NULL as latitude, NULL as longitude, 2 as priority
                FROM events
                WHERE venue_name IS NOT NULL AND venue_name != '' AND venue_id IS NULL ${eventFilter}
            ) combined
            WHERE name IS NOT NULL AND city IS NOT NULL`;

        // We already added 'source' to queryParams if present.
        // Now add Search and City.

        if (search) {
            query += ` AND (combined.name ILIKE $${pIdx} OR combined.address ILIKE $${pIdx})`;
            queryParams.push(`%${search}%`);
            pIdx++;
        }

        if (city) {
            query += ` AND combined.city ILIKE $${pIdx}`;
            queryParams.push(`%${city}%`);
            pIdx++;
        }

        // --- Count Query matches logic ---
        // Using same filtering inside subquery
        let countQuery = `
            SELECT COUNT(*) FROM (
                SELECT DISTINCT LOWER(name), LOWER(city)
                FROM (
                    SELECT v.name, v.city, v.address FROM venues v WHERE 1=1 ${venueFilter}
                    UNION ALL
                    SELECT venue_name as name, venue_city as city, venue_address as address FROM events WHERE venue_name IS NOT NULL AND venue_name != '' AND venue_id IS NULL ${eventFilter}
                ) combined
                WHERE name IS NOT NULL AND city IS NOT NULL
        `;

        // Re-append outer filters to count
        // We reuse queryParams so we can reconstruct the query string with matching indices
        let outerCountFilter = '';
        let currentIdx = 1;
        if (source) currentIdx++;
        if (search) {
            outerCountFilter += ` AND (combined.name ILIKE $${currentIdx} OR combined.address ILIKE $${currentIdx})`;
            currentIdx++;
        }
        if (city) {
            outerCountFilter += ` AND combined.city ILIKE $${currentIdx}`;
            currentIdx++;
        }

        countQuery += outerCountFilter + `) subq`;

        const countParams = [...queryParams]; // Copy params before adding limit/offset
        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        const validSorts = ['name', 'city', 'country', 'event_count'];
        const sortCol = validSorts.includes(sort) ? sort : 'name';
        const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

        query += ` ORDER BY LOWER(name), LOWER(city), priority ASC, ${sortCol} ${sortOrder} LIMIT $${pIdx++} OFFSET $${pIdx}`;
        queryParams.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, queryParams);

        res.json({
            data: result.rows,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            source: 'combined'
        });
    } catch (error) {
        console.error('Error fetching venues:', error);
        res.status(500).json({ error: error.message });
    }
};

const getVenue = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM venues WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Venue not found' });
        }

        const venue = result.rows[0];

        // Get events at this venue
        const eventsResult = await pool.query(`
            SELECT id, title, date, artists 
            FROM events 
            WHERE venue_id = $1 OR venue_name = $2
            ORDER BY date DESC
            LIMIT 50
        `, [req.params.id, venue.name]);
        venue.events = eventsResult.rows;

        // Source references
        // Try to get source references from venue_scraped_links (new schema)
        // or fall back to unified_venues (old schema)
        try {
            const sourceRefsNew = await pool.query(`
                SELECT sv.id, sv.source_code, sv.source_venue_id, sv.name,
                       sv.address, sv.city, sv.country, sv.content_url,
                       sv.venue_type, sv.phone, sv.email,
                       sv.latitude, sv.longitude, vsl.match_confidence as confidence
                FROM venue_scraped_links vsl
                JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
                WHERE vsl.venue_id = $1
            `, [req.params.id]);

            if (sourceRefsNew.rows.length > 0) {
                venue.source_references = sourceRefsNew.rows;
            } else {
                // Check for fallback to unified_venues (if ID exists there)
                // (Note: In strict refactor we might not need this if we migrated)
                const unifiedCheck = await pool.query('SELECT * FROM unified_venues WHERE id = $1', [req.params.id]);
                if (unifiedCheck.rows.length > 0) {
                    const sourceRefsOld = await pool.query(`
                        SELECT sv.id, sv.source_code, sv.source_venue_id, sv.name,
                            sv.address, sv.city, sv.country, sv.content_url,
                            sv.venue_type, sv.phone, sv.email,
                            sv.latitude, sv.longitude, vsl.match_confidence as confidence
                        FROM venue_source_links vsl
                        JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
                        WHERE vsl.unified_venue_id = $1
                    `, [req.params.id]);
                    venue.source_references = sourceRefsOld.rows;
                }
            }
        } catch (e) {
            console.log('Error fetching source references', e.message);
        }

        res.json(venue);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getMissingVenues = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT e.venue_id, e.venue_name, e.venue_city, e.venue_country
            FROM events e
            LEFT JOIN venues v ON e.venue_id = v.id
            WHERE e.venue_id IS NOT NULL 
            AND v.id IS NULL
            ORDER BY e.venue_name
        `);
        res.json({ data: result.rows, total: result.rows.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

async function createVenue(req, res) {
    try {
        let { name, address, city, country, blurb, content_url, latitude, longitude, capacity, venue_type, email, phone } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        if ((!latitude || !longitude) && address) {
            const coords = await geocodeAddress(address, city, country);
            if (coords) {
                latitude = coords.latitude;
                longitude = coords.longitude;
            }
        }

        // 1. Save as Original Source
        const { scrapedId } = await saveOriginalEntry('venue', {
            name, address, city, country, content_url, latitude, longitude, capacity, venue_type, email, phone
        });

        // 2. Link to Unified/Main (Create new Venue)
        const venueId = uuidv4();
        await pool.query(`
            INSERT INTO venues (id, name, address, city, country, latitude, longitude, content_url, capacity, venue_type, email, phone, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [venueId, name, address, city, country, latitude, longitude, content_url, capacity, venue_type, email, phone]);

        // Link the scraping source
        await pool.query(`
            INSERT INTO venue_scraped_links (venue_id, scraped_venue_id, match_confidence, is_primary)
            VALUES ($1, $2, 1.0, true)
        `, [venueId, scrapedId]);

        // 3. Link existing events that match this venue (Name + City)
        // using trimmed comparison to catch whitespace mismatches causing duplication
        if (name && city) {
            await pool.query(`
                UPDATE events
                SET venue_id = $1, updated_at = CURRENT_TIMESTAMP
                WHERE venue_id IS NULL
                AND LOWER(TRIM(venue_name)) = LOWER(TRIM($2))
                AND LOWER(TRIM(venue_city)) = LOWER(TRIM($3))
            `, [venueId, name, city]);
        }

        const result = await pool.query('SELECT * FROM venues WHERE id = $1', [venueId]);
        res.json({ success: true, venue: result.rows[0] });

    } catch (error) {
        console.error('Error creating venue:', error);
        res.status(500).json({ error: error.message });
    }
};

const updateVenue = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Fetch current field_sources
        const currentRes = await pool.query('SELECT field_sources FROM venues WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) {
            return res.status(404).json({ error: 'Venue not found' });
        }
        const fieldSources = currentRes.rows[0].field_sources || {};

        const allowedFields = ['name', 'address', 'city', 'country', 'content_url', 'latitude', 'longitude', 'venue_type', 'email', 'phone', 'capacity'];
        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fieldSources[key] = 'og';
                setClauses.push(`${key} = $${paramIndex++}`);
                values.push(value);
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        setClauses.push(`field_sources = $${paramIndex++}::jsonb`);
        values.push(JSON.stringify(fieldSources));

        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        const result = await pool.query(`
            UPDATE venues SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *
        `, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Venue not found' });
        }

        res.json({ success: true, venue: result.rows[0] });

    } catch (error) {
        console.error('Error updating venue:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteVenue = async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM venues WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Venue not found' });
        }
        res.json({ success: true, deleted: req.params.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deleteVenues = async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM venues RETURNING id');
        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const bulkDeleteVenues = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids must be a non-empty array' });
        }

        const result = await pool.query(
            'DELETE FROM venues WHERE id = ANY($1::text[]) RETURNING id',
            [ids]
        );

        res.json({ success: true, deleted: result.rows.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const enrichVenue = async (req, res) => {
    // Placeholder for enrichment logic if needed
    res.json({ success: true, message: 'Enrichment not implemented' });
};

module.exports = {
    listVenues,
    getVenue,
    getMissingVenues,
    createVenue,
    updateVenue,
    deleteVenue,
    deleteVenues,
    bulkDeleteVenues,
    geocodeVenues,
    geocodeAllVenues,
    getGeocodingStatus,
    testGeocode,
    geocodeVenue,
    matchVenues,
    syncFromEvents,
    linkEvents,
    enrichVenue
};
