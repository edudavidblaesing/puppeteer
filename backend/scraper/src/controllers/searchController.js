const { pool } = require('../db');

const searchAll = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.json({ events: [], venues: [], artists: [], organizers: [], cities: [] });
        }

        const searchTerm = `%${q}%`;
        const limit = 5;

        const [events, venues, artists, organizers, cities] = await Promise.all([
            // Events
            pool.query(`
                SELECT id, title as name, date, start_time, venue_name, 'event' as type, flyer_front 
                FROM events 
                WHERE title ILIKE $1 
                ORDER BY date DESC LIMIT $2`,
                [searchTerm, limit]
            ),
            // Venues
            pool.query(`
                SELECT id, name, city, 'venue' as type 
                FROM venues 
                WHERE name ILIKE $1 
                ORDER BY name ASC LIMIT $2`,
                [searchTerm, limit]
            ),
            // Artists
            pool.query(`
                SELECT id, name, image_url, 'artist' as type 
                FROM artists 
                WHERE name ILIKE $1 
                ORDER BY name ASC LIMIT $2`,
                [searchTerm, limit]
            ),
            // Organizers
            pool.query(`
                SELECT id, name, image_url, 'organizer' as type 
                FROM organizers 
                WHERE name ILIKE $1 
                ORDER BY name ASC LIMIT $2`,
                [searchTerm, limit]
            ),
            // Cities
            pool.query(`
                SELECT id, name, country, 'city' as type 
                FROM cities 
                WHERE name ILIKE $1 
                ORDER BY name ASC LIMIT $2`,
                [searchTerm, limit]
            )
        ]);

        res.json({
            events: events.rows,
            venues: venues.rows,
            artists: artists.rows,
            organizers: organizers.rows,
            cities: cities.rows
        });

    } catch (error) {
        console.error('Global search error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    searchAll
};
