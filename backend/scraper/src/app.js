const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const cron = require('node-cron');
const { initializeDatabase } = require('./db/init');
const { pool } = require('./db'); // Ensure pool is available
const cityRoutes = require('./routes/cityRoutes');
const eventRoutes = require('./routes/eventRoutes');
const venueRoutes = require('./routes/venueRoutes');
const artistRoutes = require('./routes/artistRoutes');
const organizerRoutes = require('./routes/organizerRoutes');
const authRoutes = require('./routes/authRoutes');
const statsRoutes = require('./routes/statsRoutes');
const scrapedRoutes = require('./routes/scrapedRoutes');

const { scrapeResidentAdvisor, scrapeTM, getConfiguredCities } = require('./services/scraperService');
const { processScrapedEvents, logScrapeHistory } = require('./services/scraperProcessor');
const { matchAndLinkEvents, matchAndLinkArtists, matchAndLinkVenues, matchAndLinkOrganizers, autoEnrichArtists } = require('./services/matchingService');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.url}`);
    next();
});

// Serve static files (flyers usually) if any, or frontend build if serving from here
// server.js didn't show specific static serving other than frontend?
// Keeping it simple.

// Database Init
initializeDatabase()
    .then(async () => {
        // Run migrations
        try {
            const { migrate } = require('../migrate');
            await migrate();
        } catch (e) {
            console.error('Migration error:', e);
        }

        const { ensureDefaultUsers } = require('./controllers/authController');
        return ensureDefaultUsers();
    })
    .catch(err => console.error('Database initialization failed:', err));

// Routes
app.use('/db/cities', cityRoutes);
app.use('/db/events', eventRoutes);
app.use('/db/venues', venueRoutes);
app.use('/db/artists', artistRoutes);
app.use('/db/organizers', organizerRoutes);
app.use('/auth', authRoutes);
app.use('/db/users', require('./routes/userRoutes'));
app.get('/db/countries', require('./controllers/cityController').getCountries);
app.use('/db', statsRoutes); // Mount at /db to match /db/stats
app.use('/db/guest-users', require('./routes/adminGuestRoutes'));
app.use('/db/moderation', require('./routes/adminModerationRoutes'));
app.use('/scraped', scrapedRoutes);
app.use('/db/search', require('./routes/searchRoutes'));
app.get('/search/external', require('./controllers/externalSearchController').search);

// Guest App API
app.use('/api/guest/chat', require('./routes/chatRoutes'));
app.use('/api/guest', require('./routes/guestUserRoutes'));


// Scraping Routes (Manual Triggers)
// Scraping Routes (Manual Triggers)
app.get('/scrape/cities', async (req, res) => {
    const cities = await getConfiguredCities();
    res.json(cities);
});

app.get('/scrape/history', async (req, res) => {
    try {
        const { days = 7, groupBy = 'day' } = req.query;
        // Validate days is a number
        const daysInt = parseInt(days) || 7;

        const result = await pool.query(`
            SELECT 
                DATE_TRUNC($1, created_at) as timestamp,
                SUM(events_fetched) as events_fetched,
                SUM(events_inserted) as events_inserted,
                SUM(events_updated) as events_updated,
                SUM(venues_created) as venues_created,
                SUM(artists_created) as artists_created,
                SUM(COALESCE((metadata->>'venues_updated')::int, 0)) as venues_updated,
                SUM(COALESCE((metadata->>'artists_updated')::int, 0)) as artists_updated,
                SUM(COALESCE((metadata->>'organizers_created')::int, 0)) as organizers_created,
                SUM(COALESCE((metadata->>'organizers_updated')::int, 0)) as organizers_updated,
                COUNT(*) as scrape_count
            FROM scrape_history
            WHERE created_at > NOW() - ($2 || ' days')::INTERVAL
            GROUP BY 1
            ORDER BY 1 DESC
        `, [groupBy, daysInt]);

        res.json({ data: result.rows });
    } catch (e) {
        console.error('History fetch error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/scrape/recent', async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const result = await pool.query(`
        SELECT * FROM scrape_history 
            ORDER BY created_at DESC 
            LIMIT $1
        `, [parseInt(limit) || 20]);
        res.json({ data: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Sources Routes
app.get('/db/sources', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM event_sources ORDER BY name');
        res.json({ data: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/db/sources/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Allowed fields
    const allowed = ['is_active', 'enabled_scopes'];
    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of Object.keys(updates)) {
        if (allowed.includes(key)) {
            fields.push(`${key} = $${idx++} `);
            values.push(key === 'enabled_scopes' ? JSON.stringify(updates[key]) : updates[key]);
        }
    }

    if (fields.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(id);

    try {
        const result = await pool.query(
            `UPDATE event_sources SET ${fields.join(', ')} WHERE id = $${idx} RETURNING * `,
            values
        );
        res.json(result.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Manual Scrape Endpoint
app.post('/scrape/run', async (req, res) => {
    const { city, source, limit, fullScrape } = req.body;

    // Non-blocking response
    res.json({ success: true, message: `Scraping started for ${source} in ${city}` });

    try {
        const startTime = Date.now();
        let events = [];
        let error = null;

        console.log(`[Manual Scrape] Starting ${source} for ${city}`);

        // Get config for scopes
        const { getCitySourceConfig } = require('./services/scraperService');
        const config = await getCitySourceConfig(city, source);
        const scopes = config ? config.enabled_scopes : ['event', 'venue', 'artist', 'organizer'];

        try {
            if (source === 'ra') {
                events = await scrapeResidentAdvisor(city, { limit });
            } else if (source === 'tm') {
                events = await scrapeTM(city, { limit });
            } else {
                throw new Error(`Unknown source: ${source} `);
            }

            const stats = await processScrapedEvents(events, { geocodeMissing: true, scopes });

            await logScrapeHistory({
                city,
                source_code: source,
                events_fetched: events.length,
                events_inserted: stats.inserted,
                events_updated: stats.updated,
                venues_created: stats.venuesCreated,
                artists_created: stats.artistsCreated,
                duration_ms: Date.now() - startTime,
                scrape_type: 'manual'
            });

            console.log(`[Manual Scrape] Completed ${source} for ${city}: ${events.length} events processed.`);

            // Trigger matching to ensure events are linked immediately
            console.log('[Manual Scrape] Running matching...');
            await matchAndLinkEvents();
            await matchAndLinkArtists();
            await matchAndLinkVenues();
            await matchAndLinkOrganizers();
            console.log('[Manual Scrape] Matching completed.');

        } catch (e) {
            console.error(`[Manual Scrape]Error: ${e.message} `);
            await logScrapeHistory({
                city,
                source_code: source,
                error: e.message,
                duration_ms: Date.now() - startTime,
                scrape_type: 'manual'
            });
        }

    } catch (e) {
        console.error('Unhandled error in scrape run:', e);
    }
});

app.post('/scrape/match', async (req, res) => {
    res.json({ success: true, message: 'Matching started' });
    try {
        console.log('[Manual Match] Starting matching...');
        await matchAndLinkEvents();
        await matchAndLinkArtists();
        await matchAndLinkVenues();
        await matchAndLinkOrganizers();
        console.log('[Manual Match] Matching completed.');
    } catch (e) {
        console.error('[Manual Match] Error:', e);
    }
});

app.post('/sync/pipeline', async (req, res) => {
    const { cities, sources, enrichAfter, dedupeAfter } = req.body;

    if (isScrapingRunning) {
        return res.status(409).json({ success: false, message: 'Scrape already in progress' });
    }

    isScrapingRunning = true;

    // Non-blocking
    res.json({ success: true, message: 'Sync pipeline started' });

    console.log('[Sync Pipeline] Starting...', { cities, sources });

    try {
        const startTime = Date.now();

        // 1. Scrape specified cities & sources
        for (const city of cities) {
            for (const source of sources) {
                try {
                    console.log(`[Sync Pipeline] Scraping ${source} for ${city}...`);
                    let events = [];
                    // Get config for scopes per city/source
                    const { getCitySourceConfig } = require('./services/scraperService');
                    const config = await getCitySourceConfig(city, source);
                    const scopes = config ? config.enabled_scopes : ['event', 'venue', 'artist', 'organizer'];

                    if (source === 'ra') {
                        events = await scrapeResidentAdvisor(city, { limit: 20 });
                    } else if (source === 'tm') {
                        events = await scrapeTM(city, { limit: 20 });
                    }

                    if (events.length > 0) {
                        const stats = await processScrapedEvents(events, { geocodeMissing: true, scopes });
                        await logScrapeHistory({
                            city,
                            source_code: source,
                            events_fetched: events.length,
                            events_inserted: stats.inserted,
                            events_updated: stats.updated,
                            venues_created: stats.venuesCreated,
                            artists_created: stats.artistsCreated,
                            scrape_type: 'manual',
                            duration_ms: Date.now() - startTime
                        });
                    }
                } catch (e) {
                    console.error(`[Sync Pipeline]Error scraping ${city} / ${source}: `, e);
                }
            }
        }

        // 2. Match
        console.log('[Sync Pipeline] Running matching...');
        await matchAndLinkEvents();
        await matchAndLinkArtists();
        await matchAndLinkVenues();
        await matchAndLinkOrganizers();

        if (enrichAfter !== false) {
            await autoEnrichArtists();
        }

        console.log('[Sync Pipeline] Completed.');

    } catch (e) {
        console.error('[Sync Pipeline] Error:', e);
    } finally {
        isScrapingRunning = false;
    }
});


// Auto-Scrape Scheduler
let autoScrapeEnabled = true;
let isScrapingRunning = false;

app.get('/scrape/status', (req, res) => {
    res.json({ autoScrapeEnabled, isRunning: isScrapingRunning });
});

app.get('/scrape/stats', async (req, res) => {
    try {
        const [
            mainEvents,
            pendingEvents,
            mainVenues,
            mainArtists,
            scrapedEvents,
            scrapedArtists
        ] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM events'), // Total approved/published events? No, total events table.
            pool.query("SELECT COUNT(*) FROM events WHERE publish_status = 'pending'"),
            pool.query('SELECT COUNT(*) FROM venues'),
            pool.query('SELECT COUNT(*) FROM artists'),
            pool.query('SELECT source_code, COUNT(*) FROM scraped_events GROUP BY source_code'),
            pool.query('SELECT source_code, COUNT(*) FROM scraped_artists GROUP BY source_code') // or just artists where source='sp'
        ]);

        // Helper to get count from grouped query
        const getCount = (rows, code) => {
            const row = rows.find(r => r.source_code === code);
            return row ? parseInt(row.count) : 0;
        };

        const raEvents = getCount(scrapedEvents.rows, 'ra');
        const tmEvents = getCount(scrapedEvents.rows, 'tm') + getCount(scrapedEvents.rows, 'ticketmaster'); // Handle legacy if any
        const spotifyArtists = getCount(scrapedArtists.rows, 'sp') + getCount(scrapedArtists.rows, 'spotify');

        // Also approved events for the stat card
        const approvedEvents = await pool.query("SELECT COUNT(*) FROM events WHERE publish_status = 'approved'");

        res.json({
            total_main_events: parseInt(mainEvents.rows[0].count),
            total_main_venues: parseInt(mainVenues.rows[0].count),
            total_main_artists: parseInt(mainArtists.rows[0].count),
            pending_events: parseInt(pendingEvents.rows[0].count),
            approved_events: parseInt(approvedEvents.rows[0].count),
            ra_events: raEvents,
            ticketmaster_events: tmEvents, // Maintaining key for frontend compat
            spotify_artists: spotifyArtists
        });
    } catch (e) {
        console.error('Stats error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/scrape/toggle', (req, res) => {
    const { enabled } = req.body;
    autoScrapeEnabled = enabled;
    res.json({ autoScrapeEnabled, isRunning: isScrapingRunning });
});


async function performAutoScrape() {
    if (!autoScrapeEnabled) {
        console.log('[Auto-Scrape] Skipped - disabled');
        return;
    }

    if (isScrapingRunning) {
        console.log('[Auto-Scrape] Skipped - already running');
        return;
    }

    isScrapingRunning = true;
    console.log('[Auto-Scrape] Starting scheduled scrape...');

    try {
        // Fetch all configured cities dynamically
        const allCities = await getConfiguredCities();

        for (const cityConfig of allCities) {
            const city = cityConfig.key; // Lowercase key/name

            // Loop through configured sources for this city
            // Updated structure: sources is an object where value contains { isActive, enabledScopes, externalId }
            for (const [source, sourceConfig] of Object.entries(cityConfig.sources)) {

                // Backward compatibility or new structure check
                const isActive = typeof sourceConfig === 'boolean' ? sourceConfig : sourceConfig.isActive;
                const scopes = (typeof sourceConfig === 'object' && sourceConfig.enabledScopes)
                    ? sourceConfig.enabledScopes
                    : ['event', 'venue', 'artist', 'organizer'];

                if (!isActive) continue;

                try {
                    console.log(`[Auto - Scrape] Scraping ${source} for ${city}...`);
                    const startTime = Date.now();
                    let events = [];

                    if (source === 'ra') {
                        events = await scrapeResidentAdvisor(city, { limit: 20 });
                    } else if (source === 'tm') {
                        events = await scrapeTM(city, { limit: 20 });
                    }

                    const stats = await processScrapedEvents(events, { geocodeMissing: true, scopes });

                    await logScrapeHistory({
                        city,
                        source_code: source,
                        events_fetched: events.length,
                        events_inserted: stats.inserted,
                        events_updated: stats.updated,
                        venues_created: stats.venuesCreated,
                        artists_created: stats.artistsCreated,
                        scrape_type: 'scheduled',
                        duration_ms: Date.now() - startTime
                    });

                    // Wait to be nice
                    await new Promise(r => setTimeout(r, 5000));

                } catch (err) {
                    console.error(`[Auto - Scrape] Error ${source}/${city}:`, err.message);
                    await logScrapeHistory({
                        city,
                        source_code: source,
                        error: err.message,
                        scrape_type: 'scheduled'
                    });
                }
            }
        }

        // Run Matching
        console.log('[Auto-Scrape] Running matching...');
        await matchAndLinkEvents();
        await matchAndLinkArtists();
        await matchAndLinkVenues();
        await matchAndLinkOrganizers();
        await autoEnrichArtists();
        console.log('[Auto-Scrape] Matching completed.');
    } catch (e) {
        console.error('[Auto-Scrape] Error:', e);
    } finally {
        isScrapingRunning = false;
    }
}

// Schedule: Daily at 2 AM
cron.schedule('0 2 * * *', () => {
    performAutoScrape();
});

const globalErrorHandler = require('./controllers/errorController');
const AppError = require('./utils/AppError');

// ... (existing routes)

// Handle 404 for undefined routes
app.all('*', (req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handling Middleware
app.use(globalErrorHandler);

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
}

module.exports = app;
