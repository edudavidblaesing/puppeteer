const { pool } = require('../db');

exports.getCities = async (req, res) => {
    try {
        const { search, limit = 50, offset = 0, source } = req.query;
        let query = `
            SELECT c.*, 
            (SELECT COUNT(*) FROM events e WHERE e.venue_city = c.name) as event_count,
            (SELECT COUNT(*) FROM venues v WHERE v.city = c.name) as venue_count,
            (
                SELECT COALESCE(json_agg(json_build_object(
                    'source_code', es.code, 
                    'source_name', es.name,
                    'external_id', csc.external_id,
                    'is_active', csc.is_active
                )), '[]')
                FROM city_source_configs csc
                JOIN event_sources es ON es.id = csc.source_id
                WHERE csc.city_id = c.id
            ) as source_references
            FROM cities c
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND (LOWER(c.name) LIKE $${paramIndex} OR LOWER(c.country) LIKE $${paramIndex})`;
            params.push(`%${search.toLowerCase()}%`);
            paramIndex++;
        }

        if (source) {
            query += ` AND EXISTS (
                SELECT 1 FROM city_source_configs csc 
                JOIN event_sources es ON es.id = csc.source_id 
                WHERE csc.city_id = c.id AND es.code = $${paramIndex}
            )`;
            params.push(source);
            paramIndex++;
        }

        query += ` ORDER BY c.name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM cities c WHERE 1=1';
        let countParams = [];
        let countParamIndex = 1;

        if (search) {
            countQuery += ` AND (LOWER(c.name) LIKE $${countParamIndex} OR LOWER(c.country) LIKE $${countParamIndex})`;
            countParams.push(`%${search.toLowerCase()}%`);
            countParamIndex++;
        }

        if (source) {
            countQuery += ` AND EXISTS (
                SELECT 1 FROM city_source_configs csc 
                JOIN event_sources es ON es.id = csc.source_id 
                WHERE csc.city_id = c.id AND es.code = $${countParamIndex}
            )`;
            countParams.push(source);
            countParamIndex++;
        }

        const countResult = await pool.query(countQuery, countParams);

        res.json({
            data: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (e) {
        console.error('Error fetching cities:', e);
        res.status(500).json({ error: e.message });
    }
};

exports.getCity = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM cities WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'City not found' });

        const city = result.rows[0];

        // Fetch source configs
        const configs = await pool.query(`
            SELECT csc.*, es.name as source_name, es.code as source_code 
            FROM city_source_configs csc
            JOIN event_sources es ON es.id = csc.source_id
            WHERE csc.city_id = $1
        `, [id]);

        city.source_configs = configs.rows;

        res.json(city);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.createCity = async (req, res) => {
    const { name, country, latitude, longitude, timezone, is_active, source_configs } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const result = await client.query(
            `INSERT INTO cities (name, country, latitude, longitude, timezone, is_active) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [name, country, latitude, longitude, timezone, is_active !== undefined ? is_active : true]
        );
        const city = result.rows[0];

        if (source_configs && Array.isArray(source_configs)) {
            for (const config of source_configs) {
                if (config.source_id && config.external_id) {
                    await client.query(
                        `INSERT INTO city_source_configs (city_id, source_id, external_id, is_active, config_json)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [city.id, config.source_id, config.external_id, config.is_active ?? true, config.config_json || {}]
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.status(201).json(city);
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
};

exports.updateCity = async (req, res) => {
    const { id } = req.params;
    const { name, country, latitude, longitude, timezone, is_active, source_configs } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const result = await client.query(
            `UPDATE cities 
             SET name = COALESCE($1, name), 
                 country = COALESCE($2, country), 
                 latitude = COALESCE($3, latitude), 
                 longitude = COALESCE($4, longitude), 
                 timezone = COALESCE($5, timezone), 
                 is_active = COALESCE($6, is_active),
                 updated_at = NOW()
             WHERE id = $7 RETURNING *`,
            [name, country, latitude, longitude, timezone, is_active, id]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'City not found' });
        }

        if (source_configs && Array.isArray(source_configs)) {
            for (const config of source_configs) {
                // Upsert config
                await client.query(
                    `INSERT INTO city_source_configs (city_id, source_id, external_id, is_active, config_json)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (city_id, source_id) 
                     DO UPDATE SET external_id = EXCLUDED.external_id, 
                                   is_active = EXCLUDED.is_active,
                                   config_json = EXCLUDED.config_json,
                                   updated_at = NOW()`,
                    [id, config.source_id, config.external_id, config.is_active, config.config_json || {}]
                );
            }
        }

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
};

exports.deleteCity = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM cities WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'City not found' });
        res.json({ success: true, message: 'City deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Dropdown fetch is optimized
exports.getCitiesDropdown = async (req, res) => {
    try {
        const { country } = req.query;
        let query = 'SELECT id, name, country FROM cities WHERE is_active = true';
        const params = [];
        if (country) {
            query += ' AND country = $1';
            params.push(country);
        }
        query += ' ORDER BY name';
        const result = await pool.query(query, params);
        res.json({ data: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Get distinct countries for dropdown
exports.getCountries = async (req, res) => {
    try {
        // ideally we would use a library or a full table of countries.
        // For now, let's return distinct countries from cities + a hardcoded list of common ones
        // or just return a standard list.
        const result = await pool.query('SELECT DISTINCT country FROM cities WHERE country IS NOT NULL ORDER BY country');

        // If we want a richer list, we can augment this.
        // Assuming country column stores country CODES or NAMES.
        // Let's assume they are codes or names.

        // Let's just return what is in the DB for now to unblock.
        const dbCountries = result.rows.map(r => ({ name: r.country, code: r.country }));

        res.json({ data: dbCountries });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
