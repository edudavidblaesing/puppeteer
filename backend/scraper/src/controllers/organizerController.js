const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { matchAndLinkOrganizers } = require('../services/matchingService');

// ============================================
// ORGANIZER OPERATIONS
// ============================================

const listOrganizers = async (req, res) => {
    try {
        const { search, limit = 100, offset = 0, source } = req.query;

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
        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND o.name ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (source) {
            query += ` AND EXISTS (
                SELECT 1 FROM organizer_scraped_links osl
                JOIN scraped_organizers so ON so.id = osl.scraped_organizer_id
                WHERE osl.organizer_id = o.id AND so.source_code = $${paramIndex}
            )`;
            params.push(source);
            paramIndex++;
        }

        query += ` ORDER BY o.name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        // Get total count
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

        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            data: result.rows,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getOrganizer = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM organizers WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Organizer not found' });
        }

        const organizer = result.rows[0];

        // Get recent events for this organizer
        const eventsResult = await pool.query(`
            SELECT e.id, e.title, e.date, e.venue_name, e.venue_city
            FROM events e
            JOIN event_organizers eo ON eo.event_id = e.id
            WHERE eo.organizer_id = $1
            ORDER BY e.date DESC
            LIMIT 20
        `, [req.params.id]);
        organizer.events = eventsResult.rows;

        // Get venues for this organizer (via events)
        const venuesResult = await pool.query(`
            SELECT DISTINCT v.id, v.name, v.city, v.country
            FROM events e
            JOIN event_organizers eo ON eo.event_id = e.id
            JOIN venues v ON v.id = e.venue_id
            WHERE eo.organizer_id = $1
            LIMIT 20
        `, [req.params.id]);
        organizer.venues = venuesResult.rows;

        // Source references
        try {
            const sourceRefs = await pool.query(`
                SELECT so.id, so.source_code, so.source_organizer_id, so.name,
                       so.description, so.image_url, so.url as content_url,
                       osl.match_confidence as confidence
                FROM organizer_scraped_links osl
                JOIN scraped_organizers so ON so.id = osl.scraped_organizer_id
                WHERE osl.organizer_id = $1
            `, [req.params.id]);

            if (sourceRefs.rows.length > 0) {
                organizer.source_references = sourceRefs.rows;
            }
        } catch (e) {
            console.log('Error fetching organizer sources', e.message);
        }

        res.json(organizer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createOrganizer = async (req, res) => {
    try {
        const { name, description, image_url, website, website_url } = req.body;
        const finalWebsite = website || website_url;

        if (!name) return res.status(400).json({ error: 'Name is required' });

        const organizerId = uuidv4();

        await pool.query(`
            INSERT INTO organizers (id, name, description, image_url, website, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [organizerId, name, description, image_url, finalWebsite]);

        const result = await pool.query('SELECT * FROM organizers WHERE id = $1', [organizerId]);
        res.json({ success: true, organizer: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateOrganizer = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

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

        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        const result = await pool.query(`
            UPDATE organizers SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *
        `, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Organizer not found' });
        }

        res.json({ success: true, organizer: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deleteOrganizer = async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM organizers WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Organizer not found' });
        }
        res.json({ success: true, deleted: req.params.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const matchOrganizers = async (req, res) => {
    try {
        const { dryRun = false, minConfidence = 0.7 } = req.body;
        const result = await matchAndLinkOrganizers({ dryRun, minConfidence });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    listOrganizers,
    getOrganizer,
    createOrganizer,
    updateOrganizer,
    deleteOrganizer,
    matchOrganizers
};
