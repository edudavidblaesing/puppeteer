const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { saveOriginalEntry, linkToUnified } = require('../services/unifiedService');
const { matchAndLinkArtists, refreshMainArtist } = require('../services/matchingService');
const { searchArtist, getArtistDetails } = require('../services/musicBrainzService');

// ============================================
// ARTIST OPERATIONS
// ============================================

const listArtists = async (req, res) => {
    try {
        const { search, limit = 100, offset = 0 } = req.query;

        let query = 'SELECT * FROM artists';
        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` WHERE name ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        query += ` ORDER BY name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM artists';
        let countParams = [];
        if (search) {
            countQuery += ' WHERE name ILIKE $1';
            countParams.push(`%${search}%`);
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

        const artistId = uuidv4();

        await pool.query(`
            INSERT INTO artists (id, name, country, content_url, image_url, artist_type, genres, bio, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [artistId, name, country, content_url, image_url, req.body.artist_type || null, genres, req.body.bio || null]);

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

        const allowedFields = ['name', 'country', 'content_url', 'image_url', 'artist_type', 'genres', 'bio'];
        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
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
    searchArtists
};
