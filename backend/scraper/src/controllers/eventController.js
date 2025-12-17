const { pool } = require('../db');
const { geocodeAddress } = require('../services/geocoder');

// -----------------------------------------------------------------------------
// READ OPERATIONS
// -----------------------------------------------------------------------------

async function listEvents(req, res) {
    try {
        const { city, search, limit = 100, offset = 0, from, to, status, showPast } = req.query;

        let query = `
            SELECT e.*, 
                   v.latitude as venue_latitude,
                   v.longitude as venue_longitude,
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'id', se.id,
                           'source_code', se.source_code,
                           'title', se.title,
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

        if (showPast !== 'true') {
            // "Show Past" means show OLD/Expired events. 
            // If false (default), we only show events from ~recently (last 3 days) to future.
            query += ` AND e.date >= CURRENT_DATE - INTERVAL '3 days'`;
        }

        // Improved Sorting Logic
        // We use a constructed timestamp for more precision than just 'date'
        query += ` ORDER BY 
            CASE 
                -- 0: Ongoing/Live (Today & Time correct)
                WHEN e.date::date = CURRENT_DATE 
                     AND (e.start_time IS NULL OR CURRENT_TIME >= e.start_time::time)
                     AND (e.end_time IS NULL OR CURRENT_TIME <= e.end_time::time) THEN 0
                -- 1: Future
                WHEN e.date::date > CURRENT_DATE THEN 1
                -- 2: Today but ended / Recent
                WHEN e.date::date >= CURRENT_DATE - INTERVAL '3 days' THEN 2
                -- 3: Old
                ELSE 3
            END,
            CASE e.publish_status
                WHEN 'approved' THEN 0
                WHEN 'pending' THEN 1
                WHEN 'rejected' THEN 2
                ELSE 3
            END,
            -- For Future/Live: Soonest first
            CASE 
                WHEN e.date::date >= CURRENT_DATE THEN COALESCE(e.start_time, e.date)
            END ASC,
            -- For Past: Most recent first
            CASE 
                WHEN e.date::date < CURRENT_DATE THEN COALESCE(e.start_time, e.date)
            END DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM events WHERE 1=1';
        const countParams = [];
        let countParamIndex = 1;

        if (search) {
            countQuery += ` AND (title ILIKE $${countParamIndex} OR venue_name ILIKE $${countParamIndex} OR artists ILIKE $${countParamIndex})`;
            countParams.push(`%${search}%`);
            countParamIndex++;
        }
        if (city) {
            countQuery += ` AND LOWER(venue_city) = LOWER($${countParamIndex})`;
            countParams.push(city);
            countParamIndex++;
        }
        if (status && status !== 'all') {
            countQuery += ` AND publish_status = $${countParamIndex}`;
            countParams.push(status);
            countParamIndex++;
        }
        if (from) {
            countQuery += ` AND date >= $${countParamIndex}`;
            countParams.push(from);
            countParamIndex++;
        }
        if (to) {
            countQuery += ` AND date <= $${countParamIndex}`;
            countParams.push(to);
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
                       se.description, se.price_info, se.ticket_url, se.event_type,
                       se.latitude, se.longitude, se.updated_at,
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
                           se.description, se.price_info, se.ticket_url,
                           se.latitude, se.longitude, se.updated_at,
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

async function createEvent(req, res) {
    try {
        const { title, date, start_time, venue_name, venue_city, venue_country, venue_address, artists, description, content_url, flyer_front, is_published, event_type } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const id = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        let venueId = null;
        if (venue_name) {
            const venueResult = await pool.query(
                `SELECT id FROM venues WHERE LOWER(name) = LOWER($1) AND LOWER(city) = LOWER($2) LIMIT 1`,
                [venue_name, venue_city || '']
            );
            if (venueResult.rows.length > 0) {
                venueId = venueResult.rows[0].id;
            }
        }

        const result = await pool.query(`
            INSERT INTO events (
                id, title, date, start_time, venue_id, venue_name, venue_address, 
                venue_city, venue_country, artists, description, content_url, 
                flyer_front, is_published, event_type, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
            RETURNING *
        `, [
            id, title, date || null, start_time || null, venueId,
            venue_name || null, venue_address || null, venue_city || null, venue_country || null,
            artists || null, description || null, content_url || null, flyer_front || null,
            is_published || false, event_type || 'event'
        ]);

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Create event error:', error);
        res.status(500).json({ error: error.message });
    }
}

async function updateEvent(req, res) {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Fetch current field_sources to update them
        const currentRes = await pool.query('SELECT field_sources FROM events WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }
        const fieldSources = currentRes.rows[0].field_sources || {};

        const allowedFields = [
            'title', 'date', 'start_time', 'end_time', 'content_url',
            'flyer_front', 'description', 'venue_id', 'venue_name',
            'venue_address', 'venue_city', 'venue_country', 'artists',
            'is_published', 'latitude', 'longitude', 'event_type'
        ];

        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                // validation logic remains same, but we add to fieldSources
                fieldSources[key] = 'og';

                if ((key === 'start_time' || key === 'end_time') && value && typeof value === 'string') {
                    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
                        const dateValue = updates.date || null;
                        if (dateValue) {
                            setClauses.push(`${key} = $${paramIndex++}::TIMESTAMP`);
                            values.push(`${dateValue} ${value}`);
                        } else {
                            setClauses.push(`${key} = (SELECT date::date || ' ' || $${paramIndex++})::TIMESTAMP`);
                            values.push(value);
                        }
                    } else {
                        setClauses.push(`${key} = $${paramIndex++}::TIMESTAMP`);
                        values.push(value);
                    }
                } else {
                    setClauses.push(`${key} = $${paramIndex++}`);
                    values.push(value);
                }
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        // Add field_sources to update
        setClauses.push(`field_sources = $${paramIndex++}::jsonb`);
        values.push(JSON.stringify(fieldSources));

        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        const query = `
            UPDATE events 
            SET ${setClauses.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        const result = await pool.query(query, values);

        // Update last_synced_at for linked sources since we manually updated the event
        await pool.query(`
            UPDATE event_scraped_links
            SET last_synced_at = CURRENT_TIMESTAMP
            WHERE event_id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json({ success: true, event: result.rows[0] });
    } catch (error) {
        console.error('Database error updating event:', error);
        res.status(500).json({ error: error.message });
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
                updates.push(`${eventField} = $${paramIndex}`);
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
    try {
        const { ids, status } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });

        await pool.query(`
            UPDATE events SET publish_status = $1, is_published = $2, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ANY($3::text[])
        `, [status, status === 'approved', ids]);

        res.json({ success: true, status, ids });
    } catch (error) {
        res.status(500).json({ error: error.message });
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
                    INSERT INTO events (
                        id, title, date, start_time, end_time, content_url,
                        flyer_front, description, venue_id, venue_name,
                        venue_address, venue_city, venue_country, artists, listing_date
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    ON CONFLICT (id) DO UPDATE SET
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
                    RETURNING (xmax = 0) AS inserted
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
            AND (e.latitude IS NULL OR e.longitude IS NULL)
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
