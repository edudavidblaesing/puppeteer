const { pool } = require('../../db');
const { v4: uuidv4 } = require('uuid');
const { saveOriginalEntry } = require('../../services/unifiedService');

class ArtistService {
    constructor() {
        this.pool = pool;
    }

    async findArtists(params = {}) {
        const { search, limit = 100, offset = 0, source } = params;

        let query = `
            SELECT a.*, 
                (
                    SELECT json_agg(json_build_object(
                        'source_code', sa.source_code, 
                        'id', sa.id,
                        'name', sa.name,
                        'country', sa.country,
                        'bio', sa.bio,
                        'genres', sa.genres,
                        'image_url', sa.image_url,
                        'content_url', sa.content_url,
                        'artist_type', sa.artist_type,
                        'first_name', sa.first_name,
                        'last_name', sa.last_name,
                        'website', sa.website_url,
                        'facebook_url', sa.facebook_url,
                        'twitter_url', sa.twitter_url,
                        'instagram_url', sa.instagram_url,
                        'soundcloud_url', sa.soundcloud_url,
                        'bandcamp_url', sa.bandcamp_url,
                        'discogs_url', sa.discogs_url,
                        'spotify_url', sa.spotify_url
                    ))
                    FROM artist_scraped_links asl
                    JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                    WHERE asl.artist_id = a.id
                ) as source_references
            FROM artists a
            WHERE 1=1
        `;
        const queryParams = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND a.name ILIKE $${paramIndex}`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        if (source) {
            query += ` AND EXISTS (
                SELECT 1 FROM artist_scraped_links asl
                JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                WHERE asl.artist_id = a.id AND sa.source_code = $${paramIndex}
            )`;
            queryParams.push(source);
            paramIndex++;
        }

        query += ` ORDER BY a.name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        queryParams.push(parseInt(limit), parseInt(offset));

        const result = await this.pool.query(query, queryParams);
        return result.rows;
    }

    async countArtists(params = {}) {
        const { search, source } = params;

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

        const result = await this.pool.query(countQuery, countParams);
        return parseInt(result.rows[0].count);
    }

    async getUsage(id) {
        const result = await this.pool.query(`
            SELECT COUNT(*) as count 
            FROM event_artists 
            WHERE artist_id = $1
        `, [id]);
        return parseInt(result.rows[0].count);
    }

    async findById(id) {
        const result = await this.pool.query('SELECT * FROM artists WHERE id = $1', [id]);
        if (result.rows.length === 0) return null;

        const artist = result.rows[0];

        // Get events
        const eventsResult = await this.pool.query(`
            SELECT e.id, e.title, e.date, e.venue_name, e.venue_city
            FROM events e
            JOIN event_artists ea ON ea.event_id = e.id
            WHERE ea.artist_id = $1
            ORDER BY e.date DESC
            LIMIT 20
        `, [id]);
        artist.events = eventsResult.rows;

        // Get source references
        const sourceRefs = await this.pool.query(`
            SELECT sa.id, sa.source_code, sa.source_artist_id, sa.name,
                   sa.genres, sa.image_url, sa.content_url, sa.bio, sa.country,
                   sa.first_name, sa.last_name, sa.website_url as website,
                   sa.facebook_url, sa.twitter_url, sa.instagram_url,
                   sa.soundcloud_url, sa.bandcamp_url, sa.discogs_url, sa.spotify_url,
                   asl.match_confidence as confidence
            FROM artist_scraped_links asl
            JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
            WHERE asl.artist_id = $1
        `, [id]);
        artist.source_references = sourceRefs.rows;

        return artist;
    }

    async create(data, user) {
        const { name, country, genres, image_url, content_url, artist_type, bio } = data;
        const id = uuidv4();

        // 1. Save as Original Source
        const { scrapedId } = await saveOriginalEntry('artist', {
            name, country, genres, image_url, content_url, id: `manual_${Date.now()}`
        });

        // 2. Create Unified Artist
        await this.pool.query(`
            INSERT INTO artists (id, name, country, content_url, image_url, artist_type, genres, bio, created_at, updated_at, source_code)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $9)
        `, [id, name, country, content_url, image_url, artist_type || null, Array.isArray(genres) ? JSON.stringify(genres) : genres, bio || null, 'manual']);

        // 3. Link
        await this.pool.query(`
            INSERT INTO artist_scraped_links (artist_id, scraped_artist_id, match_confidence, is_primary)
            VALUES ($1, $2, 1.0, true)
        `, [id, scrapedId]);

        // Audit Log
        const auditChanges = {};
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && value !== null && value !== '') {
                auditChanges[key] = { old: null, new: value };
            }
        }
        await this.pool.query(`
            INSERT INTO audit_logs (entity_type, entity_id, action, changes, performed_by)
            VALUES ($1, $2, $3, $4, $5)
        `, ['artist', id, 'CREATE', JSON.stringify(auditChanges), user?.id || 'admin']);

        return this.findById(id);
    }

    async update(id, updates, user) {
        const currentRes = await this.pool.query('SELECT * FROM artists WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) return null;
        const currentArtist = currentRes.rows[0];

        const fieldSources = currentArtist.field_sources || {};
        const allowedFields = ['name', 'country', 'content_url', 'image_url', 'artist_type', 'genres', 'bio'];
        const setClauses = [];
        const values = [];
        let paramIndex = 1;
        const changes = {};

        // Pre-process updates
        if (updates.website_url !== undefined) {
            updates.content_url = updates.website_url;
            delete updates.website_url;
        }
        if (updates.website !== undefined) {
            updates.content_url = updates.website;
            delete updates.website;
        }

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                // Normalize for comparison (JSON stringify for arrays/objects)
                const oldVal = currentArtist[key];
                const newVal = key === 'genres' && Array.isArray(value) ? JSON.stringify(value) : value;

                // Compare (simple string comparison works for most)
                const sOld = JSON.stringify(oldVal);
                const sNew = JSON.stringify(newVal);

                if (sOld !== sNew) {
                    changes[key] = { old: oldVal, new: newVal };
                }

                fieldSources[key] = 'og';
                setClauses.push(`${key} = $${paramIndex++}`);
                values.push(newVal);
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
            `, ['artist', id, 'UPDATE', JSON.stringify(changes), user?.id || 'admin']);
        }

        const result = await this.pool.query(`
            UPDATE artists SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *
        `, values);

        return result.rows[0];
    }

    async update(id, updates, user) {
        // ... (previous update logic is fine, just ensuring context)
        return this.findById(id);
        // Note: I am not replacing the whole update method, just using this as context anchor?
        // Actually I should just append getHistory and replace delete.
    }

    // ... wait, I can't just append blocks without context. 
    // I will replace delete/deleteAll and add getHistory.

    async delete(id, user) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Audit Log
            await client.query(`
                INSERT INTO audit_logs (entity_type, entity_id, action, changes, performed_by)
                VALUES ($1, $2, $3, $4, $5)
            `, ['artist', id, 'DELETE', '{}', user?.id || 'admin']);

            // 2. Remove from Event Artists (Cascade-like behavior)
            await client.query('DELETE FROM event_artists WHERE artist_id = $1', [id]);

            // 3. Delete Artist
            const result = await client.query('DELETE FROM artists WHERE id = $1 RETURNING id', [id]);

            await client.query('COMMIT');
            return result.rows.length > 0;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async getHistory(id) {
        const result = await this.pool.query(`
            SELECT al.id, al.action, al.changes, 
                   COALESCE(u.username, al.performed_by) as performed_by, 
                   al.created_at, 'content' as type
            FROM audit_logs al
            LEFT JOIN admin_users u ON u.id::text = al.performed_by
            WHERE al.entity_type = 'artist' AND al.entity_id = $1::text
            ORDER BY al.created_at DESC
        `, [id]);

        return result.rows.map(r => ({
            ...r,
            changes: r.changes || {}
        }));
    }

    async deleteAll() {
        const result = await this.pool.query('DELETE FROM artists RETURNING id');
        return result.rowCount;
    }

    async bulkDelete(ids) {
        const result = await this.pool.query(
            'DELETE FROM artists WHERE id = ANY($1::text[]) RETURNING id',
            [ids]
        );
        return result.rows.length;
    }

    async findMissing() {
        const eventArtistsResult = await this.pool.query(`
            SELECT DISTINCT unnest(string_to_array(artists, ', ')) as artist_name
            FROM events
            WHERE artists IS NOT NULL AND artists != ''
        `);

        const existingArtistsResult = await this.pool.query('SELECT LOWER(name) as name FROM artists');
        const existingNames = new Set(existingArtistsResult.rows.map(r => r.name));

        const missing = eventArtistsResult.rows
            .filter(r => r.artist_name && !existingNames.has(r.artist_name.toLowerCase()))
            .map(r => r.artist_name);

        return missing;
    }

    async searchByName(name) {
        if (!name) return [];
        const result = await this.pool.query(`
            SELECT id, name FROM artists 
            WHERE name ILIKE $1 
            ORDER BY name LIMIT 10
        `, [`%${name}%`]);
        return result.rows;
    }


}

module.exports = new ArtistService();
