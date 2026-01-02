const { pool } = require('../../db');
const { v4: uuidv4 } = require('uuid');
const { geocodeAddress } = require('../../services/geocoder');
const { matchAndLinkVenues } = require('../../services/matchingService');
const { saveOriginalEntry } = require('../../services/unifiedService');

class VenueService {
    constructor() {
        this.pool = pool;
    }

    async findVenues(params = {}) {
        const { search, city, limit = 100, offset = 0, sort = 'name', order = 'asc', source } = params;

        let venueFilter = '';
        let eventFilter = '';
        const queryParams = [];
        let pIdx = 1;

        if (source) {
            venueFilter = ` AND EXISTS (
                SELECT 1 FROM venue_scraped_links vsl 
                JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id 
                WHERE vsl.venue_id = v.id AND sv.source_code = $${pIdx}
            )`;

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

        if (params.type) {
            query += ` AND combined.venue_type = $${pIdx}`;
            queryParams.push(params.type);
            pIdx++;
        }

        const validSorts = ['name', 'city', 'country', 'event_count'];
        const sortCol = validSorts.includes(sort) ? sort : 'name';
        const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

        query += ` ORDER BY LOWER(name), LOWER(city), priority ASC, ${sortCol} ${sortOrder} LIMIT $${pIdx++} OFFSET $${pIdx}`;
        queryParams.push(parseInt(limit), parseInt(offset));

        const result = await this.pool.query(query, queryParams);
        return result.rows;
    }

    async countVenues(params = {}) {
        const { search, city, source } = params;

        let venueFilter = '';
        let eventFilter = '';
        const queryParams = [];
        let pIdx = 1;

        if (source) {
            venueFilter = ` AND EXISTS (
                SELECT 1 FROM venue_scraped_links vsl 
                JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id 
                WHERE vsl.venue_id = v.id AND sv.source_code = $${pIdx}
            )`;
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

        if (search) {
            countQuery += ` AND (combined.name ILIKE $${pIdx} OR combined.address ILIKE $${pIdx})`;
            queryParams.push(`%${search}%`);
            pIdx++;
        }

        if (city) {
            countQuery += ` AND combined.city ILIKE $${pIdx}`;
            queryParams.push(`%${city}%`);
            pIdx++;
        }

        if (params.type) {
            countQuery += ` AND combined.venue_type = $${pIdx}`;
            queryParams.push(params.type);
            pIdx++;
        }

        countQuery += `) subq`;

        const result = await this.pool.query(countQuery, queryParams);
        return parseInt(result.rows[0].count);
    }

    async getUsage(id) {
        const result = await this.pool.query(`
            SELECT COUNT(*) as count 
            FROM events 
            WHERE venue_id = $1
        `, [id]);
        return parseInt(result.rows[0].count);
    }

    async findById(id) {
        const result = await this.pool.query('SELECT * FROM venues WHERE id = $1', [id]);
        if (result.rows.length === 0) return null;

        const venue = result.rows[0];

        // Get events
        const eventsResult = await this.pool.query(`
            SELECT id, title, date, artists 
            FROM events 
            WHERE venue_id = $1 OR venue_name = $2
            ORDER BY date DESC
            LIMIT 50
        `, [id, venue.name]);
        venue.events = eventsResult.rows;

        // Get source references
        const sourceRefs = await this.pool.query(`
            SELECT sv.id, sv.source_code, sv.source_venue_id, sv.name,
                   sv.address, sv.city, sv.country, sv.content_url,
                   sv.venue_type, sv.phone, sv.email,
                   sv.latitude, sv.longitude, vsl.match_confidence as confidence
            FROM venue_scraped_links vsl
            JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
            WHERE vsl.venue_id = $1
        `, [id]);
        venue.source_references = sourceRefs.rows;

        return venue;
    }

    async create(data) {
        let { name, address, city, country, content_url, latitude, longitude, capacity, venue_type, email, phone } = data;

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
        await this.pool.query(`
            INSERT INTO venues (id, name, address, city, country, latitude, longitude, content_url, capacity, venue_type, email, phone, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [venueId, name, address, city, country, latitude, longitude, content_url, capacity, venue_type, email, phone]);

        // Link the scraping source
        await this.pool.query(`
            INSERT INTO venue_scraped_links (venue_id, scraped_venue_id, match_confidence, is_primary)
            VALUES ($1, $2, 1.0, true)
        `, [venueId, scrapedId]);

        // 3. Link existing events
        if (name && city) {
            await this.pool.query(`
                UPDATE events
                SET venue_id = $1, updated_at = CURRENT_TIMESTAMP
                WHERE venue_id IS NULL
                AND LOWER(TRIM(venue_name)) = LOWER(TRIM($2))
                AND LOWER(TRIM(venue_city)) = LOWER(TRIM($3))
            `, [venueId, name, city]);
        }

        // Audit Log
        await this.pool.query(`
            INSERT INTO audit_logs (entity_type, entity_id, action, changes, performed_by)
            VALUES ($1, $2, $3, $4, $5)
        `, ['venue', venueId, 'CREATE', JSON.stringify(data), 'admin']);

        return this.findById(venueId);
    }

    async update(id, updates, user) {
        const currentRes = await this.pool.query('SELECT * FROM venues WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) return null;
        const currentVenue = currentRes.rows[0];

        const fieldSources = currentVenue.field_sources || {};
        const allowedFields = ['name', 'address', 'city', 'country', 'content_url', 'latitude', 'longitude', 'venue_type', 'email', 'phone', 'capacity'];
        const setClauses = [];
        const values = [];
        let paramIndex = 1;
        const changes = {};

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                // Diff Logic
                const oldVal = currentVenue[key];
                const newVal = value;
                const sOld = JSON.stringify(oldVal);
                const sNew = JSON.stringify(newVal);

                if (sOld !== sNew) {
                    changes[key] = { old: oldVal, new: newVal };
                }

                fieldSources[key] = 'og';
                setClauses.push(`${key} = $${paramIndex++}`);
                values.push(value);
            }
        }

        if (setClauses.length === 0) return await this.findById(id);

        setClauses.push(`field_sources = $${paramIndex++}::jsonb`);
        values.push(JSON.stringify(fieldSources));

        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        // Audit Log
        if (Object.keys(changes).length > 0) {
            await this.pool.query(`
                INSERT INTO audit_logs (entity_type, entity_id, action, changes, performed_by)
                VALUES ($1, $2, $3, $4, $5)
            `, ['venue', id, 'UPDATE', JSON.stringify(changes), user?.id || 'admin']);
        }

        const result = await this.pool.query(`
            UPDATE venues SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *
        `, values);

        return result.rows[0];
    }

    async delete(id, user) {
        await this.pool.query(`
            INSERT INTO audit_logs (entity_type, entity_id, action, changes, performed_by)
            VALUES ($1, $2, $3, $4, $5)
        `, ['venue', id, 'DELETE', '{}', user?.id || 'admin']);
        const result = await this.pool.query('DELETE FROM venues WHERE id = $1 RETURNING id', [id]);
        return result.rows.length > 0;
    }

    async getHistory(id) {
        const result = await this.pool.query(`
            SELECT id, action, changes, performed_by, created_at, 'content' as type
            FROM audit_logs 
            WHERE entity_type = 'venue' AND entity_id = $1
            ORDER BY created_at DESC
        `, [id]);

        return result.rows.map(r => ({
            ...r,
            changes: r.changes || {}
        }));
    }

    async deleteAll() {
        const result = await this.pool.query('DELETE FROM venues RETURNING id');
        return result.rowCount;
    }

    async bulkDelete(ids) {
        const result = await this.pool.query(
            'DELETE FROM venues WHERE id = ANY($1::text[]) RETURNING id',
            [ids]
        );
        return result.rows.length;
    }

    async findMissing() {
        const result = await this.pool.query(`
            SELECT DISTINCT e.venue_id, e.venue_name, e.venue_city, e.venue_country
            FROM events e
            LEFT JOIN venues v ON e.venue_id = v.id
            WHERE e.venue_id IS NOT NULL 
            AND v.id IS NULL
            ORDER BY e.venue_name
        `);
        return result.rows;
    }

    async geocodeBatch(limit = 10, offset = 0) {
        const venues = await this.pool.query(`
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
                const coords = await geocodeAddress(venue.address, venue.city, venue.country);
                if (coords) {
                    await this.pool.query(`
                        UPDATE venues 
                        SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $3
                    `, [coords.latitude, coords.longitude, venue.id]);
                    geocoded++;
                } else {
                    failed++;
                    errors.push(`No coordinates for ${venue.name}`);
                }
            } catch (e) {
                failed++;
                errors.push(`Error for ${venue.name}: ${e.message}`);
            }
            // Simple delay handled by caller or assumed acceptable for small batches
        }

        return { processed: venues.rows.length, geocoded, failed, errors };
    }

    // Helper to count ungeocoded
    async countUngeocoded() {
        const result = await this.pool.query(`
            SELECT COUNT(*) as count
            FROM venues
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND (address IS NOT NULL OR city IS NOT NULL)
        `);
        return parseInt(result.rows[0].count);
    }

    async geocodeOne(id) {
        const venue = await this.findById(id);
        if (!venue) throw new Error('Venue not found');

        const coords = await geocodeAddress(venue.address, venue.city, venue.country);
        if (coords) {
            const result = await this.pool.query(`
                UPDATE venues SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $3 RETURNING *
            `, [coords.latitude, coords.longitude, id]);
            return result.rows[0];
        }
        return null; // Failed
    }

    async syncFromEvents() {
        const missingVenues = await this.pool.query(`
            SELECT DISTINCT 
                e.venue_name, e.venue_address, e.venue_city, e.venue_country,
                COUNT(*) as event_count
            FROM events e
            WHERE e.venue_name IS NOT NULL AND e.venue_name != ''
            AND NOT EXISTS (
                SELECT 1 FROM venues v 
                WHERE LOWER(v.name) = LOWER(e.venue_name) 
                AND LOWER(v.city) = LOWER(e.venue_city)
            )
            GROUP BY e.venue_name, e.venue_address, e.venue_city, e.venue_country
            ORDER BY COUNT(*) DESC
        `);

        let created = 0;
        const results = [];

        for (const venue of missingVenues.rows) {
            try {
                const venueId = uuidv4();
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

                await this.pool.query(`
                    INSERT INTO venues (id, name, address, city, country, latitude, longitude, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [venueId, venue.venue_name, venue.venue_address, venue.venue_city, venue.venue_country, latitude, longitude]);

                created++;
                results.push({ name: venue.venue_name, city: venue.venue_city, geocoded: !!(latitude && longitude) });
            } catch (e) {
                console.error(`Error creating venue ${venue.venue_name}`, e);
            }
        }
        return { found: missingVenues.rows.length, created, results };
    }

    async linkEvents() {
        // Create missing venues first (simplified sync)
        await this.pool.query(`
            INSERT INTO venues (id, name, address, city, country, created_at, updated_at)
            SELECT 
                gen_random_uuid(), e.venue_name, e.venue_address, e.venue_city, e.venue_country,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            FROM (
                SELECT DISTINCT ON (LOWER(venue_name), LOWER(venue_city))
                    venue_name, venue_address, venue_city, venue_country
                FROM events
                WHERE venue_name IS NOT NULL AND venue_name != ''
            ) e
            WHERE NOT EXISTS (
                SELECT 1 FROM venues v 
                WHERE LOWER(v.name) = LOWER(e.venue_name) 
                AND LOWER(v.city) = LOWER(e.venue_city)
            )
       `);

        const linkResult = await this.pool.query(`
            UPDATE events e
            SET venue_id = v.id
            FROM venues v
            WHERE e.venue_id IS NULL
            AND LOWER(e.venue_name) = LOWER(v.name)
            AND LOWER(e.venue_city) = LOWER(v.city)
            RETURNING e.id
       `);
        return linkResult.rowCount;
    }

    async match(options) {
        return await matchAndLinkVenues(options);
    }
}

module.exports = new VenueService();
