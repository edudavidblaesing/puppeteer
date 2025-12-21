const { pool } = require('../db');

exports.getStats = async (req, res) => {
    try {
        // 1. Event Status Counts
        const statusCounts = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE publish_status = 'approved') as approved,
                COUNT(*) FILTER (WHERE publish_status = 'pending') as pending,
                COUNT(*) FILTER (WHERE publish_status = 'rejected') as rejected,
                COUNT(*) FILTER (WHERE publish_status = 'approved' AND date >= CURRENT_DATE) as active
            FROM events
        `);

        // 2. Recent Activity (New & Updated)
        const activityStats = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as new_24h,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as new_7d,
                COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '24 hours') as updated_24h
            FROM events
        `);

        // 3. Entity Counts
        const [venues, artists, organizers] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM venues'),
            pool.query('SELECT COUNT(*) FROM artists'),
            pool.query('SELECT COUNT(*) FROM organizers')
        ]);

        // 4. Scraping Stats
        // Get last successful scrape time from history or scraped_events
        const lastScrapeRes = await pool.query(`
            SELECT MAX(created_at) as last_run 
            FROM scrape_history 
            WHERE error IS NULL
        `);

        // Fallback to scraped_events if history is empty
        let lastRun = lastScrapeRes.rows[0].last_run;
        if (!lastRun) {
            const lastUpdateRes = await pool.query('SELECT MAX(updated_at) as last_run FROM scraped_events');
            lastRun = lastUpdateRes.rows[0].last_run;
        }

        const scrapedStats = await pool.query(`
            SELECT COUNT(*) as total,
                   COUNT(*) FILTER (WHERE scraped_at >= NOW() - INTERVAL '24 hours') as new_24h
            FROM scraped_events
        `);

        res.json({
            events: {
                total: parseInt(statusCounts.rows[0].total),
                approved: parseInt(statusCounts.rows[0].approved),
                pending: parseInt(statusCounts.rows[0].pending),
                rejected: parseInt(statusCounts.rows[0].rejected),
                active: parseInt(statusCounts.rows[0].active),
                new_24h: parseInt(activityStats.rows[0].new_24h),
                new_7d: parseInt(activityStats.rows[0].new_7d),
                updated_24h: parseInt(activityStats.rows[0].updated_24h)
            },
            venues: parseInt(venues.rows[0].count),
            artists: parseInt(artists.rows[0].count),
            organizers: parseInt(organizers.rows[0].count),
            scraping: {
                total: parseInt(scrapedStats.rows[0].total),
                new_24h: parseInt(scrapedStats.rows[0].new_24h),
                last_run: lastRun || null,
                active_sources: ['ra', 'tm', 'sp'], // TODO: dynamic
                next_scheduled: (() => {
                    const now = new Date();
                    const next = new Date();
                    next.setHours(2, 0, 0, 0); // 2 AM
                    if (now >= next) next.setDate(next.getDate() + 1);
                    return next.toISOString();
                })()
            }
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
