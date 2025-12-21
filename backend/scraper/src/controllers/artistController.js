const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { saveOriginalEntry, linkToUnified } = require('../services/unifiedService');
const { matchAndLinkArtists, refreshMainArtist, autoEnrichArtists } = require('../services/matchingService');
const { searchArtist, getArtistDetails } = require('../services/musicBrainzService');

// ============================================
// ARTIST OPERATIONS
// ============================================

const listArtists = async (req, res) => {
    try {
        const { search, limit = 100, offset = 0, source } = req.query;

        let query = `
            SELECT a.*, 
                (
                    SELECT json_agg(json_build_object(
                        'source_code', sa.source_code, 
                        'id', sa.id,
                        'name', sa.name,
                        'bio', sa.bio,
                        'genres', sa.genres,
                        'image_url', sa.image_url,
                        'content_url', sa.content_url,
                        'artist_type', sa.artist_type
                    ))
                    FROM artist_scraped_links asl
                    JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                    WHERE asl.artist_id = a.id
                ) as source_references
            FROM artists a
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND a.name ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (source) {
            query += ` AND EXISTS (
                SELECT 1 FROM artist_scraped_links asl
                JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                WHERE asl.artist_id = a.id AND sa.source_code = $${paramIndex}
            )`;
            params.push(source);
            paramIndex++;
        }

        query += ` ORDER BY a.name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM artists a WHERE 1=1';
        let countParams = [];
        let countParamIndex = 1;

        if (search) {
            countQuery += ` AND a.name ILIKE $${countParamIndex}`;
            countParams.push(`%${search}%`);
            countParamIndex++;
        }

        if (source) {
            countQuery += ` AND EXISTS (
                SELECT 1 FROM artist_scraped_links asl
                JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                WHERE asl.artist_id = a.id AND sa.source_code = $${countParamIndex}
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

const getArtist = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM artists WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Artist not found' });
        }

        const artist = result.rows[0];

        // Get recent events for this artist
        const eventsResult = await pool.query(`
            SELECT e.id, e.title, e.date, e.venue_name, e.venue_city
            FROM events e
            JOIN event_artists ea ON ea.event_id = e.id
            WHERE ea.artist_id = $1
            ORDER BY e.date DESC
            LIMIT 20
        `, [req.params.id]);
        artist.events = eventsResult.rows;

        // Source references
        try {
            const sourceRefs = await pool.query(`
                SELECT sa.id, sa.source_code, sa.source_artist_id, sa.name,
                       sa.genres, sa.image_url, sa.content_url,
                       asl.match_confidence as confidence
                FROM artist_scraped_links asl
                JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                WHERE asl.artist_id = $1
            `, [req.params.id]);

            if (sourceRefs.rows.length > 0) {
                artist.source_references = sourceRefs.rows;
            } else {
                // Fallback to unified logic if needed (legacy)
                const unifiedCheck = await pool.query('SELECT * FROM unified_artists WHERE id = $1', [req.params.id]);
                if (unifiedCheck.rows.length > 0) {
                    const sourceRefsOld = await pool.query(`
                        SELECT sa.id, sa.source_code, sa.source_artist_id, sa.name,
                            sa.genres, sa.image_url, sa.content_url,
                            asl.match_confidence as confidence
                        FROM artist_source_links asl
                        JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                        WHERE asl.unified_artist_id = $1
                    `, [req.params.id]);
                    artist.source_references = sourceRefsOld.rows;
                }
            }
        } catch (e) {
            console.log('Error fetching artist sources', e.message);
        }

        res.json(artist);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getMissingArtists = async (req, res) => {
    try {
        // Get all unique artist names from events
        const eventArtistsResult = await pool.query(`
            SELECT DISTINCT unnest(string_to_array(artists, ', ')) as artist_name
            FROM events
            WHERE artists IS NOT NULL AND artists != ''
        `);

        // Get all artist names from artists table
        const existingArtistsResult = await pool.query('SELECT LOWER(name) as name FROM artists');
        const existingNames = new Set(existingArtistsResult.rows.map(r => r.name));

        // Find missing
        const missing = eventArtistsResult.rows
            .filter(r => r.artist_name && !existingNames.has(r.artist_name.toLowerCase()))
            .map(r => r.artist_name);

        res.json({ data: missing, total: missing.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createArtist = async (req, res) => {
    try {
        const { name, country, genres, image_url, content_url } = req.body;

        if (!name) return res.status(400).json({ error: 'Name is required' });

        // 1. Save as Original Source
        const { scrapedId } = await saveOriginalEntry('artist', {
            name, country, genres, image_url, content_url, id: `manual_${Date.now()}`
        });

        // 2. Create Unified Artist
        const artistId = uuidv4();

        await pool.query(`
            INSERT INTO artists (id, name, country, content_url, image_url, artist_type, genres, bio, created_at, updated_at, source_code)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $9)
        `, [artistId, name, country, content_url, image_url, req.body.artist_type || null, Array.isArray(genres) ? JSON.stringify(genres) : genres, req.body.bio || null, 'manual']);

        // 3. Link
        await pool.query(`
            INSERT INTO artist_source_links (unified_artist_id, scraped_artist_id, match_confidence, is_primary, priority)
            VALUES ($1, $2, 1.0, true, 1)
        `, [artistId, scrapedId]);

        const result = await pool.query('SELECT * FROM artists WHERE id = $1', [artistId]);
        res.json({ success: true, artist: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateArtist = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Fetch current field_sources
        const currentRes = await pool.query('SELECT field_sources FROM artists WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) {
            return res.status(404).json({ error: 'Artist not found' });
        }
        const fieldSources = currentRes.rows[0].field_sources || {};

        const allowedFields = ['name', 'country', 'content_url', 'image_url', 'artist_type', 'genres', 'bio'];
        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fieldSources[key] = 'og';
                setClauses.push(`${key} = $${paramIndex++}`);
                values.push(key === 'genres' && Array.isArray(value) ? JSON.stringify(value) : value);
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
            UPDATE artists SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *
        `, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Artist not found' });
        }

        res.json({ success: true, artist: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deleteArtist = async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM artists WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Artist not found' });
        }
        res.json({ success: true, deleted: req.params.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deleteArtists = async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM artists RETURNING id');
        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const bulkDeleteArtists = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids must be a non-empty array' });
        }

        const result = await pool.query(
            'DELETE FROM artists WHERE id = ANY($1::text[]) RETURNING id',
            [ids]
        );

        res.json({ success: true, deleted: result.rows.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const matchArtists = async (req, res) => {
    try {
        const { dryRun = false, minConfidence = 0.7 } = req.body;
        const result = await matchAndLinkArtists({ dryRun, minConfidence });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const enrichArtists = async (req, res) => {
    try {
        await autoEnrichArtists();
        res.json({ success: true, message: 'Enrichment started' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const enrichArtist = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Get Artist
        const artistRes = await pool.query('SELECT name, country FROM artists WHERE id = $1', [id]);
        if (artistRes.rows.length === 0) return res.status(404).json({ error: 'Artist not found' });
        const { name, country } = artistRes.rows[0];

        // 2. Search MB
        const searchResults = await searchArtist(name, country);
        if (searchResults.length === 0) {
            return res.json({ success: false, message: 'No matches found on MusicBrainz' });
        }

        // Use best match
        const bestMatch = searchResults[0];

        // 3. Get Details
        const details = await getArtistDetails(bestMatch.id);

        // 4. Upsert Scraped Artist
        const scrapedRes = await pool.query(`
            INSERT INTO scraped_artists (
                source_code, source_artist_id, name, country, artist_type, 
                genres, image_url, content_url, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
            ON CONFLICT (source_code, source_artist_id) DO UPDATE SET
                name = EXCLUDED.name,
                country = EXCLUDED.country,
                artist_type = EXCLUDED.artist_type,
                genres = EXCLUDED.genres,
                image_url = EXCLUDED.image_url,
                content_url = EXCLUDED.content_url,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `, [
            'mb',
            details.source_artist_id,
            details.name,
            details.country,
            details.artist_type,
            JSON.stringify(details.genres_list),
            null,
            details.content_url
        ]);

        const scrapedId = scrapedRes.rows[0].id;

        // 5. Link
        await pool.query(`
            INSERT INTO artist_scraped_links (artist_id, scraped_artist_id, match_confidence)
            VALUES ($1, $2, 1.0)
            ON CONFLICT (artist_id, scraped_artist_id) DO UPDATE SET match_confidence = 1.0
        `, [id, scrapedId]);

        // 6. Refresh Main Artist
        await refreshMainArtist(id);

        const updatedArtist = await pool.query('SELECT * FROM artists WHERE id = $1', [id]);

        res.json({ success: true, artist: updatedArtist.rows[0], source_data: details });
    } catch (error) {
        console.error('Enrichment failed:', error);
        res.status(500).json({ error: error.message });
    }
};

const searchArtists = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json([]);

        const result = await pool.query(`
            SELECT id, name FROM artists 
            WHERE name ILIKE $1 
            ORDER BY name LIMIT 10
        `, [`%${q}%`]);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    listArtists,
    getArtist,
    getMissingArtists,
    createArtist,
    updateArtist,
    deleteArtist,
    deleteArtists,
    bulkDeleteArtists,
    matchArtists,
    enrichArtist,
    matchArtists,
    enrichArtist,
    enrichArtists,
    searchArtists
};
