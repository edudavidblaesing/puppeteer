const { pool } = require('../../db');
const { saveOriginalEntry, linkToUnified } = require('../unifiedService');
const { EVENT_STATES, canTransition, validateEventForPublish, transitionEvent } = require('../../models/eventStateMachine');

class EventService {
    async findEvents(params) {
        const {
            city, search, limit = 100, offset = 0,
            from, to, status, published,
            timeFilter = 'upcoming',
            source, createdAfter, updatedAfter
        } = params;

        // 1. Fetch Main Events
        let query = `
            SELECT e.*, 
                   v.latitude as venue_latitude,
                   v.longitude as venue_longitude
             FROM events e
            LEFT JOIN venues v ON e.venue_id = v.id
            WHERE 1=1`;

        const queryParams = [];
        let paramIndex = 1;

        // --- Filters ---

        if (search) {
            query += ` AND (
                e.title ILIKE $${paramIndex} 
                OR e.venue_name ILIKE $${paramIndex} 
                OR e.artists ILIKE $${paramIndex}
            )`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        if (city) {
            query += ` AND LOWER(e.venue_city) = LOWER($${paramIndex})`;
            queryParams.push(city);
            paramIndex++;
        }

        if (status && status !== 'all') {
            if (status === 'drafts') {
                query += ` AND e.status IN ('SCRAPED_DRAFT', 'MANUAL_DRAFT')`;
            } else {
                query += ` AND e.status = $${paramIndex}`;
                queryParams.push(status);
                paramIndex++;
            }
        }

        if (source) {
            // Note: This EXISTS subquery is unavoidable for filtering, but better than SELECT subquery in projection
            query += ` AND (
                 e.source_code = $${paramIndex}
                 OR EXISTS (
                     SELECT 1 FROM event_scraped_links esl 
                     JOIN scraped_events se ON se.id = esl.scraped_event_id
                     WHERE esl.event_id = e.id AND se.source_code = $${paramIndex}
                 )
             )`;
            queryParams.push(source);
            paramIndex++;
        }

        if (published !== undefined) {
            query += ` AND e.is_published = $${paramIndex}`;
            queryParams.push(published === 'true');
            paramIndex++;
        }

        if (from) {
            query += ` AND e.date >= $${paramIndex}`;
            queryParams.push(from);
            paramIndex++;
        }

        if (to) {
            query += ` AND e.date <= $${paramIndex}`;
            queryParams.push(to);
            paramIndex++;
        }

        // Time Filter
        let effectiveFilter = timeFilter;
        if (effectiveFilter === 'upcoming') {
            query += ` AND e.date >= CURRENT_DATE`;
        } else if (effectiveFilter === 'past') {
            query += ` AND e.date < CURRENT_DATE`;
        }

        // --- Sorting ---
        if (effectiveFilter === 'past') {
            query += ` ORDER BY e.date DESC, e.start_time DESC, e.title ASC`;
        } else {
            query += ` ORDER BY e.date ASC, e.start_time ASC, e.title ASC`;
        }

        // --- Pagination ---
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        queryParams.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, queryParams);
        const events = result.rows;

        if (events.length === 0) return [];

        const eventIds = events.map(e => e.id);

        // 2. Fetch Relations (Parallel)
        const [artistsResult, sourcesResult] = await Promise.all([
            pool.query(`
                SELECT ea.event_id, a.id, a.name, ea.role
                FROM event_artists ea
                JOIN artists a ON a.id = ea.artist_id
                WHERE ea.event_id = ANY($1::text[])
                ORDER BY ea.billing_order ASC
            `, [eventIds]),
            pool.query(`
                SELECT esl.event_id, se.id, se.source_code, se.title, se.date, 
                       se.start_time, se.venue_name, se.venue_city, 
                       se.content_url, esl.match_confidence
                FROM event_scraped_links esl
                JOIN scraped_events se ON se.id = esl.scraped_event_id
                WHERE esl.event_id = ANY($1::text[])
            `, [eventIds])
        ]);

        // 3. Map Relations
        const artistsMap = {};
        artistsResult.rows.forEach(row => {
            if (!artistsMap[row.event_id]) artistsMap[row.event_id] = [];
            artistsMap[row.event_id].push({
                id: row.id,
                name: row.name,
                role: row.role
            });
        });

        const sourcesMap = {};
        sourcesResult.rows.forEach(row => {
            if (!sourcesMap[row.event_id]) sourcesMap[row.event_id] = [];
            sourcesMap[row.event_id].push({
                id: row.id,
                source_code: row.source_code,
                title: row.title,
                date: row.date,
                start_time: row.start_time,
                venue_name: row.venue_name,
                venue_city: row.venue_city,
                content_url: row.content_url,
                confidence: row.match_confidence
            });
        });

        // 4. Merge
        return events.map(e => ({
            ...e,
            artists_list: artistsMap[e.id] || [],
            source_references: sourcesMap[e.id] || []
        }));
    }

    async countEvents(params) {
        const {
            city, search, status, published,
            from, to, timeFilter = 'upcoming', source
        } = params;

        let query = 'SELECT COUNT(*) FROM events e WHERE 1=1';
        const queryParams = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND (e.title ILIKE $${paramIndex} OR e.venue_name ILIKE $${paramIndex} OR e.artists ILIKE $${paramIndex})`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }
        if (city) {
            query += ` AND LOWER(e.venue_city) = LOWER($${paramIndex})`;
            queryParams.push(city);
            paramIndex++;
        }
        if (status && status !== 'all') {
            if (status === 'drafts') {
                query += ` AND e.status IN ('SCRAPED_DRAFT', 'MANUAL_DRAFT')`;
            } else {
                query += ` AND e.status = $${paramIndex}`;
                queryParams.push(status);
                paramIndex++;
            }
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
            queryParams.push(source);
            paramIndex++;
        }
        if (published !== undefined) {
            query += ` AND e.is_published = $${paramIndex}`;
            queryParams.push(published === 'true');
            paramIndex++;
        }
        if (from) {
            query += ` AND e.date >= $${paramIndex}`;
            queryParams.push(from);
            paramIndex++;
        }
        if (to) {
            query += ` AND e.date <= $${paramIndex}`;
            queryParams.push(to);
            paramIndex++;
        }

        if (timeFilter === 'upcoming') {
            query += ` AND e.date >= CURRENT_DATE`;
        } else if (timeFilter === 'past') {
            query += ` AND e.date < CURRENT_DATE`;
        }

        const result = await pool.query(query, queryParams);
        return parseInt(result.rows[0].count);
    }

    async findById(eventId) {
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

        if (result.rows.length === 0) return null;

        const event = result.rows[0];

        // Fetch source references (logic ported from controller)
        // ... (simplified for now, logic similar to controller fallback)
        // For simplicity, we can fetch sources separately or join, 
        // but let's stick to the controller logic basics.

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
            event.source_references = sourceRefs.rows;
        } catch (e) {
            event.source_references = [];
        }

        return event;
    }

    async create(data, artistsList) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { title, date, start_time, venue_id, venue_name, venue_city, venue_country, venue_address, artists, description, content_url, flyer_front, is_published, event_type } = data;

            const eventData = {
                title, date, start_time, venue_name, venue_address, venue_city, venue_country,
                description, content_url, flyer_front, price_info: null, id: `manual_${Date.now()}`
            };

            // Note: saveOriginalEntry and linkToUnified need to be imported or handled. 
            // In a pure service, maybe we call them, or we duplicate logic? 
            // Better to call them. 
            const { scrapedId } = await saveOriginalEntry('event', eventData);
            const unifiedId = await linkToUnified('event', scrapedId, { ...eventData, source_code: 'og' });

            const finalStartTime = start_time || null;

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
                'manual',
                JSON.stringify({}),
                EVENT_STATES.MANUAL_DRAFT
            ]);

            if (artistsList && Array.isArray(artistsList)) {
                await this.syncEventArtists(client, unifiedId, artistsList);
            }

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async update(id, updates, user) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const currentRes = await client.query('SELECT * FROM events WHERE id = $1', [id]);
            if (currentRes.rows.length === 0) throw new Error('Event not found');
            const currentEvent = currentRes.rows[0];
            const fieldSources = currentEvent.field_sources || {};

            // Status Transitions
            if (updates.status && updates.status !== currentEvent.status) {
                if (!canTransition(currentEvent.status, updates.status)) {
                    throw new Error(`Invalid state transition from ${currentEvent.status} to ${updates.status}`);
                }

                if (updates.status === EVENT_STATES.READY_TO_PUBLISH || updates.status === EVENT_STATES.PUBLISHED) {
                    const validation = validateEventForPublish({ ...currentEvent, ...updates });
                    if (!validation.isValid) {
                        throw new Error(`Missing fields: ${validation.missingFields.join(', ')}`);
                    }
                }

                await transitionEvent(client, id, currentEvent.status, updates.status, user?.id || 'admin');
                delete updates.status;
            }

            const allowedFields = [
                'title', 'date', 'start_time', 'end_time', 'content_url',
                'flyer_front', 'description', 'venue_id', 'venue_name',
                'venue_address', 'venue_city', 'venue_country', 'artists',
                'is_published', 'latitude', 'longitude', 'event_type', 'publish_status' // status handled above
            ];

            const setClauses = [];
            const values = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(updates)) {
                if (allowedFields.includes(key)) {
                    fieldSources[key] = 'og';
                    if ((key === 'start_time' || key === 'end_time') && value && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
                        let dateValue = updates.date || currentEvent.date;
                        console.log(`[EventService] Processing ${key}. Value: "${value}". Raw Date:`, dateValue, 'Type:', typeof dateValue, 'Constructor:', dateValue?.constructor?.name);

                        // Extract YYYY-MM-DD from dateValue
                        if (dateValue instanceof Date) {
                            dateValue = dateValue.toISOString().split('T')[0];
                        } else if (typeof dateValue === 'string' && dateValue.includes('T')) {
                            dateValue = dateValue.split('T')[0];
                        }

                        console.log(`[EventService] Processed Date: "${dateValue}"`);

                        if (dateValue) {
                            setClauses.push(`${key} = $${paramIndex++}::TIMESTAMP`);
                            values.push(`${dateValue} ${value}`);
                        } else {
                            // If no date available, we can't form a timestamp. 
                            // But let's just push value and let PG error specific to it found.
                            setClauses.push(`${key} = $${paramIndex++}::TIMESTAMP`);
                            values.push(value);
                        }
                    } else {
                        setClauses.push(`${key} = $${paramIndex++}`);
                        values.push(value);
                    }
                }
            }

            if (updates.artists_list && Array.isArray(updates.artists_list)) {
                await this.syncEventArtists(client, id, updates.artists_list);
            }

            if (setClauses.length > 0) {
                setClauses.push(`field_sources = $${paramIndex++}::jsonb`);
                values.push(JSON.stringify(fieldSources));
                setClauses.push('updated_at = CURRENT_TIMESTAMP');
                values.push(id);

                await client.query(`UPDATE events SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`, values);
            }

            // Sync links metadata
            await client.query(`UPDATE event_scraped_links SET last_synced_at = CURRENT_TIMESTAMP WHERE event_id = $1`, [id]);

            await client.query('COMMIT');
            return await this.findById(id); // Return fresh
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async delete(id) {
        const result = await pool.query('DELETE FROM events WHERE id = $1 RETURNING id', [id]);
        return result.rows.length > 0;
    }

    async deleteAll() {
        const result = await pool.query('DELETE FROM events');
        return result.rowCount;
    }

    // Helper
    async syncEventArtists(client, eventId, artistsList) {
        if (!artistsList || !Array.isArray(artistsList)) return;
        await client.query('DELETE FROM event_artists WHERE event_id = $1', [eventId]);

        let order = 0;
        const addedIds = new Set();
        const artistNames = [];

        for (const artist of artistsList) {
            let artistId = artist.id;
            const artistName = artist.name;
            if (!artistName) continue;
            artistNames.push(artistName);

            if (typeof artistId === 'string' && (artistId.startsWith('temp-') || artistId.startsWith('source-') || artistId.startsWith('manual_'))) {
                const existing = await client.query('SELECT id FROM artists WHERE LOWER(name) = LOWER($1)', [artistName]);
                if (existing.rows.length > 0) {
                    artistId = existing.rows[0].id;
                } else {
                    const newArtist = await client.query('INSERT INTO artists (name, created_at) VALUES ($1, NOW()) RETURNING id', [artistName]);
                    artistId = newArtist.rows[0].id;
                }
            }

            if (addedIds.has(artistId)) continue;
            addedIds.add(artistId);

            await client.query(
                `INSERT INTO event_artists (event_id, artist_id, role, billing_order) VALUES ($1, $2, $3, $4)`,
                [eventId, artistId, 'performer', order++]
            );
        }

        if (artistNames.length > 0) {
            const artistsStr = artistNames.join(', ');
            await client.query('UPDATE events SET artists = $1 WHERE id = $2', [artistsStr, eventId]);
        }
    }

    async getRecentUpdates(limit = 50) {
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

        return {
            data: result.rows,
            total: result.rows.length
        };
    }

    async getMapEvents(params) {
        const { city, status, showPast } = params;
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
        const queryParams = [];
        let paramIndex = 1;

        if (city) {
            query += ` AND LOWER(e.venue_city) = LOWER($${paramIndex})`;
            queryParams.push(city);
            paramIndex++;
        }
        if (status && status !== 'all') {
            if (status === 'drafts') {
                query += ` AND e.status IN ('SCRAPED_DRAFT', 'MANUAL_DRAFT')`;
            } else {
                query += ` AND e.status = $${paramIndex}`;
                queryParams.push(status);
                paramIndex++;
            }
        }
        if (showPast !== 'true') {
            query += ` AND e.date >= CURRENT_DATE - INTERVAL '1 day'`;
        }

        query += ` ORDER BY e.date ASC LIMIT 2000`;
        const result = await pool.query(query, queryParams);
        return { data: result.rows, total: result.rows.length };
    }

    async syncVenueCoords() {
        const result = await pool.query(`
            UPDATE events e
            SET latitude = v.latitude, longitude = v.longitude, updated_at = CURRENT_TIMESTAMP
            FROM venues v
            WHERE LOWER(e.venue_name) = LOWER(v.name)
            AND LOWER(e.venue_city) = LOWER(v.city)
            AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
            AND (e.latitude IS NULL OR e.longitude IS NULL)
        `);
        return result.rowCount;
    }

    async getChanges(eventId) {
        const result = await pool.query(`
            SELECT se.id, se.source_code, se.source_event_id, se.title,
                   se.has_changes, se.changes, se.updated_at, esl.match_confidence
            FROM event_scraped_links esl
            JOIN scraped_events se ON se.id = esl.scraped_event_id
            WHERE esl.event_id = $1 AND se.has_changes = true
            ORDER BY se.updated_at DESC
        `, [eventId]);
        return {
            event_id: eventId,
            has_changes: result.rows.length > 0,
            changes: result.rows
        };
    }

    async applyChanges(eventId, scrapedEventId, fields) {
        const scrapedResult = await pool.query(`SELECT * FROM scraped_events WHERE id = $1`, [scrapedEventId]);
        if (scrapedResult.rows.length === 0) throw new Error('Scraped event not found');

        const scraped = scrapedResult.rows[0];
        const fieldsToUpdate = fields && fields.length > 0 ? fields : Object.keys(scraped.changes || {});
        if (fieldsToUpdate.length === 0) throw new Error('No fields to update');

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
        await pool.query(`UPDATE scraped_events SET has_changes = false, changes = NULL WHERE id = $1`, [scrapedEventId]);

        const remaining = await pool.query(`
            SELECT COUNT(*) FROM event_scraped_links esl
            JOIN scraped_events se ON se.id = esl.scraped_event_id
            WHERE esl.event_id = $1 AND se.has_changes = true
        `, [eventId]);

        await pool.query(`UPDATE events SET has_pending_changes = $1 WHERE id = $2`, [remaining.rows[0].count > 0, eventId]);

        return { success: true, applied_fields: fieldsToUpdate, has_remaining_changes: remaining.rows[0].count > 0 };
    }

    async dismissChanges(eventId, scrapedEventId) {
        await pool.query(`UPDATE scraped_events SET has_changes = false, changes = NULL WHERE id = $1`, [scrapedEventId]);
        const remaining = await pool.query(`
            SELECT COUNT(*) FROM event_scraped_links esl
            JOIN scraped_events se ON se.id = esl.scraped_event_id
            WHERE esl.event_id = $1 AND se.has_changes = true
        `, [eventId]);
        await pool.query(`UPDATE events SET has_pending_changes = $1 WHERE id = $2`, [remaining.rows[0].count > 0, eventId]);
        return { success: true, has_remaining_changes: remaining.rows[0].count > 0 };
    }

    async publishStatus(ids, status, userId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
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
                    await transitionEvent(client, id, currentEvent.status, status, userId);
                    results.success.push(id);
                } catch (err) {
                    results.failed.push({ id, error: err.message });
                }
            }
            await client.query('COMMIT');
            return results;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async syncEvents(events) {
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
        return { inserted, updated, errors };
    }
}

module.exports = new EventService();
