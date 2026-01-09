const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { db: { initializeDatabase }, AppError, globalErrorHandler } = require('@social-events/shared');
// globalErrorHandler might not be exported yet, I need to check. 
// Assuming I will update shared index to export it if it's in shared? 
// Actually errorController was in controllers which I copied to API. So I can require it locally.

const cityRoutes = require('./routes/cityRoutes');
const eventRoutes = require('./routes/eventRoutes');
const venueRoutes = require('./routes/venueRoutes');
const artistRoutes = require('./routes/artistRoutes');
const organizerRoutes = require('./routes/organizerRoutes');
const authRoutes = require('./routes/authRoutes');
const statsRoutes = require('./routes/statsRoutes');
const scrapedRoutes = require('./routes/scrapedRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.use((req, res, next) => {
    console.log(`[API Request] ${req.method} ${req.url}`);
    next();
});

// Database Init
initializeDatabase()
    .then(async () => {
        const { ensureDefaultUsers } = require('./controllers/authController');
        await ensureDefaultUsers();
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
app.use('/db', statsRoutes);
app.use('/db/guest-users', require('./routes/adminGuestRoutes'));
app.use('/db/moderation', require('./routes/adminModerationRoutes'));
app.use('/scraped', scrapedRoutes);
app.use('/db/search', require('./routes/searchRoutes'));
app.get('/search/external', require('./controllers/externalSearchController').search);

// Guest App API
app.use('/api/guest/chat', require('./routes/chatRoutes'));
app.use('/api/guest', require('./routes/guestUserRoutes'));

// --- Proxy to Scraper Service (Port 3008) ---
console.log(`[DEBUG] SCRAPER_URL Env Var: '${process.env.SCRAPER_URL}'`);
const SCRAPER_SERVICE_URL = process.env.SCRAPER_URL || 'http://localhost:3008';
console.log(`[DEBUG] Final SCRAPER_SERVICE_URL: '${SCRAPER_SERVICE_URL}'`);

const proxyToScraper = async (req, res) => {
    try {
        const url = `${SCRAPER_SERVICE_URL}${req.originalUrl}`;
        // Normalize headers? default node-fetch handles it?
        const response = await fetch(url, {
            method: req.method,
            headers: { 'Content-Type': 'application/json' },
            body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (e) {
        console.error('Scraper Proxy Error:', e);
        res.status(502).json({ error: 'Scraper service unavailable' });
    }
};

app.get('/scrape/cities', proxyToScraper);
app.get('/scrape/history', proxyToScraper);
app.get('/scrape/recent', proxyToScraper);
app.get('/scrape/status', proxyToScraper);
app.get('/scrape/stats', proxyToScraper); // Or keep local if it queries DB directly? 
// The original /scrape/stats queried DB. We can keep it local if we have DB access.
// But some stats might be scraper specific.
// Let's keep /scrape/stats PROXY for now to separate concerns, or move logic?
// The logic was in app.js, which I am deleting. So I should Proxy.

app.post('/scrape/run', proxyToScraper);
app.post('/scrape/match', proxyToScraper);
app.post('/scrape/toggle', proxyToScraper);
app.post('/sync/pipeline', proxyToScraper);
app.post('/scrape/deduplicate', proxyToScraper);

// Sources - DB access, can stay local or proxy?
// app.js defined sources routes.
app.get('/db/sources', async (req, res) => {
    const { db: { pool } } = require('@social-events/shared');
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
    const { db: { pool } } = require('@social-events/shared');

    // Logic inline or move to controller? Keeping inline for simplicity matching original app.js
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
    if (fields.length === 0) return res.status(400).json({ error: 'No valid fields' });
    values.push(id);
    try {
        const result = await pool.query(`UPDATE event_sources SET ${fields.join(', ')} WHERE id = $${idx} RETURNING * `, values);
        res.json(result.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// Error Handling
app.all('*', (req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(require('./controllers/errorController'));

module.exports = app;
