const { pool } = require('../db');

exports.getStats = async (req, res) => {
    try {
        const [events, venues, artists, organizers] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM events'),
            pool.query('SELECT COUNT(*) FROM venues'),
            pool.query('SELECT COUNT(*) FROM artists'),
            pool.query('SELECT COUNT(*) FROM organizers')
        ]);

        // Also get some scraping stats
        const scrapedEvents = await pool.query('SELECT COUNT(*) FROM scraped_events');

        res.json({
            events: parseInt(events.rows[0].count),
            venues: parseInt(venues.rows[0].count),
            artists: parseInt(artists.rows[0].count),
            organizers: parseInt(organizers.rows[0].count),
            scraped_events: parseInt(scrapedEvents.rows[0].count),
            active_scrapers: 2, // Hardcoded active sources (RA, TM) for now or fetch dynamic count
            nextScheduledScrape: (() => {
                const now = new Date();
                const next = new Date();
                next.setHours(2, 0, 0, 0);
                if (now >= next) {
                    next.setDate(next.getDate() + 1);
                }
                return next.toISOString();
            })()
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
};

exports.resetDb = async (req, res) => {
    try {
        console.log('Resetting database...');
        // Truncate main tables and scraped data
        // We exclude cities, users, and source configs as they are "system configuration"
        await pool.query(`
            TRUNCATE 
                events, venues, artists, organizers, 
                event_artists, event_organizers, 
                scraped_events, scraped_venues, scraped_artists, scraped_organizers,
                event_scraped_links, venue_scraped_links, artist_scraped_links, organizer_scraped_links,
                scrape_history 
            RESTART IDENTITY CASCADE
        `);

        // Removed cities truncation to preserve configuration as promised in UI

        res.json({ success: true, message: 'Database cleared successfully' });
    } catch (error) {
        console.error('Error resetting database:', error);
        res.status(500).json({ error: 'Failed to reset database' });
    }
};
