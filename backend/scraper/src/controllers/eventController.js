const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { geocodeAddress } = require('../services/geocoder');
const { saveOriginalEntry, linkToUnified } = require('../services/unifiedService');
const { EVENT_STATES, canTransition, validateEventForPublish, transitionEvent } = require('../models/eventStateMachine');

// -----------------------------------------------------------------------------
// READ OPERATIONS
// -----------------------------------------------------------------------------


async function autoRejectPastEvents() {
    try {
        const result = await pool.query(`
            UPDATE events 
            SET status = 'REJECTED' 
            WHERE status IN ('MANUAL_DRAFT', 'SCRAPED_DRAFT', 'APPROVED_PENDING_DETAILS')
              AND date < CURRENT_DATE 
              AND status != 'REJECTED'
        `);
        if (result.rowCount > 0) {
            console.log(`Auto-rejected ${result.rowCount} past events.`);
        }
    } catch (err) {
        console.error('Failed to auto-reject past events:', err);
    }
}

async function listEvents(req, res) {
    try {
        // Trigger auto-rejection of past drafts lazily
        await autoRejectPastEvents();

        const { city, search, limit = 100, offset = 0, from, to, status, showPast, timeFilter = 'upcoming', source, createdAfter, updatedAfter } = req.query;

        let query = `
            SELECT e.*, 
                   v.latitude as venue_latitude,
                   v.longitude as venue_longitude,
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'id', se.id,
                           'source_code', se.source_code,
                           'title', se.title,
                           'date', se.date,
                           'start_time', se.start_time,
                           'end_time', se.end_time,
                           'venue_name', se.venue_name,
                           'venue_city', se.venue_city,
                           'description', se.description,
                           'content_url', se.content_url,
                           'flyer_front', se.flyer_front,
                           'event_type', se.event_type,
                           'venue_address', se.venue_address,
                           'venue_country', se.venue_country,
                           'price_info', se.price_info,
                           'artists', se.artists_json,
                           'status', se.status,
                           'confidence', esl.match_confidence
                       ))
                       FROM event_scraped_links esl
                       JOIN scraped_events se ON se.id = esl.scraped_event_id
                       WHERE esl.event_id = e.id),
                       '[]'
                   ) as source_references,
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'id', o.id,
                           'name', o.name
                       ))
                       FROM event_organizers eo
                       JOIN organizers o ON o.id = eo.organizer_id
                       WHERE eo.event_id = e.id),
                       '[]'
                   ) as organizers_list,
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'id', a.id,
                           'name', a.name,
                           'role', ea.role,
                           'billing_order', ea.billing_order
                       ) ORDER BY ea.billing_order ASC)
                       FROM event_artists ea
                       JOIN artists a ON a.id = ea.artist_id
                       WHERE ea.event_id = e.id),
                       '[]'
                   ) as artists_list
             FROM events e
            LEFT JOIN venues v ON e.venue_id = v.id
            WHERE 1=1`;
        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND (
                e.title ILIKE $${paramIndex} 
                OR e.venue_name ILIKE $${paramIndex} 
                OR e.artists ILIKE $${paramIndex}
            )`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (city) {
            query += ` AND LOWER(e.venue_city) = LOWER($${paramIndex})`;
            params.push(city);
            paramIndex++;
        }

        if (status && status !== 'all') {
            query += ` AND e.publish_status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (source) {
            query += ` AND (
                 e.source_code = $${paramIndex}
                 OR EXISTS (
                     SELECT 1 FROM event_scraped_links esl 
                     JOIN scraped_events se ON se.id = esl.scraped_event_id
                     WHERE esl.event_id = e.id AND se.source_code = $${paramIndex}
                 )
             )`;
            params.push(source);
            paramIndex++;
        }

        if (req.query.published !== undefined) {
            query += ` AND e.is_published = $${paramIndex}`;
            params.push(req.query.published === 'true');
            paramIndex++;
        }

        if (from) {
            query += ` AND e.date >= $${paramIndex}`;
            params.push(from);
            paramIndex++;
        }

        if (to) {
            query += ` AND e.date <= $${paramIndex}`;
            params.push(to);
            paramIndex++;
        }

        if (createdAfter) {
            query += ` AND e.created_at >= $${paramIndex}`;
            params.push(createdAfter);
            paramIndex++;
        }

        if (updatedAfter) {
            query += ` AND e.updated_at >= $${paramIndex}`;
            params.push(updatedAfter);
            paramIndex++;
        }

        // Time Filter Logic (Replacing showPast)
        // Default (upcoming): >= Today
        // Past: < Today
        // All: No filter

        // Use provided timeFilter OR fallback to legacy showPast logic if timeFilter defaults but showPast is explicitly 'true'
        let effectiveFilter = timeFilter;
        if (showPast === 'true' && effectiveFilter === 'upcoming') {
            effectiveFilter = 'all'; // Legacy support: showPast=true -> all/past included
        }

        if (effectiveFilter === 'upcoming') {
            query += ` AND e.date >= CURRENT_DATE`;
        } else if (effectiveFilter === 'past') {
            query += ` AND e.date < CURRENT_DATE`;
        }
        // else 'all' -> no date filter

        // Sorting
        if (effectiveFilter === 'past') {
            // Past: Newest (closest to today) first? or Oldest first?
            // Usually "History" shows recent past first.
            query += ` ORDER BY e.date DESC, e.start_time DESC, e.title ASC`;
        } else {
            // Upcoming or All: Soonest first (Today -> Later)
            query += ` ORDER BY e.date ASC, e.start_time ASC, e.title ASC`;
        }

        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM events e WHERE 1=1';
        const countParams = [];
        let countParamIndex = 1;

        if (search) {
            countQuery += ` AND (e.title ILIKE $${countParamIndex} OR e.venue_name ILIKE $${countParamIndex} OR e.artists ILIKE $${countParamIndex})`;
            countParams.push(`%${search}%`);
            countParamIndex++;
        }
        if (city) {
            countQuery += ` AND LOWER(e.venue_city) = LOWER($${countParamIndex})`;
            countParams.push(city);
            countParamIndex++;
        }
        if (status && status !== 'all') {
            countQuery += ` AND e.publish_status = $${countParamIndex}`;
            countParams.push(status);
            countParamIndex++;
        }

        if (source) {
            countQuery += ` AND (
                 e.source_code = $${countParamIndex}
                 OR EXISTS (
                     SELECT 1 FROM event_scraped_links esl 
                     JOIN scraped_events se ON se.id = esl.scraped_event_id
                     WHERE esl.event_id = e.id AND se.source_code = $${countParamIndex}
                 )
             )`;
            countParams.push(source);
            countParamIndex++;
        }

        if (req.query.published !== undefined) {
            countQuery += ` AND e.is_published = $${countParamIndex}`;
            countParams.push(req.query.published === 'true');
            countParamIndex++;
        }

        if (from) {
            countQuery += ` AND e.date >= $${countParamIndex}`;
            countParams.push(from);
            countParamIndex++;
        }
        if (to) {
            countQuery += ` AND e.date <= $${countParamIndex}`;
            countParams.push(to);
            countParamIndex++;
        }

        if (createdAfter) {
            countQuery += ` AND e.created_at >= $${countParamIndex}`;
            countParams.push(createdAfter);
            countParamIndex++;
        }

        if (updatedAfter) {
            countQuery += ` AND e.updated_at >= $${countParamIndex}`;
            countParams.push(updatedAfter);
            countParamIndex++;
        }

        // Apply same time filter logic to count
        if (effectiveFilter === 'upcoming') {
            countQuery += ` AND e.date >= CURRENT_DATE`;
        } else if (effectiveFilter === 'past') {
            countQuery += ` AND e.date < CURRENT_DATE`;
        }

        const countResult = await pool.query(countQuery, countParams);

        res.json({
            data: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        if (error.code === '42P01') {
            return res.json({ data: [], total: 0, limit: parseInt(req.query.limit || 100), offset: 0 });
        }
        console.error('Database error in listEvents:', error);
        res.status(500).json({ error: error.message });
    }
}

async function getEvent(req, res) {
    try {
        const eventId = req.params.id;
        // Include artists_list in single event fetch
        const result = await pool.query(`
            SELECT e.*,
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'id', a.id,
                           'name', a.name,
                           'role', ea.role,
                           'billing_order', ea.billing_order
                       ) ORDER BY ea.billing_order ASC)
                       FROM event_artists ea
                       JOIN artists a ON a.id = ea.artist_id
                       WHERE ea.event_id = e.id),
                       '[]'
                   ) as artists_list,
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'id', o.id,
                           'name', o.name
                       ))
                       FROM event_organizers eo
                       JOIN organizers o ON o.id = eo.organizer_id
                       WHERE eo.event_id = e.id),
                       '[]'
                   ) as organizers_list
            FROM events e
            WHERE e.id = $1
        `, [eventId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const event = result.rows[0];
        let foundSources = false;

        // Try getting new schema source links
        try {
            const sourceRefs = await pool.query(`
                SELECT se.id, se.source_code, se.source_event_id, se.title, se.date, 
                       se.start_time, se.end_time, se.content_url, se.flyer_front, 
                       se.venue_name, se.venue_address, se.venue_city, se.venue_country, 
                       se.description, se.price_info, se.event_type, se.artists_json as artists,
                       se.venue_latitude as latitude, se.venue_longitude as longitude, se.updated_at,
                       esl.match_confidence as confidence, esl.last_synced_at
                FROM event_scraped_links esl
                JOIN scraped_events se ON se.id = esl.scraped_event_id
                WHERE esl.event_id = $1
            `, [eventId]);

            if (sourceRefs.rows.length > 0) {
                event.source_references = sourceRefs.rows;
                foundSources = true;
            }
        } catch (e) {
            console.error(`[Single Event] Error fetching source refs from new schema:`, e);
        }

        // Fallback to old schema if needed
        if (!foundSources) {
            try {
                const sourceRefsOld = await pool.query(`
                    SELECT se.id, se.source_code, se.source_event_id, se.title, se.date, 
                           se.start_time, se.end_time, se.content_url, se.flyer_front, 
                           se.venue_name, se.venue_address, se.venue_city, se.venue_country, 
                           se.description, se.price_info,
                           se.venue_latitude as latitude, se.venue_longitude as longitude, se.updated_at,
                           esl.match_confidence as confidence, esl.last_synced_at
                    FROM unified_events ue
                    JOIN event_source_links esl ON esl.unified_event_id = ue.id
                    JOIN scraped_events se ON se.id = esl.scraped_event_id
                    WHERE ue.id = $1
                 `, [eventId]);

                if (sourceRefsOld.rows.length > 0) {
                    event.source_references = sourceRefsOld.rows;
                } else {
                    event.source_references = [];
                }
            } catch (e2) {
                event.source_references = [];
            }
        }

        res.json(event);
    } catch (error) {
        console.error('Database error in getEvent:', error);
        res.status(500).json({ error: error.message });
    }
}

async function getRecentUpdates(req, res) {
    try {
        const { limit = 50 } = req.query;
        const result = await pool.query(`
            SELECT DISTINCT e.*, 
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'id', se.id,
                           'source_code', se.source_code,
                           'title', se.title,
                           'confidence', esl.match_confidence,
                           'updated_at', se.updated_at
                       ))
                       FROM event_scraped_links esl
                       JOIN scraped_events se ON se.id = esl.scraped_event_id
                       WHERE esl.event_id = e.id),
                       '[]'
                   ) as source_references
            FROM events e
            JOIN event_scraped_links esl ON esl.event_id = e.id
            JOIN scraped_events se ON se.id = esl.scraped_event_id
            WHERE se.updated_at > se.created_at + INTERVAL '1 minute'
              AND se.updated_at > NOW() - INTERVAL '7 days'
              AND e.date >= CURRENT_DATE
            ORDER BY se.updated_at DESC
            LIMIT $1
        `, [parseInt(limit)]);

        res.json({
            data: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        // Fallback or empty
        res.json({ data: [], total: 0 });
    }
}

async function getMapEvents(req, res) {
    try {
        const { city, status, showPast } = req.query;

        let query = `
            SELECT e.id, e.title, e.date, e.start_time, e.end_time,
                   e.venue_name, e.venue_city, e.venue_country,
                   COALESCE(v.latitude, e.latitude) as venue_latitude,
                   COALESCE(v.longitude, e.longitude) as venue_longitude,
                   e.publish_status, e.flyer_front,
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'source_code', se.source_code
                       ))
                       FROM event_scraped_links esl
                       JOIN scraped_events se ON se.id = esl.scraped_event_id
                       WHERE esl.event_id = e.id),
                       '[]'
                   ) as source_references
            FROM events e
            LEFT JOIN venues v ON LOWER(TRIM(v.name)) = LOWER(TRIM(e.venue_name))
                               AND LOWER(TRIM(v.city)) = LOWER(TRIM(e.venue_city))
            WHERE 1=1`;
        const params = [];
        let paramIndex = 1;

        if (city) {
            query += ` AND LOWER(e.venue_city) = LOWER($${paramIndex})`;
            params.push(city);
            paramIndex++;
        }
        if (status && status !== 'all') {
            query += ` AND e.publish_status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        if (showPast !== 'true') {
            query += ` AND e.date >= CURRENT_DATE - INTERVAL '1 day'`;
        }

        query += ` ORDER BY e.date ASC LIMIT 2000`;

        const result = await pool.query(query, params);

        res.json({
            data: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching map events:', error);
        res.json({ data: [], total: 0 });
    }
}


// -----------------------------------------------------------------------------
// WRITE OPERATIONS
// -----------------------------------------------------------------------------

// Helper to sync artists
async function syncEventArtists(client, eventId, artistsList) {
    if (!artistsList || !Array.isArray(artistsList)) return;

    // 1. Clear existing relations
    await client.query('DELETE FROM event_artists WHERE event_id = $1', [eventId]);

    // 2. Insert new relations
    let order = 0;
    const addedIds = new Set();
    const artistNames = [];

    for (const artist of artistsList) {
        let artistId = artist.id;
        const artistName = artist.name;

        if (!artistName) continue;
        artistNames.push(artistName);

        // Handle temp/source IDs (e.g. 'source-123' or 'temp-0.456')
        // We assume valid IDs are Integers or UUIDs. If it's a string starting with temp/source, resolve it.
        // Or if it's just not a standard ID format.
        if (typeof artistId === 'string' && (artistId.startsWith('temp-') || artistId.startsWith('source-') || artistId.startsWith('manual_'))) {
            // Try to find by name first
            const existing = await client.query('SELECT id FROM artists WHERE LOWER(name) = LOWER($1)', [artistName]);
            if (existing.rows.length > 0) {
                artistId = existing.rows[0].id;
            } else {
                // Create new artist
                const newArtist = await client.query(
                    'INSERT INTO artists (name, created_at) VALUES ($1, NOW()) RETURNING id',
                    [artistName]
                );
                artistId = newArtist.rows[0].id;
            }
        }

        if (addedIds.has(artistId)) continue;
        addedIds.add(artistId);

        try {
            await client.query(
                `INSERT INTO event_artists (event_id, artist_id, role, billing_order)
                 VALUES ($1, $2, $3, $4)`,
                [eventId, artistId, 'performer', order++]
            );
        } catch (e) {
            console.error(`Failed to link artist ${artistId} to event ${eventId}:`, e.message);
        }
    }

    // Update denormalized 'artists' column on the event itself for backward compatibility/display
    if (artistNames.length > 0) {
        const artistsStr = artistNames.join(', ');
        await client.query('UPDATE events SET artists = $1 WHERE id = $2', [artistsStr, eventId]);
    }
}

async function createEvent(req, res) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { title, date, start_time, venue_id, venue_name, venue_city, venue_country, venue_address, artists, artists_list, description, content_url, flyer_front, is_published, event_type } = req.body;

        if (!title) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Title is required' });
        }

        const eventData = {
            title, date, start_time, venue_name, venue_address, venue_city, venue_country,
            description, content_url, flyer_front, price_info: null, id: `manual_${Date.now()}`
        };
        const { scrapedId } = await saveOriginalEntry('event', eventData);

        const unifiedId = await linkToUnified('event', scrapedId, { ...eventData, source_code: 'og' });

        const finalStartTime = (date && start_time && /^\d{1,2}:\d{2}/.test(start_time) ? `${date} ${start_time}` : start_time) || null;

        const result = await client.query(`
            INSERT INTO events (
                id, title, date, start_time, venue_id, venue_name, venue_address, 
                venue_city, venue_country, artists, description, content_url, 
                flyer_front, is_published, event_type, created_at, source_code, field_sources, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, $16, $17, $18)
            RETURNING *
        `, [
            unifiedId, title, date || null, finalStartTime, venue_id || null,
            venue_name || null, venue_address || null, venue_city || null, venue_country || null,
            artists || null, description || null, content_url || null, flyer_front || null,
            is_published || false, event_type || 'event',
            'manual', // source_code
            JSON.stringify({}), // default field_sources
            EVENT_STATES.MANUAL_DRAFT // default status
        ]);

        const id = unifiedId; // consistent naming for syncEventArtists

        if (artists_list && Array.isArray(artists_list)) {
            await syncEventArtists(client, id, artists_list);
        }

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create event error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}

async function updateEvent(req, res) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        const updates = req.body;

        // Fetch current field_sources to update them
        const currentRes = await client.query('SELECT * FROM events WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Event not found' });
        }
        const currentEvent = currentRes.rows[0];
        const fieldSources = currentEvent.field_sources || {};

        const allowedFields = [
            'title', 'date', 'start_time', 'end_time', 'content_url',
            'flyer_front', 'description', 'venue_id', 'venue_name',
            'venue_address', 'venue_city', 'venue_country', 'artists',
            'is_published', 'latitude', 'longitude', 'event_type', 'publish_status', 'status'
        ];

        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        // State Machine Logic & Status Handling
        if (updates.status && updates.status !== currentEvent.status) {
            // 1. Strict transition check
            if (!canTransition(currentEvent.status, updates.status)) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Invalid state transition from ${currentEvent.status} to ${updates.status}`
                });
            }

            // 2. Validate if moving to PUBLISH states
            if (updates.status === EVENT_STATES.READY_TO_PUBLISH || updates.status === EVENT_STATES.PUBLISHED) {
                const eventToValidate = { ...currentEvent, ...updates };
                const validation = validateEventForPublish(eventToValidate);
                if (!validation.isValid) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        error: `Cannot change status to ${updates.status}. Missing required fields: ${validation.missingFields.join(', ')}`
                    });
                }
            }

            // 3. Perform Transition Logging
            await transitionEvent(client, id, currentEvent.status, updates.status, req.user?.id || 'admin'); // TODO: get actor

            // Remove status from generic updates so it doesn't get updated twice or override
            delete updates.status;
        }

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key) && key !== 'status') { // Skip status if somehow still there
                fieldSources[key] = 'og';

                if ((key === 'start_time' || key === 'end_time') && value && typeof value === 'string') {
                    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
                        const dateValue = updates.date || currentEvent.date || null; // Use updated date or current
                        // Date handling logic ... existing logic slightly complex, simplified for snippet
                        // Actually, reusing existing logic structure:
                        if (dateValue) {
                            setClauses.push(`${key} = $${paramIndex++}:: TIMESTAMP`);
                            values.push(`${dateValue} ${value} `);
                        } else {
                            // If no date, try to use existing? Logic in original was: 
                            // updates.date || null. If null, it used (SELECT date::date ...).
                            // Let's stick to original logic flow, just wrapped in loop.
                            setClauses.push(`${key} = (SELECT date:: date || ' ' || $${paramIndex++}):: TIMESTAMP`);
                            values.push(value);
                        }
                    } else {
                        setClauses.push(`${key} = $${paramIndex++}:: TIMESTAMP`);
                        values.push(value);
                    }
                } else {
                    setClauses.push(`${key} = $${paramIndex++} `);
                    values.push(value);
                }
            }
        }



        // Handle artists_list explicitly
        if (updates.artists_list && Array.isArray(updates.artists_list)) {
            await syncEventArtists(client, id, updates.artists_list);
        }

        if (setClauses.length > 0) {
            // Add field_sources to update
            setClauses.push(`field_sources = $${paramIndex++}:: jsonb`);
            values.push(JSON.stringify(fieldSources));

            setClauses.push('updated_at = CURRENT_TIMESTAMP');
            values.push(id);

            const query = `
                UPDATE events 
                SET ${setClauses.join(', ')}
                WHERE id = $${paramIndex}
    RETURNING *
        `;

            const result = await client.query(query, values);

            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Event not found' });
            }
        } else {
            // If only artists_list was updated, we still need to commit and maybe fetch the event
        }

        // Update last_synced_at for linked sources
        await client.query(`
            UPDATE event_scraped_links
            SET last_synced_at = CURRENT_TIMESTAMP
            WHERE event_id = $1
        `, [id]);

        await client.query('COMMIT');

        // Fetch final result to return complete object
        const finalResult = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
        res.json(finalResult.rows[0]);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Database error updating event:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}

async function deleteEvent(req, res) {
    try {
        const result = await pool.query('DELETE FROM events WHERE id = $1 RETURNING id', [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json({ success: true, deleted: req.params.id });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: error.message });
    }
}

async function deleteAllEvents(req, res) {
    try {
        const result = await pool.query('DELETE FROM events RETURNING id');
        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: error.message });
    }
}

async function getChanges(req, res) {
    try {
        const eventId = req.params.id;
        const result = await pool.query(`
            SELECT se.id, se.source_code, se.source_event_id, se.title,
        se.has_changes, se.changes, se.updated_at, esl.match_confidence
            FROM event_scraped_links esl
            JOIN scraped_events se ON se.id = esl.scraped_event_id
            WHERE esl.event_id = $1 AND se.has_changes = true
            ORDER BY se.updated_at DESC
        `, [eventId]);

        res.json({
            event_id: eventId,
            has_changes: result.rows.length > 0,
            changes: result.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function applyChanges(req, res) {
    try {
        const eventId = req.params.id;
        const { scraped_event_id, fields } = req.body;

        if (!scraped_event_id) return res.status(400).json({ error: 'scraped_event_id required' });

        const scrapedResult = await pool.query(`SELECT * FROM scraped_events WHERE id = $1`, [scraped_event_id]);
        if (scrapedResult.rows.length === 0) return res.status(404).json({ error: 'Scraped event not found' });

        const scraped = scrapedResult.rows[0];
        const fieldsToUpdate = fields && fields.length > 0 ? fields : Object.keys(scraped.changes || {});

        if (fieldsToUpdate.length === 0) return res.status(400).json({ error: 'No fields to update' });

        const updates = [];
        const values = [eventId];
        let paramIndex = 2;

        const fieldMap = {
            title: 'title', date: 'date', start_time: 'start_time', end_time: 'end_time',
            description: 'description', content_url: 'content_url', flyer_front: 'flyer_front',
            venue_name: 'venue_name', venue_address: 'venue_address', venue_city: 'venue_city',
            venue_country: 'venue_country', artists_json: 'artists'
        };

        for (const field of fieldsToUpdate) {
            const eventField = fieldMap[field] || field;
            if (scraped[field] !== undefined) {
                updates.push(`${eventField} = $${paramIndex} `);
                if (field === 'artists_json') {
                    values.push(JSON.stringify(scraped.artists_json));
                } else {
                    values.push(scraped[field]);
                }
                paramIndex++;
            }
        }

        await pool.query(`UPDATE events SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, values);
        await pool.query(`UPDATE scraped_events SET has_changes = false, changes = NULL WHERE id = $1`, [scraped_event_id]);

        const remaining = await pool.query(`
            SELECT COUNT(*) FROM event_scraped_links esl
            JOIN scraped_events se ON se.id = esl.scraped_event_id
            WHERE esl.event_id = $1 AND se.has_changes = true
        `, [eventId]);

        await pool.query(`UPDATE events SET has_pending_changes = $1 WHERE id = $2`, [remaining.rows[0].count > 0, eventId]);

        res.json({ success: true, applied_fields: fieldsToUpdate, has_remaining_changes: remaining.rows[0].count > 0 });
    } catch (error) {
        console.error('Error applying changes:', error);
        res.status(500).json({ error: error.message });
    }
}

async function dismissChanges(req, res) {
    try {
        const eventId = req.params.id;
        const { scraped_event_id } = req.body;

        if (!scraped_event_id) return res.status(400).json({ error: 'scraped_event_id required' });

        await pool.query(`UPDATE scraped_events SET has_changes = false, changes = NULL WHERE id = $1`, [scraped_event_id]);

        const remaining = await pool.query(`
            SELECT COUNT(*) FROM event_scraped_links esl
            JOIN scraped_events se ON se.id = esl.scraped_event_id
            WHERE esl.event_id = $1 AND se.has_changes = true
        `, [eventId]);

        await pool.query(`UPDATE events SET has_pending_changes = $1 WHERE id = $2`, [remaining.rows[0].count > 0, eventId]);

        res.json({ success: true, has_remaining_changes: remaining.rows[0].count > 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function publishStatus(req, res) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { ids, status } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'ids required' });
        }

        const results = { success: [], failed: [] };

        for (const id of ids) {
            const currentRes = await client.query('SELECT * FROM events WHERE id = $1', [id]);
            if (currentRes.rows.length === 0) {
                results.failed.push({ id, error: 'Event not found' });
                continue;
            }
            const currentEvent = currentRes.rows[0];

            if (currentEvent.status === status) {
                results.success.push(id);
                continue;
            }

            // Check transition (using helper if strict checks needed, or simple update)
            if (!canTransition(currentEvent.status, status)) {
                results.failed.push({ id, error: `Invalid transition from ${currentEvent.status} to ${status}` });
                continue;
            }

            if (status === EVENT_STATES.READY_TO_PUBLISH || status === EVENT_STATES.PUBLISHED) {
                const validation = validateEventForPublish(currentEvent);
                if (!validation.isValid) {
                    results.failed.push({ id, error: `Missing fields: ${validation.missingFields.join(', ')}` });
                    continue;
                }
            }

            try {
                await transitionEvent(client, id, currentEvent.status, status, req.user?.id || 'admin');
                results.success.push(id);
            } catch (err) {
                results.failed.push({ id, error: err.message });
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, results });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}

async function syncEvents(req, res) {
    try {
        const events = req.body.events || req.body;
        if (!Array.isArray(events)) return res.status(400).json({ error: 'Expected array of events' });

        let inserted = 0;
        let updated = 0;
        const errors = [];

        for (const event of events) {
            try {
                const result = await pool.query(`
                    INSERT INTO events(
            id, title, date, start_time, end_time, content_url,
            flyer_front, description, venue_id, venue_name,
            venue_address, venue_city, venue_country, artists, listing_date
        ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    ON CONFLICT(id) DO UPDATE SET
    title = CASE WHEN events.publish_status = 'approved' THEN events.title ELSE EXCLUDED.title END,
        date = CASE WHEN events.publish_status = 'approved' THEN events.date ELSE EXCLUDED.date END,
            start_time = CASE WHEN events.publish_status = 'approved' THEN events.start_time ELSE EXCLUDED.start_time END,
                end_time = CASE WHEN events.publish_status = 'approved' THEN events.end_time ELSE EXCLUDED.end_time END,
                    content_url = CASE WHEN events.publish_status = 'approved' THEN events.content_url ELSE EXCLUDED.content_url END,
                        flyer_front = CASE WHEN events.publish_status = 'approved' THEN events.flyer_front ELSE EXCLUDED.flyer_front END,
                            description = CASE WHEN events.publish_status = 'approved' THEN events.description ELSE EXCLUDED.description END,
                                venue_id = CASE WHEN events.publish_status = 'approved' THEN events.venue_id ELSE EXCLUDED.venue_id END,
                                    venue_name = CASE WHEN events.publish_status = 'approved' THEN events.venue_name ELSE EXCLUDED.venue_name END,
                                        venue_address = CASE WHEN events.publish_status = 'approved' THEN events.venue_address ELSE EXCLUDED.venue_address END,
                                            venue_city = CASE WHEN events.publish_status = 'approved' THEN events.venue_city ELSE EXCLUDED.venue_city END,
                                                venue_country = CASE WHEN events.publish_status = 'approved' THEN events.venue_country ELSE EXCLUDED.venue_country END,
                                                    artists = CASE WHEN events.publish_status = 'approved' THEN events.artists ELSE EXCLUDED.artists END,
                                                        listing_date = EXCLUDED.listing_date,
                                                        updated_at = CASE WHEN events.publish_status = 'approved' THEN events.updated_at ELSE CURRENT_TIMESTAMP END
    RETURNING(xmax = 0) AS inserted
        `, [
                    event.id, event.title, event.date || null,
                    event.startTime || event.start_time || null, event.endTime || event.end_time || null,
                    event.contentUrl || event.content_url || null, event.flyerFront || event.flyer_front || null,
                    event.description || null, event.venueId || event.venue_id || null,
                    event.venueName || event.venue_name || null, event.venueAddress || event.venue_address || null,
                    event.venueCity || event.venue_city || null, event.venueCountry || event.venue_country || null,
                    event.artists || null, event.listingDate || event.listing_date || null
                ]);

                if (result.rows[0].inserted) inserted++; else updated++;
            } catch (err) {
                errors.push({ id: event.id, error: err.message });
            }
        }
        res.json({ success: true, inserted, updated, errors });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function syncVenueCoords(req, res) {
    try {
        const result = await pool.query(`
            UPDATE events e
            SET latitude = v.latitude, longitude = v.longitude, updated_at = CURRENT_TIMESTAMP
            FROM venues v
            WHERE LOWER(e.venue_name) = LOWER(v.name)
            AND LOWER(e.venue_city) = LOWER(v.city)
            AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
    AND(e.latitude IS NULL OR e.longitude IS NULL)
        `);
        res.json({ success: true, updated: result.rowCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    listEvents,
    getEvent,
    getRecentUpdates,
    getMapEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    deleteAllEvents,
    getChanges,
    applyChanges,
    dismissChanges,
    publishStatus,
    syncEvents,
    syncVenueCoords
};
