const { pool } = require('../db');

exports.getScrapedEvents = async (req, res) => {
    try {
        const { limit = 50, offset = 0, source, city, linked } = req.query;
        let query = `SELECT se.* FROM scraped_events se`;
        const params = [];
        const conditions = [];

        if (source) {
            conditions.push(`se.source_code = $${params.length + 1}`);
            params.push(source);
        }
        if (city && city !== 'all') {
            conditions.push(`LOWER(se.venue_city) = LOWER($${params.length + 1})`);
            params.push(city);
        }

        if (linked === 'true') {
            conditions.push(`EXISTS (SELECT 1 FROM event_scraped_links esl WHERE esl.scraped_event_id = se.id)`);
        } else if (linked === 'false') {
            conditions.push(`NOT EXISTS (SELECT 1 FROM event_scraped_links esl WHERE esl.scraped_event_id = se.id)`);
        }

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        // Apply ordering - newest first
        query += ` ORDER BY se.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        res.json({ data: result.rows });
    } catch (e) {
        console.error('getScrapedEvents error:', e);
        res.status(500).json({ error: e.message });
    }
};
