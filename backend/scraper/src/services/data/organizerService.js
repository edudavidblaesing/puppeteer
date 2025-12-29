const { pool } = require('../../db');
const { v4: uuidv4 } = require('uuid');
const { matchAndLinkOrganizers } = require('../../services/matchingService');

class OrganizerService {
    constructor() {
        this.pool = pool;
    }

    async findOrganizers(params = {}) {
        const { search, limit = 100, offset = 0, source } = params;

        let query = `
            SELECT o.*, 
                (SELECT COUNT(*) FROM event_organizers eo WHERE eo.organizer_id = o.id) as event_count,
                (SELECT COUNT(DISTINCT e.venue_id) FROM event_organizers eo JOIN events e ON e.id = eo.event_id WHERE eo.organizer_id = o.id) as venue_count,
                (
                    SELECT so.source_code
                    FROM organizer_scraped_links osl
                    JOIN scraped_organizers so ON so.id = osl.scraped_organizer_id
                    WHERE osl.organizer_id = o.id
                    LIMIT 1
                ) as provider,
                (
                    SELECT json_agg(json_build_object(
                        'source_code', so.source_code, 
                        'id', so.id,
                        'name', so.name,
                        'description', so.description,
                        'image_url', so.image_url,
                        'content_url', so.url,
                        'provider', so.source_code
                    ))
                    FROM organizer_scraped_links osl
                    JOIN scraped_organizers so ON so.id = osl.scraped_organizer_id
                    WHERE osl.organizer_id = o.id
                ) as source_references
            FROM organizers o
            WHERE 1=1
        `;
        const queryParams = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND o.name ILIKE $${paramIndex}`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        if (source) {
            query += ` AND EXISTS (
                SELECT 1 FROM organizer_scraped_links osl
                JOIN scraped_organizers so ON so.id = osl.scraped_organizer_id
                WHERE osl.organizer_id = o.id AND so.source_code = $${paramIndex}
            )`;
            queryParams.push(source);
            paramIndex++;
        }

        query += ` ORDER BY o.name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        queryParams.push(parseInt(limit), parseInt(offset));

        const result = await this.pool.query(query, queryParams);
        return result.rows;
    }

    async countOrganizers(params = {}) {
        const { search, source } = params;

        let countQuery = 'SELECT COUNT(*) FROM organizers o WHERE 1=1';
        let countParams = [];
        let countParamIndex = 1;

        if (search) {
            countQuery += ` AND o.name ILIKE $${countParamIndex}`;
            countParams.push(`%${search}%`);
            countParamIndex++;
        }

        if (source) {
            countQuery += ` AND EXISTS (
                SELECT 1 FROM organizer_scraped_links osl
                JOIN scraped_organizers so ON so.id = osl.scraped_organizer_id
                WHERE osl.organizer_id = o.id AND so.source_code = $${countParamIndex}
            )`;
            countParams.push(source);
            countParamIndex++;
        }

        const result = await this.pool.query(countQuery, countParams);
        return parseInt(result.rows[0].count);
    }

    async findById(id) {
        console.log(`[OrganizerService] findById called with: ${id}`);
        const result = await this.pool.query('SELECT * FROM organizers WHERE id = $1', [id]);
        console.log(`[OrganizerService] findById result count: ${result.rows.length}`);
        if (result.rows.length === 0) return null;

        const organizer = result.rows[0];

        // Get recent events
        const eventsResult = await this.pool.query(`
            SELECT e.id, e.title, e.date, e.venue_name, e.venue_city
            FROM events e
            JOIN event_organizers eo ON eo.event_id = e.id
            WHERE eo.organizer_id = $1
            ORDER BY e.date DESC
            LIMIT 20
        `, [id]);
        organizer.events = eventsResult.rows;

        // Get venues
        const venuesResult = await this.pool.query(`
            SELECT DISTINCT v.id, v.name, v.city, v.country
            FROM events e
            JOIN event_organizers eo ON eo.event_id = e.id
            JOIN venues v ON v.id = e.venue_id
            WHERE eo.organizer_id = $1
            LIMIT 20
        `, [id]);
        organizer.venues = venuesResult.rows;

        // Source references
        const sourceRefs = await this.pool.query(`
            SELECT so.id, so.source_code, so.source_id as source_organizer_id, so.name,
                   so.description, so.image_url, so.url as content_url,
                   osl.match_confidence as confidence
            FROM organizer_scraped_links osl
            JOIN scraped_organizers so ON so.id = osl.scraped_organizer_id
            WHERE osl.organizer_id = $1
        `, [id]);

        if (sourceRefs.rows.length > 0) {
            organizer.source_references = sourceRefs.rows;
        }

        return organizer;
    }

    async create(data) {
        const { name, description, image_url, website, website_url } = data;
        const finalWebsite = website || website_url;
        const id = uuidv4();

        await this.pool.query(`
            INSERT INTO organizers (id, name, description, image_url, website, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [id, name, description, image_url, finalWebsite]);

        return this.findById(id);
    }

    async update(id, updates) {
        const allowedFields = ['name', 'description', 'image_url', 'website'];
        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (key === 'website_url') {
                setClauses.push(`website = $${paramIndex++}`);
                values.push(value);
            } else if (allowedFields.includes(key)) {
                setClauses.push(`${key} = $${paramIndex++}`);
                values.push(value);
            }
        }

        if (setClauses.length === 0) return await this.findById(id);

        setClauses.push('updated_at = CURRENT_TIMESTAMP');

        // Correct logic: don't set ID, just use it in WHERE
        const whereClause = `WHERE id = $${paramIndex}`;
        values.push(id);

        const result = await this.pool.query(`
            UPDATE organizers SET ${setClauses.join(', ')} ${whereClause} RETURNING *
        `, values);

        return result.rows[0];
    }

    async delete(id) {
        const result = await this.pool.query('DELETE FROM organizers WHERE id = $1 RETURNING id', [id]);
        return result.rows.length > 0;
    }

    async match(options) {
        return await matchAndLinkOrganizers(options);
    }
}

module.exports = new OrganizerService();
