const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const TelegramBot = require('node-telegram-bot-api');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Database configuration
const DB_CONFIG = {
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'eventuser',
    password: process.env.PGPASSWORD || 'eventpassword',
    database: process.env.PGDATABASE || 'socialevents'
};

// Global pool - will be initialized after database setup
let pool = null;

// ============================================
// DATABASE INITIALIZATION
// ============================================

async function initializeDatabase() {
    console.log('[DB Init] Starting database initialization...');

    // Try connecting with postgres superuser first (for Docker), fall back to regular user
    const adminUser = process.env.POSTGRES_USER || 'postgres';
    const adminPassword = process.env.POSTGRES_PASSWORD || DB_CONFIG.password;
    
    let adminPool = new Pool({
        host: DB_CONFIG.host,
        port: DB_CONFIG.port,
        user: adminUser,
        password: adminPassword,
        database: 'postgres' // Connect to default postgres database
    });

    try {
        // Check if our database exists
        const dbCheck = await adminPool.query(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            [DB_CONFIG.database]
        );

        if (dbCheck.rows.length === 0) {
            console.log(`[DB Init] Database '${DB_CONFIG.database}' does not exist. Creating...`);
            await adminPool.query(`CREATE DATABASE ${DB_CONFIG.database}`);
            console.log(`[DB Init] Database '${DB_CONFIG.database}' created successfully`);
            
            // Grant privileges to the app user if different from admin
            if (adminUser !== DB_CONFIG.user) {
                await adminPool.query(`GRANT ALL PRIVILEGES ON DATABASE ${DB_CONFIG.database} TO ${DB_CONFIG.user}`);
                console.log(`[DB Init] Granted privileges to user '${DB_CONFIG.user}'`);
            }
        } else {
            console.log(`[DB Init] Database '${DB_CONFIG.database}' exists`);
        }
    } catch (error) {
        console.error('[DB Init] Error with admin connection:', error.message);
        
        // If admin connection failed, try with the regular user
        console.log('[DB Init] Trying connection with regular user...');
        await adminPool.end();
        
        adminPool = new Pool({
            host: DB_CONFIG.host,
            port: DB_CONFIG.port,
            user: DB_CONFIG.user,
            password: DB_CONFIG.password,
            database: 'postgres'
        });
        
        try {
            const dbCheck = await adminPool.query(
                "SELECT 1 FROM pg_database WHERE datname = $1",
                [DB_CONFIG.database]
            );

            if (dbCheck.rows.length === 0) {
                console.log(`[DB Init] Database '${DB_CONFIG.database}' does not exist. Creating with regular user...`);
                await adminPool.query(`CREATE DATABASE ${DB_CONFIG.database}`);
                console.log(`[DB Init] Database '${DB_CONFIG.database}' created successfully`);
            }
        } catch (innerError) {
            console.error('[DB Init] Could not create database with regular user either:', innerError.message);
            console.error('[DB Init] Please create the database manually or ensure user has CREATEDB privilege');
            throw innerError;
        }
    } finally {
        await adminPool.end();
    }

    // Now connect to our actual database
    pool = new Pool({
        host: DB_CONFIG.host,
        port: DB_CONFIG.port,
        user: DB_CONFIG.user,
        password: DB_CONFIG.password,
        database: DB_CONFIG.database
    });

    // Run migrations
    await runMigrations();

    console.log('[DB Init] Database initialization complete');
}

async function runMigrations() {
    console.log('[DB Init] Running migrations...');

    // Create migrations tracking table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Get list of applied migrations
    const applied = await pool.query('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(applied.rows.map(r => r.version));

    // Get migration files
    const migrationsDir = path.join(__dirname, 'migrations');

    if (!fs.existsSync(migrationsDir)) {
        console.log('[DB Init] No migrations directory found, skipping migrations');
        return;
    }

    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    for (const file of files) {
        const version = file.replace('.sql', '');

        if (appliedVersions.has(version)) {
            console.log(`[DB Init] Migration ${version} already applied, skipping`);
            continue;
        }

        console.log(`[DB Init] Applying migration: ${version}`);

        try {
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            await pool.query(sql);
            await pool.query(
                'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
                [version]
            );
            console.log(`[DB Init] Migration ${version} applied successfully`);
        } catch (error) {
            console.error(`[DB Init] Migration ${version} failed:`, error.message);
            // Continue with other migrations - some may depend on tables that already exist
        }
    }

    console.log('[DB Init] Migrations complete');
}

// Configure stealth plugin with all evasions
const stealth = StealthPlugin();
puppeteer.use(stealth);

const app = express();
app.use(bodyParser.json());

// CORS middleware - allow admin dashboard
app.use((req, res, next) => {
    const allowedOrigins = [
        'https://eventadmin.davidblaesing.com',
        'http://localhost:3000',
        'http://localhost:3008'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// API Key authentication middleware
const API_KEY = process.env.API_KEY || 'default-dev-key-change-in-production';

function requireApiKey(req, res, next) {
    const providedKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!providedKey || providedKey !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    }
    next();
}

// Apply API key auth to all /db/* routes
app.use('/db', requireApiKey);

// ============================================
// GEOCODING UTILITY
// ============================================

// Geocode address using Nominatim (OpenStreetMap - free, no API key)
async function geocodeAddress(address, city, country) {
    if (!address && !city) return null;
    
    try {
        // Clean up address to avoid redundancy
        let cleanAddress = address || '';
        
        // Remove postal codes and country from address if already included
        // e.g., "Street 123, 20359 Hamburg, Germany" -> "Street 123"
        if (city && cleanAddress.toLowerCase().includes(city.toLowerCase())) {
            // Split on commas or semicolons and take only parts before city mention
            const parts = cleanAddress.split(/[,;]/);
            const cityIndex = parts.findIndex(p => p.trim().toLowerCase().includes(city.toLowerCase()));
            if (cityIndex > 0) {
                cleanAddress = parts.slice(0, cityIndex).join(',').trim();
            }
        }
        
        // Build search query - avoid duplicating city/country
        const parts = [cleanAddress, city, country].filter(Boolean);
        const searchQuery = parts.join(', ');
        const query = encodeURIComponent(searchQuery);
        
        // Use curl via exec for reliability (works in any Node version)
        const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
        const curlCmd = `curl -s -m 5 -H "User-Agent: SocialEvents/1.0" "${url}"`;
        
        const { stdout, stderr } = await execAsync(curlCmd);
        
        if (stderr) {
            console.error('[Geocoding] curl error:', stderr);
            return null;
        }
        
        const result = JSON.parse(stdout);
        
        if (result && result.length > 0) {
            return {
                latitude: parseFloat(result[0].lat),
                longitude: parseFloat(result[0].lon)
            };
        }
        
        return null;
    } catch (error) {
        console.error('[Geocoding] Error:', error.message);
        return null;
    }
}

// ============================================
// AUTHENTICATION ENDPOINTS
// ============================================

// Initialize default admin user if none exists
async function initializeDefaultAdmin() {
    try {
        console.log('[Auth] Initializing admin users...');

        // Check if admin_users table exists
        const tableExists = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'admin_users'
            );
        `);

        if (!tableExists.rows[0].exists) {
            // Create admin_users table
            console.log('[Auth] Creating admin_users table...');
            await pool.query(`
                CREATE TABLE admin_users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log('[Auth] Created admin_users table');
        } else {
            console.log('[Auth] admin_users table already exists');
        }

        // Check if any admin users exist
        const userCount = await pool.query('SELECT COUNT(*) FROM admin_users');
        console.log(`[Auth] Found ${userCount.rows[0].count} admin users`);

        if (parseInt(userCount.rows[0].count) === 0) {
            // Create default admin user
            console.log('[Auth] Creating default admin user...');
            const defaultPassword = 'TheKey4u';
            const passwordHash = await bcrypt.hash(defaultPassword, 10);

            await pool.query(
                'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)',
                ['admin', passwordHash]
            );
            console.log('[Auth] Created default admin user (username: admin, password: TheKey4u)');
        }

        console.log('[Auth] Admin initialization complete');
    } catch (error) {
        console.error('[Auth] Error initializing default admin:', error.message, error.stack);
    }
}

// JWT token verification middleware
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}

// Login endpoint
app.post('/auth/login', async (req, res) => {
    try {
        console.log('[Auth] Login attempt received');
        const { username, password } = req.body;

        if (!username || !password) {
            console.log('[Auth] Missing username or password');
            return res.status(400).json({ error: 'Username and password are required' });
        }

        console.log(`[Auth] Looking up user: ${username}`);

        // Find user
        const result = await pool.query(
            'SELECT id, username, password_hash FROM admin_users WHERE username = $1',
            [username]
        );

        console.log(`[Auth] Found ${result.rows.length} users`);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Verify password
        console.log('[Auth] Verifying password...');
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            console.log('[Auth] Invalid password');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log('[Auth] Password valid, generating token...');

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log('[Auth] Login successful');

        res.json({
            success: true,
            token,
            user: { id: user.id, username: user.username }
        });
    } catch (error) {
        console.error('[Auth] Login error:', error.message, error.stack);
        res.status(500).json({ error: 'Login failed: ' + error.message });
    }
});

// Check auth status endpoint
app.get('/auth/check', verifyToken, (req, res) => {
    res.json({
        success: true,
        user: { id: req.user.id, username: req.user.username }
    });
});

// Logout endpoint (client-side token removal, but we can log it)
app.post('/auth/logout', verifyToken, (req, res) => {
    // In a more complete implementation, you might want to blacklist the token
    res.json({ success: true, message: 'Logged out successfully' });
});

// Change password endpoint
app.post('/auth/change-password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        // Get current user
        const result = await pool.query(
            'SELECT password_hash FROM admin_users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, result.rows[0].password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Hash new password and update
        const newHash = await bcrypt.hash(newPassword, 10);

        await pool.query(
            'UPDATE admin_users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newHash, req.user.id]
        );

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// ============== SQL Query Endpoint (Admin Only) ==============
// Execute raw SQL queries for debugging and fixes
app.post('/admin/sql', verifyToken, async (req, res) => {
    try {
        const { query, params = [] } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        console.log(`[Admin SQL] Executing query: ${query.substring(0, 200)}...`);

        const result = await pool.query(query, params);

        res.json({
            success: true,
            rowCount: result.rowCount,
            rows: result.rows,
            fields: result.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID }))
        });
    } catch (error) {
        console.error('[Admin SQL] Error:', error.message);
        res.status(500).json({
            error: error.message,
            detail: error.detail,
            hint: error.hint
        });
    }
});

// Geocoding using OpenStreetMap Nominatim (free, rate-limited to 1 req/sec)
const geocodeCache = new Map();
const GEOCODE_DELAY = 1100; // ms between requests to respect rate limit
let lastGeocodeTime = 0;

async function geocodeAddress(address, city, country) {
    if (!address && !city) return null;

    // Clean and normalize address components
    const cleanString = (str) => {
        if (!str) return '';
        return str
            .trim()
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/[,;]+/g, ',') // Normalize separators (semicolons to commas)
            .replace(/,+/g, ',') // Remove duplicate commas
            .replace(/^,|,$/g, ''); // Remove leading/trailing commas
    };

    let cleanAddr = cleanString(address);
    const cleanCity = cleanString(city);
    const cleanCountry = cleanString(country);

    // Parse address that might contain: "Street; District; Postal City; Country"
    // Example: "Rigaer Strasse 31; Friedrichshain; 10247 Berlin; Germany"
    if (cleanAddr) {
        const parts = cleanAddr.split(',').map(p => p.trim()).filter(Boolean);
        
        // Remove parts that match city or country
        const filteredParts = parts.filter(part => {
            const partLower = part.toLowerCase();
            
            // Remove if it's just the city name
            if (cleanCity && partLower === cleanCity.toLowerCase()) {
                return false;
            }
            
            // Remove if it's just the country name
            if (cleanCountry && partLower === cleanCountry.toLowerCase()) {
                return false;
            }
            
            // Remove if it contains "postal code + city" and we have the city separately
            if (cleanCity) {
                const cityPattern = new RegExp(`\\b\\d{4,5}\\s+${cleanCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                if (cityPattern.test(part)) {
                    return false;
                }
            }
            
            // Remove if part ends with city or country
            if (cleanCity && partLower.endsWith(cleanCity.toLowerCase())) {
                // Check if it's postal + city pattern like "10247 Berlin"
                const withoutCity = part.slice(0, -(cleanCity.length)).trim();
                // If what remains is just a postal code, keep the postal code
                if (/^\d{4,5}$/.test(withoutCity)) {
                    return true; // Keep the part, we'll extract postal later
                }
                return false;
            }
            
            return true;
        });
        
        // Extract street address (usually first part) and postal code
        const streetPart = filteredParts[0] || '';
        const postalMatch = cleanAddr.match(/\b(\d{4,5})\b/);
        const postal = postalMatch ? postalMatch[1] : '';
        
        // Rebuild clean address: Street, Postal (if found)
        const addressParts = [streetPart, postal].filter(Boolean);
        cleanAddr = addressParts.join(' ').trim();
        
        // Final cleanup
        cleanAddr = cleanAddr.replace(/[,;]+$/, '').trim();
    }

    const fullAddress = [cleanAddr, cleanCity, cleanCountry].filter(Boolean).join(', ');

    // Check cache first
    if (geocodeCache.has(fullAddress)) {
        return geocodeCache.get(fullAddress);
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastGeocodeTime;
    if (timeSinceLastRequest < GEOCODE_DELAY) {
        await new Promise(resolve => setTimeout(resolve, GEOCODE_DELAY - timeSinceLastRequest));
    }
    lastGeocodeTime = Date.now();

    try {
        // Try multiple search strategies
        const searchStrategies = [
            [cleanAddr, cleanCity, cleanCountry].filter(Boolean).join(', '), // Full address
            [cleanAddr, cleanCity].filter(Boolean).join(', '), // Address + City only
            [cleanCity, cleanCountry].filter(Boolean).join(', ') // City + Country fallback
        ].filter(s => s.length > 0);

        for (const searchAddress of searchStrategies) {
            const query = encodeURIComponent(searchAddress);
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
                {
                    headers: {
                        'User-Agent': 'SocialEventsAdmin/1.0 (contact@example.com)'
                    }
                }
            );

            if (!response.ok) {
                console.warn(`Geocoding failed for "${searchAddress}": ${response.status}`);
                continue;
            }

            const data = await response.json();

            if (data && data.length > 0) {
                const result = {
                    latitude: parseFloat(data[0].lat),
                    longitude: parseFloat(data[0].lon)
                };
                geocodeCache.set(fullAddress, result);
                console.log(`Geocoded "${searchAddress}" -> ${result.latitude}, ${result.longitude}`);
                return result;
            }

            // Small delay between strategies
            if (searchStrategies.indexOf(searchAddress) < searchStrategies.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        geocodeCache.set(fullAddress, null);
        console.warn(`Could not geocode any strategy for: ${fullAddress}`);
        return null;
    } catch (error) {
        console.error(`Geocoding error for "${fullAddress}":`, error.message);
        return null;
    }
}

// Proxy rotation configuration
const PROXY_LIST = [
    '77.105.137.42:8080',
    '109.111.166.40:8080',
    '188.132.222.2:8080',
    '170.0.11.11:8080',
    '38.156.72.10:8080',
    '149.40.26.240:8080',
    '183.88.213.178:8080',
    '61.91.202.211:8080',
    '202.5.62.55:8080',
    '36.91.220.132:8080',
    '103.81.194.120:8080',
    '49.156.44.117:8080',
    '102.23.239.2:8080',
    '190.97.254.180:8080',
    '181.78.202.29:8080'
];

let blockedProxies = new Set();
let currentProxyIndex = 0;
let currentProxy = null;

function getNextProxy() {
    // Find next non-blocked proxy
    let attempts = 0;
    while (attempts < PROXY_LIST.length) {
        const proxy = PROXY_LIST[currentProxyIndex];
        currentProxyIndex = (currentProxyIndex + 1) % PROXY_LIST.length;

        if (!blockedProxies.has(proxy)) {
            return proxy;
        }
        attempts++;
    }

    // All proxies blocked, reset and try again
    console.log('All proxies blocked, resetting blocked list...');
    blockedProxies.clear();
    return PROXY_LIST[0];
}

function markProxyBlocked(proxy) {
    blockedProxies.add(proxy);
    console.log(`Proxy ${proxy} marked as BLOCKED. Blocked proxies: ${blockedProxies.size}/${PROXY_LIST.length}`);
}

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        browser: browser ? 'launched' : 'not-launched',
        currentProxy: currentProxy,
        blockedProxies: Array.from(blockedProxies),
        availableProxies: PROXY_LIST.filter(p => !blockedProxies.has(p)).length
    });
});

// Endpoint to get proxy status
app.get('/proxy-status', (req, res) => {
    res.json({
        currentProxy,
        blockedProxies: Array.from(blockedProxies),
        availableProxies: PROXY_LIST.filter(p => !blockedProxies.has(p)),
        totalProxies: PROXY_LIST.length
    });
});

// Endpoint to manually rotate proxy
app.post('/rotate-proxy', async (req, res) => {
    if (browser) {
        await browser.close();
        browser = null;
        page = null;
        browserPromise = null;
    }
    currentProxy = getNextProxy();
    res.json({ message: 'Proxy rotated', newProxy: currentProxy });
});

// Endpoint to disable proxy entirely
app.post('/disable-proxy', async (req, res) => {
    if (browser) {
        await browser.close();
        browser = null;
        page = null;
        browserPromise = null;
    }
    currentProxy = 'NONE';
    res.json({ message: 'Proxy disabled - using direct connection', currentProxy: 'NONE' });
});

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let bot = null;
if (TELEGRAM_TOKEN) {
    bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
}

let browser = null;
let page = null;
let browserPromise = null;

// Auto-scrape scheduling
let nextScheduledScrape = null;
let autoScrapeEnabled = true; // Can be toggled via API
const CITIES_TO_SCRAPE = ['berlin', 'hamburg']; // Cities to auto-scrape
const SOURCES_TO_SCRAPE = ['ra']; // Sources to auto-scrape

async function initBrowser(forceNewProxy = false) {
    if (browser && !forceNewProxy) return browser;

    // Close existing browser if forcing new proxy
    if (browser && forceNewProxy) {
        await browser.close();
        browser = null;
        page = null;
        browserPromise = null;
    }

    if (browserPromise && !forceNewProxy) return browserPromise;

    console.log('Launching browser...');

    // Get proxy - either from env or rotate from list
    const envProxy = process.env.PROXY_SERVER;
    if (!currentProxy || forceNewProxy) {
        currentProxy = envProxy || getNextProxy();
    }

    browserPromise = (async () => {
        try {
            const launchArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--window-size=1920,1080',
                '--remote-debugging-port=9222',
                '--remote-debugging-address=0.0.0.0'
            ];

            // Add proxy (skip if NONE)
            if (currentProxy && currentProxy !== 'NONE') {
                const proxyUrl = currentProxy.startsWith('http') ? currentProxy : `http://${currentProxy}`;
                launchArgs.push(`--proxy-server=${proxyUrl}`);
                console.log(`Using proxy: ${currentProxy}`);
            } else {
                console.log('Using DIRECT connection (no proxy)');
            }

            const b = await puppeteer.launch({
                headless: 'new',
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                dumpio: true,
                ignoreHTTPSErrors: true,
                args: launchArgs
            });

            const p = await b.newPage();

            // Set a realistic user agent
            await p.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            await p.setViewport({ width: 1920, height: 1080 });

            // Set default headers
            await p.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            });

            // Override webdriver detection
            await p.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                // Override the plugins array
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5]
                });
                // Override languages
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en']
                });
            });

            browser = b;
            page = p;
            console.log('Browser launched and ready for debugging on port 9222');
            return b;
        } catch (err) {
            console.error('Failed to launch browser:', err);
            browserPromise = null;
            throw err;
        }
    })();

    return browserPromise;
}

// Check if page is blocked and return block type
async function checkBlocked(page) {
    const title = await page.title();
    const content = await page.content();
    const url = page.url();

    // Check for various block indicators
    if (content.includes('Access blocked') || content.includes('Access denied')) {
        return { blocked: true, type: 'access_blocked', message: 'Access blocked by DataDome' };
    }
    if (content.includes('Verification Required') && content.includes('captcha-delivery')) {
        return { blocked: true, type: 'captcha', message: 'CAPTCHA verification required' };
    }
    if (title.includes('Just a moment') || content.includes('captcha-delivery')) {
        return { blocked: true, type: 'captcha', message: 'Cloudflare/DataDome challenge' };
    }
    if (content.includes('unusual activity') || content.includes('bot activity')) {
        return { blocked: true, type: 'bot_detected', message: 'Bot activity detected' };
    }
    if (content.includes('403') && content.includes('Forbidden')) {
        return { blocked: true, type: 'forbidden', message: '403 Forbidden' };
    }

    return { blocked: false };
}

async function checkCaptcha(page) {
    const blockStatus = await checkBlocked(page);

    if (blockStatus.blocked) {
        console.log(`Block detected: ${blockStatus.type} - ${blockStatus.message}`);
        console.log(`Current proxy: ${currentProxy}`);

        // Mark current proxy as blocked
        if (currentProxy) {
            markProxyBlocked(currentProxy);
        }

        if (bot && TELEGRAM_CHAT_ID) {
            const screenshot = await page.screenshot();
            await bot.sendPhoto(TELEGRAM_CHAT_ID, screenshot, {
                caption: `${blockStatus.message} on ${page.url()}!\nProxy: ${currentProxy}\n\nCall POST /rotate-proxy to try another proxy.`
            });
        }

        // For CAPTCHA type, wait for manual resolution
        if (blockStatus.type === 'captcha') {
            const CAPTCHA_TIMEOUT = 120000; // 2 minutes
            const timedOut = await waitForResume(CAPTCHA_TIMEOUT);
            if (timedOut) {
                throw new Error(`${blockStatus.message} - timed out after 2 minutes. Proxy ${currentProxy} blocked.`);
            }
        } else {
            // For hard blocks, throw immediately
            throw new Error(`${blockStatus.message} - Proxy ${currentProxy} is blocked. Use POST /rotate-proxy to try another.`);
        }
    }
}

let resumeSignal = null;

function waitForResume(timeoutMs = 120000) {
    console.log(`Waiting for resume signal (timeout: ${timeoutMs / 1000}s)...`);
    return new Promise(resolve => {
        const timeout = setTimeout(() => {
            console.log('Captcha wait timed out');
            resumeSignal = null;
            resolve(true); // true = timed out
        }, timeoutMs);

        resumeSignal = () => {
            clearTimeout(timeout);
            resolve(false); // false = resumed successfully
        };
    });
}

app.post('/resume', (req, res) => {
    if (resumeSignal) {
        resumeSignal();
        resumeSignal = null;
        res.json({ status: 'Resumed' });
    } else {
        res.json({ status: 'Not paused' });
    }
});

// Screenshot endpoint to see current browser state
app.get('/screenshot', async (req, res) => {
    try {
        if (!page) {
            await initBrowser();
        }
        const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
        const currentUrl = page.url();
        const title = await page.title();
        res.send(`
            <html>
            <head><title>Browser View</title><meta http-equiv="refresh" content="5"></head>
            <body style="font-family: sans-serif; padding: 20px;">
                <h2>Browser Screenshot (auto-refreshes every 5s)</h2>
                <p><strong>URL:</strong> ${currentUrl}</p>
                <p><strong>Title:</strong> ${title}</p>
                <img src="data:image/png;base64,${screenshot}" style="max-width:100%; border: 1px solid #ccc;"/>
                <hr>
                <h3>Controls:</h3>
                <form action="/navigate" method="POST" style="margin-bottom:10px;">
                    <input type="text" name="url" placeholder="Enter URL to navigate" style="width:400px; padding:5px;">
                    <button type="submit">Go</button>
                </form>
                <form action="/click" method="POST" style="margin-bottom:10px;">
                    <input type="text" name="selector" placeholder="CSS selector to click" style="width:400px; padding:5px;">
                    <button type="submit">Click</button>
                </form>
                <form action="/clickAt" method="POST" style="margin-bottom:10px;">
                    <input type="number" name="x" placeholder="X" style="width:80px; padding:5px;" value="505">
                    <input type="number" name="y" placeholder="Y" style="width:80px; padding:5px;" value="477">
                    <button type="submit">Click at X,Y</button>
                </form>
                <h4>Drag Slider (for CAPTCHA):</h4>
                <form action="/drag" method="POST" style="margin-bottom:10px;">
                    Start: <input type="number" name="startX" placeholder="startX" style="width:60px;" value="505">
                    <input type="number" name="startY" placeholder="startY" style="width:60px;" value="477">
                    End: <input type="number" name="endX" placeholder="endX" style="width:60px;" value="635">
                    <input type="number" name="endY" placeholder="endY" style="width:60px;" value="477">
                    <button type="submit">Drag Slider</button>
                </form>
                <h4>Proxy Controls:</h4>
                <p><strong>Current Proxy:</strong> ${currentProxy || 'None'}</p>
                <p><strong>Blocked Proxies:</strong> ${blockedProxies.size}/${PROXY_LIST.length}</p>
                <button onclick="fetch('/rotate-proxy',{method:'POST'}).then(r=>r.json()).then(d=>{alert('New proxy: '+d.newProxy);location.reload()})">Rotate Proxy</button>
                <button onclick="fetch('/resume',{method:'POST'}).then(()=>location.reload())">Resume (after CAPTCHA)</button>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Navigate to URL
app.post('/navigate', express.urlencoded({ extended: true }), async (req, res) => {
    try {
        if (!page) await initBrowser();
        const url = req.body.url;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        // Wait extra time for JS to execute
        await new Promise(r => setTimeout(r, 3000));
        res.redirect('/screenshot');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Click element
app.post('/click', express.urlencoded({ extended: true }), async (req, res) => {
    try {
        if (!page) return res.status(400).json({ error: 'No page' });
        const selector = req.body.selector;
        await page.click(selector);
        await new Promise(r => setTimeout(r, 1000));
        res.redirect('/screenshot');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Drag slider (for CAPTCHA)
app.post('/drag', express.urlencoded({ extended: true }), async (req, res) => {
    try {
        if (!page) return res.status(400).json({ error: 'No page' });
        const startX = parseInt(req.body.startX) || 505;
        const startY = parseInt(req.body.startY) || 477;
        const endX = parseInt(req.body.endX) || 635;
        const endY = parseInt(req.body.endY) || 477;

        // Perform drag operation
        await page.mouse.move(startX, startY);
        await new Promise(r => setTimeout(r, 100));
        await page.mouse.down();
        await new Promise(r => setTimeout(r, 100));

        // Move in small steps to simulate human
        const steps = 20;
        for (let i = 1; i <= steps; i++) {
            const x = startX + ((endX - startX) * i / steps);
            const y = startY + ((endY - startY) * i / steps);
            await page.mouse.move(x, y);
            await new Promise(r => setTimeout(r, 20 + Math.random() * 30));
        }

        await page.mouse.up();
        await new Promise(r => setTimeout(r, 1000));
        res.redirect('/screenshot');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Click at coordinates
app.post('/clickAt', express.urlencoded({ extended: true }), async (req, res) => {
    try {
        if (!page) return res.status(400).json({ error: 'No page' });
        const x = parseInt(req.body.x);
        const y = parseInt(req.body.y);
        await page.mouse.click(x, y);
        await new Promise(r => setTimeout(r, 500));
        res.redirect('/screenshot');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper to add random delay (human-like behavior)
function randomDelay(min = 1000, max = 3000) {
    return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min) + min)));
}

// Helper to simulate human mouse movement
async function humanLikeNavigation(page, url) {
    console.log(`Navigating to: ${url}`);

    // First navigate to ra.co homepage to establish session
    if (!page.url().includes('ra.co')) {
        await page.goto('https://ra.co', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await randomDelay(2000, 4000);
    }

    // Then navigate to the actual page
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait a bit for any JS to execute
    await randomDelay(1000, 2000);

    // Scroll a bit to simulate human
    await page.evaluate(() => {
        window.scrollBy(0, 100);
    });
    await randomDelay(500, 1000);
}

app.post('/scrape-listings', async (req, res) => {
    try {
        await initBrowser();
        const { areaId, listingDate } = req.body;

        // Construct GraphQL query payload
        const payload = {
            query: `query GET_EVENT_LISTINGS($filters: FilterInputDtoInput, $pageSize: Int, $page: Int) {
                eventListings(filters: $filters, pageSize: $pageSize, page: $page) {
                  data {
                    id
                    event {
                      id
                      title
                      flyerFront
                      date
                      startTime
                      contentUrl
                      venue {
                        id
                        name
                      }
                    }
                  }
                  totalResults
                }
              }`,
            variables: {
                filters: {
                    areas: { eq: areaId },
                    listingDate: listingDate
                },
                pageSize: 20,
                page: 1
            }
        };

        // We need to go to ra.co first to get cookies/tokens
        await page.goto('https://ra.co/events', { waitUntil: 'networkidle0' });
        await checkCaptcha(page);

        // Now perform the fetch inside the page context to use the cookies
        const result = await page.evaluate(async (payload) => {
            const response = await fetch('https://ra.co/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            return response.json();
        }, payload);

        res.json(result);

    } catch (error) {
        console.error(error);
        if (page) {
            const screenshot = await page.screenshot();
            if (bot && TELEGRAM_CHAT_ID) {
                await bot.sendPhoto(TELEGRAM_CHAT_ID, screenshot, { caption: `Error: ${error.message}` });
            }
        }
        res.status(500).json({ error: error.message });
    }
});

// Auto-retry scrape with proxy rotation
app.post('/scrape-event-auto', async (req, res) => {
    const { contentUrl } = req.body;
    const maxRetries = Math.min(PROXY_LIST.length, 5); // Try up to 5 different proxies

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            console.log(`Scrape attempt ${attempt + 1}/${maxRetries} with proxy: ${currentProxy}`);

            await initBrowser(attempt > 0); // Force new proxy on retry
            const url = `https://ra.co${contentUrl}`;

            await humanLikeNavigation(page, url);

            // Check for blocks without waiting for manual intervention
            const blockStatus = await checkBlocked(page);
            if (blockStatus.blocked) {
                console.log(`Blocked on attempt ${attempt + 1}: ${blockStatus.message}`);
                if (currentProxy) {
                    markProxyBlocked(currentProxy);
                }
                continue; // Try next proxy
            }

            // Wait for page to be fully loaded
            await randomDelay(1000, 2000);

            // Extract data from __NEXT_DATA__
            const data = await page.evaluate(() => {
                const script = document.getElementById('__NEXT_DATA__');
                if (script) {
                    return JSON.parse(script.innerHTML);
                }
                return null;
            });

            if (data && data.props && data.props.pageProps && data.props.pageProps.data) {
                return res.json({
                    success: true,
                    proxy: currentProxy,
                    attempts: attempt + 1,
                    data: data.props.pageProps.data
                });
            } else {
                // Check if we got actual content or just empty page
                const content = await page.content();
                if (content.length > 5000 && !content.includes('Verification Required')) {
                    return res.json({
                        success: true,
                        proxy: currentProxy,
                        attempts: attempt + 1,
                        html: content
                    });
                }
                // Page didn't load properly, try next proxy
                console.log(`Page didn't load properly on attempt ${attempt + 1}`);
                if (currentProxy) {
                    markProxyBlocked(currentProxy);
                }
            }
        } catch (error) {
            console.error(`Attempt ${attempt + 1} failed:`, error.message);
            if (currentProxy) {
                markProxyBlocked(currentProxy);
            }
        }
    }

    res.status(500).json({
        error: `Failed after ${maxRetries} attempts`,
        blockedProxies: Array.from(blockedProxies)
    });
});

app.post('/scrape-event', async (req, res) => {
    try {
        await initBrowser();
        const { contentUrl } = req.body;
        const url = `https://ra.co${contentUrl}`;

        await humanLikeNavigation(page, url);
        await checkCaptcha(page);

        // Wait for page to be fully loaded
        await randomDelay(1000, 2000);

        // Extract data from __NEXT_DATA__
        const data = await page.evaluate(() => {
            const script = document.getElementById('__NEXT_DATA__');
            if (script) {
                return JSON.parse(script.innerHTML);
            }
            return null;
        });

        if (data && data.props && data.props.pageProps && data.props.pageProps.data) {
            res.json(data.props.pageProps.data);
        } else {
            // Fallback: return full HTML or specific fields
            const content = await page.content();
            res.json({ html: content }); // Or parse more specific things
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message, proxy: currentProxy });
    }
});

// GraphQL API endpoint - bypasses bot detection entirely!
app.get('/api/event/:id', async (req, res) => {
    try {
        const eventId = req.params.id;
        const query = `
            query GetEvent($id: ID!) {
                event(id: $id) {
                    id
                    title
                    date
                    startTime
                    endTime
                    content
                    contentUrl
                    flyerFront
                    flyerBack
                    isTicketed
                    venue {
                        id
                        name
                        address
                        area {
                            name
                            country {
                                name
                            }
                        }
                    }
                    artists {
                        id
                        name
                    }
                    promoters {
                        id
                        name
                    }
                    tickets {
                        title
                        onSaleFrom
                        onSaleUntil
                    }
                }
            }
        `;

        const response = await fetch('https://ra.co/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://ra.co/'
            },
            body: JSON.stringify({
                query,
                variables: { id: eventId }
            })
        });

        const data = await response.json();

        if (data.errors) {
            return res.status(400).json({ error: data.errors });
        }

        res.json(data.data.event);
    } catch (error) {
        console.error('GraphQL error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search events via GraphQL
app.get('/api/events', async (req, res) => {
    try {
        const { area, startDate, endDate, limit = 20 } = req.query;

        const query = `
            query GetEvents($filters: FilterInputDtoInput, $pageSize: Int) {
                eventListings(filters: $filters, pageSize: $pageSize) {
                    data {
                        event {
                            id
                            title
                            date
                            startTime
                            endTime
                            contentUrl
                            flyerFront
                            content
                            venue {
                                id
                                name
                                address
                                area {
                                    name
                                    country {
                                        name
                                    }
                                }
                            }
                            artists {
                                id
                                name
                            }
                        }
                        listingDate
                    }
                    totalResults
                }
            }
        `;

        const filters = {};
        if (area) filters.areas = { eq: parseInt(area) };

        // Date filter - use listing date range
        const today = new Date().toISOString().split('T')[0];
        filters.listingDate = {
            gte: startDate || today,
            lte: endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        };

        const response = await fetch('https://ra.co/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://ra.co/'
            },
            body: JSON.stringify({
                query,
                variables: { filters, pageSize: parseInt(limit) }
            })
        });

        const data = await response.json();

        if (data.errors) {
            return res.status(400).json({ error: data.errors });
        }

        res.json(data.data.eventListings);
    } catch (error) {
        console.error('GraphQL error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get venue info via GraphQL
app.get('/api/venue/:id', async (req, res) => {
    try {
        const venueId = req.params.id;
        const query = `
            query GetVenue($id: ID!) {
                venue(id: $id) {
                    id
                    name
                    address
                    contentUrl
                    blurb
                    area {
                        id
                        name
                        country {
                            name
                        }
                    }
                }
            }
        `;

        const response = await fetch('https://ra.co/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://ra.co/'
            },
            body: JSON.stringify({
                query,
                variables: { id: venueId }
            })
        });

        const data = await response.json();

        if (data.errors) {
            return res.status(400).json({ error: data.errors });
        }

        if (!data.data.venue) {
            return res.status(404).json({ error: 'Venue not found' });
        }

        // Add full URL
        const venue = data.data.venue;
        venue.url = venue.contentUrl ? `https://ra.co${venue.contentUrl}` : null;

        res.json(venue);
    } catch (error) {
        console.error('GraphQL error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get artist info via GraphQL
app.get('/api/artist/:id', async (req, res) => {
    try {
        const artistId = req.params.id;
        const query = `
            query GetArtist($id: ID!) {
                artist(id: $id) {
                    id
                    name
                    contentUrl
                    country {
                        name
                    }
                }
            }
        `;

        const response = await fetch('https://ra.co/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://ra.co/'
            },
            body: JSON.stringify({
                query,
                variables: { id: artistId }
            })
        });

        const data = await response.json();

        if (data.errors) {
            return res.status(400).json({ error: data.errors });
        }

        if (!data.data.artist) {
            return res.status(404).json({ error: 'Artist not found' });
        }

        // Add full URL
        const artist = data.data.artist;
        artist.url = artist.contentUrl ? `https://ra.co${artist.contentUrl}` : null;

        res.json(artist);
    } catch (error) {
        console.error('GraphQL error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List venues by area (most popular)
app.get('/api/venues', async (req, res) => {
    try {
        const { area, limit = 20 } = req.query;

        if (!area) {
            return res.status(400).json({ error: 'Query parameter "area" is required (e.g., 34 for Berlin)' });
        }

        const query = `
            query GetVenues($areaId: ID!, $limit: Int) {
                venues(orderBy: POPULAR, areaId: $areaId, limit: $limit) {
                    id
                    name
                    address
                    contentUrl
                    blurb
                    area {
                        name
                        country {
                            name
                        }
                    }
                }
            }
        `;

        const response = await fetch('https://ra.co/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://ra.co/'
            },
            body: JSON.stringify({
                query,
                variables: { areaId: area, limit: parseInt(limit) }
            })
        });

        const data = await response.json();

        if (data.errors) {
            return res.status(400).json({ error: data.errors });
        }

        // Add full URLs
        const venues = (data.data.venues || []).map(venue => ({
            ...venue,
            url: venue.contentUrl ? `https://ra.co${venue.contentUrl}` : null
        }));

        res.json({ data: venues });
    } catch (error) {
        console.error('GraphQL error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// DATABASE ENDPOINTS
// ============================================

// Create a single event
app.post('/db/events/create', async (req, res) => {
    try {
        const { title, date, start_time, venue_name, venue_city, venue_country, venue_address, artists, description, content_url, flyer_front, is_published, event_type } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        // Generate a unique ID
        const id = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Try to find or link venue
        let venueId = null;
        if (venue_name) {
            const venueResult = await pool.query(
                `SELECT id FROM venues WHERE LOWER(name) = LOWER($1) AND LOWER(city) = LOWER($2) LIMIT 1`,
                [venue_name, venue_city || '']
            );
            if (venueResult.rows.length > 0) {
                venueId = venueResult.rows[0].id;
            }
        }

        const result = await pool.query(`
            INSERT INTO events (
                id, title, date, start_time, venue_id, venue_name, venue_address, 
                venue_city, venue_country, artists, description, content_url, 
                flyer_front, is_published, event_type, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
            RETURNING *
        `, [
            id,
            title,
            date || null,
            start_time || null,
            venueId,
            venue_name || null,
            venue_address || null,
            venue_city || null,
            venue_country || null,
            artists || null,
            description || null,
            content_url || null,
            flyer_front || null,
            is_published || false,
            event_type || 'event'
        ]);

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Create event error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Upsert events to database
app.post('/db/events', async (req, res) => {
    try {
        const events = req.body.events || req.body;

        if (!Array.isArray(events)) {
            return res.status(400).json({ error: 'Expected array of events' });
        }

        let inserted = 0;
        let updated = 0;
        let errors = [];

        for (const event of events) {
            try {
                const result = await pool.query(`
                    INSERT INTO events (
                        id, title, date, start_time, end_time, content_url,
                        flyer_front, description, venue_id, venue_name,
                        venue_address, venue_city, venue_country, artists, listing_date
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    ON CONFLICT (id) DO UPDATE SET
                        title = CASE WHEN events.publish_status = 'approved' THEN events.title ELSE EXCLUDED.title END,
                        date = CASE WHEN events.publish_status = 'approved' THEN events.date ELSE EXCLUDED.date END,
                        start_time = CASE WHEN events.publish_status = 'approved' THEN events.start_time ELSE EXCLUDED.start_time END,
                        end_time = CASE WHEN events.publish_status = 'approved' THEN events.end_time ELSE EXCLUDED.end_time END,
                        content_url = CASE WHEN events.publish_status = 'approved' THEN events.content_url ELSE EXCLUDED.content_url END,
                        flyer_front = CASE WHEN events.publish_status = 'approved' THEN events.flyer_front ELSE EXCLUDED.flyer_front END,
                        description = CASE WHEN events.publish_status = 'approved' THEN events.description ELSE EXCLUDED.description END,
                        venue_id = CASE WHEN events.publish_status = 'approved' THEN events.venue_id ELSE EXCLUDED.venue_id END,
                        venue_name = CASE WHEN events.publish_status = 'approved' THEN events.venue_name ELSE EXCLUDED.venue_name END,
                        venue_address = CASE WHEN events.publish_status = 'approved' THEN events.venue_address ELSE EXCLUDED.venue_address END,
                        venue_city = CASE WHEN events.publish_status = 'approved' THEN events.venue_city ELSE EXCLUDED.venue_city END,
                        venue_country = CASE WHEN events.publish_status = 'approved' THEN events.venue_country ELSE EXCLUDED.venue_country END,
                        artists = CASE WHEN events.publish_status = 'approved' THEN events.artists ELSE EXCLUDED.artists END,
                        listing_date = EXCLUDED.listing_date,
                        updated_at = CASE WHEN events.publish_status = 'approved' THEN events.updated_at ELSE CURRENT_TIMESTAMP END
                    RETURNING (xmax = 0) AS inserted
                `, [
                    event.id,
                    event.title,
                    event.date || null,
                    event.startTime || event.start_time || null,
                    event.endTime || event.end_time || null,
                    event.contentUrl || event.content_url || null,
                    event.flyerFront || event.flyer_front || null,
                    event.description || null,
                    event.venueId || event.venue_id || null,
                    event.venueName || event.venue_name || null,
                    event.venueAddress || event.venue_address || null,
                    event.venueCity || event.venue_city || null,
                    event.venueCountry || event.venue_country || null,
                    event.artists || null,
                    event.listingDate || event.listing_date || null
                ]);

                if (result.rows[0].inserted) {
                    inserted++;
                } else {
                    updated++;
                }
            } catch (err) {
                errors.push({ id: event.id, error: err.message });
            }
        }

        res.json({
            success: true,
            inserted,
            updated,
            total: events.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get events from database
app.get('/db/events', async (req, res) => {
    try {
        const { city, search, limit = 100, offset = 0, from, to, status, showPast } = req.query;

        let query = `
            SELECT e.*, 
                   v.latitude as venue_latitude,
                   v.longitude as venue_longitude,
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'id', se.id,
                           'source_code', se.source_code,
                           'title', se.title,
                           'confidence', esl.match_confidence
                       ))
                       FROM event_scraped_links esl
                       JOIN scraped_events se ON se.id = esl.scraped_event_id
                       WHERE esl.event_id = e.id),
                       '[]'
                   ) as source_references
            FROM events e
            LEFT JOIN venues v ON e.venue_id = v.id OR (v.name = e.venue_name AND v.city = e.venue_city)
            WHERE 1=1`;
        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND (
                e.title ILIKE $${paramIndex} 
                OR e.venue_name ILIKE $${paramIndex} 
                OR e.artists ILIKE $${paramIndex}
            )`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (city) {
            query += ` AND LOWER(e.venue_city) = LOWER($${paramIndex})`;
            params.push(city);
            paramIndex++;
        }

        if (status && status !== 'all') {
            query += ` AND e.publish_status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (from) {
            query += ` AND e.date >= $${paramIndex}`;
            params.push(from);
            paramIndex++;
        }

        if (to) {
            query += ` AND e.date <= $${paramIndex}`;
            params.push(to);
            paramIndex++;
        }

        if (showPast !== 'true') {
            query += ` AND e.date >= CURRENT_DATE - INTERVAL '3 days'`;
        }

        // Order by timing priority:
        // 1. Ongoing (live now) - date is today AND current time is between start_time and end_time
        // 2. Upcoming - date is in the future
        // 3. Recent - date is within last 3 days
        // 4. Expired - date is older than 3 days
        // Then by status (approved > pending > rejected)
        // Then by date (upcoming: soonest first, past: most recent first)
        query += ` ORDER BY 
            CASE 
                WHEN e.date::date = CURRENT_DATE 
                     AND (e.start_time IS NULL OR CURRENT_TIME >= e.start_time::time)
                     AND (e.end_time IS NULL OR CURRENT_TIME <= e.end_time::time) THEN 0
                WHEN e.date::date > CURRENT_DATE THEN 1
                WHEN e.date::date >= CURRENT_DATE - INTERVAL '3 days' THEN 2
                ELSE 3
            END,
            CASE e.publish_status
                WHEN 'approved' THEN 0
                WHEN 'pending' THEN 1
                WHEN 'rejected' THEN 2
                ELSE 3
            END,
            CASE 
                WHEN e.date::date >= CURRENT_DATE THEN e.date
            END ASC,
            CASE 
                WHEN e.date::date < CURRENT_DATE THEN e.date
            END DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        // Get total count with same filters
        let countQuery = 'SELECT COUNT(*) FROM events WHERE 1=1';
        const countParams = [];
        let countParamIndex = 1;

        if (search) {
            countQuery += ` AND (title ILIKE $${countParamIndex} OR venue_name ILIKE $${countParamIndex} OR artists ILIKE $${countParamIndex})`;
            countParams.push(`%${search}%`);
            countParamIndex++;
        }
        if (city) {
            countQuery += ` AND LOWER(venue_city) = LOWER($${countParamIndex})`;
            countParams.push(city);
            countParamIndex++;
        }
        if (status && status !== 'all') {
            countQuery += ` AND publish_status = $${countParamIndex}`;
            countParams.push(status);
            countParamIndex++;
        }
        if (from) {
            countQuery += ` AND date >= $${countParamIndex}`;
            countParams.push(from);
            countParamIndex++;
        }
        if (to) {
            countQuery += ` AND date <= $${countParamIndex}`;
            countParams.push(to);
        }

        const countResult = await pool.query(countQuery, countParams);

        res.json({
            data: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Database error:', error);
        // If event_scraped_links doesn't exist, query without it
        if (error.code === '42P01' && error.message.includes('event_scraped_links')) {
            try {
                let query = `
                    SELECT e.*, 
                           v.latitude as venue_latitude,
                           v.longitude as venue_longitude
                    FROM events e
                    LEFT JOIN venues v ON e.venue_id = v.id OR (v.name = e.venue_name AND v.city = e.venue_city)
                    WHERE 1=1
                `;
                const params = [];
                let paramIndex = 1;

                if (search) {
                    query += ` AND (e.title ILIKE $${paramIndex} OR e.venue_name ILIKE $${paramIndex} OR e.artists ILIKE $${paramIndex})`;
                    params.push(`%${search}%`);
                    paramIndex++;
                }
                if (city) {
                    query += ` AND LOWER(e.venue_city) = LOWER($${paramIndex})`;
                    params.push(city);
                    paramIndex++;
                }
                if (status && status !== 'all') {
                    query += ` AND e.publish_status = $${paramIndex}`;
                    params.push(status);
                    paramIndex++;
                }
                if (from) {
                    query += ` AND e.date >= $${paramIndex}`;
                    params.push(from);
                    paramIndex++;
                }
                if (to) {
                    query += ` AND e.date <= $${paramIndex}`;
                    params.push(to);
                    paramIndex++;
                }

                query += ` ORDER BY 
                    CASE e.publish_status
                        WHEN 'pending' THEN 0
                        WHEN 'approved' THEN 1
                        WHEN 'rejected' THEN 2
                        ELSE 3
                    END,
                    CASE 
                        WHEN e.date::date = CURRENT_DATE THEN 0
                        WHEN e.date::date > CURRENT_DATE THEN 1
                        ELSE 2
                    END,
                    CASE WHEN e.date::date >= CURRENT_DATE THEN e.date END ASC,
                    CASE WHEN e.date::date < CURRENT_DATE THEN e.date END DESC
                    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
                params.push(parseInt(limit), parseInt(offset));

                const result = await pool.query(query, params);

                let countQuery = 'SELECT COUNT(*) FROM events WHERE 1=1';
                const countParams = [];
                let countParamIndex = 1;

                if (search) {
                    countQuery += ` AND (title ILIKE $${countParamIndex} OR venue_name ILIKE $${countParamIndex} OR artists ILIKE $${countParamIndex})`;
                    countParams.push(`%${search}%`);
                    countParamIndex++;
                }
                if (city) {
                    countQuery += ` AND LOWER(venue_city) = LOWER($${countParamIndex})`;
                    countParams.push(city);
                    countParamIndex++;
                }
                if (status && status !== 'all') {
                    countQuery += ` AND publish_status = $${countParamIndex}`;
                    countParams.push(status);
                    countParamIndex++;
                }
                if (from) {
                    countQuery += ` AND date >= $${countParamIndex}`;
                    countParams.push(from);
                    countParamIndex++;
                }
                if (to) {
                    countQuery += ` AND date <= $${countParamIndex}`;
                    countParams.push(to);
                }

                const countResult = await pool.query(countQuery, countParams);

                res.json({
                    data: result.rows,
                    total: parseInt(countResult.rows[0].count),
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                });
            } catch (fallbackError) {
                res.json({ data: [], total: 0, limit: parseInt(limit), offset: parseInt(offset), error: fallbackError.message });
            }
        } else {
            res.json({ data: [], total: 0, limit: parseInt(limit), offset: parseInt(offset), error: error.message });
        }
    }
});

// Get recently updated events (updated_at > created_at + 1 minute, within last 7 days)
// NOTE: This route MUST come before /db/events/:id to prevent ":id" from matching "recent-updates"
app.get('/db/events/recent-updates', async (req, res) => {
    try {
        const { limit = 50 } = req.query;

        // Get recently updated scraped events that are linked to main events
        const result = await pool.query(`
            SELECT DISTINCT e.*, 
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'id', se.id,
                           'source_code', se.source_code,
                           'title', se.title,
                           'confidence', esl.match_confidence,
                           'updated_at', se.updated_at
                       ))
                       FROM event_scraped_links esl
                       JOIN scraped_events se ON se.id = esl.scraped_event_id
                       WHERE esl.event_id = e.id),
                       '[]'
                   ) as source_references
            FROM events e
            JOIN event_scraped_links esl ON esl.event_id = e.id
            JOIN scraped_events se ON se.id = esl.scraped_event_id
            WHERE se.updated_at > se.created_at + INTERVAL '1 minute'
              AND se.updated_at > NOW() - INTERVAL '7 days'
              AND e.date >= CURRENT_DATE
            ORDER BY se.updated_at DESC
            LIMIT $1
        `, [parseInt(limit)]);

        res.json({
            data: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching recent updates:', error);
        res.json({ data: [], total: 0 });
    }
});

// Get all events for map (minimal data, no pagination limit)
// NOTE: This route MUST come before /db/events/:id to prevent ":id" from matching "map"
app.get('/db/events/map', async (req, res) => {
    try {
        const { city, status, showPast } = req.query;

        let query = `
            SELECT e.id, e.title, e.date, e.start_time, e.end_time,
                   e.venue_name, e.venue_city, e.venue_country,
                   COALESCE(v.latitude, e.latitude) as venue_latitude,
                   COALESCE(v.longitude, e.longitude) as venue_longitude,
                   e.publish_status, e.flyer_front,
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'source_code', se.source_code
                       ))
                       FROM event_scraped_links esl
                       JOIN scraped_events se ON se.id = esl.scraped_event_id
                       WHERE esl.event_id = e.id),
                       '[]'
                   ) as source_references
            FROM events e
            LEFT JOIN venues v ON LOWER(TRIM(v.name)) = LOWER(TRIM(e.venue_name))
                               AND LOWER(TRIM(v.city)) = LOWER(TRIM(e.venue_city))
            WHERE 1=1`;
        const params = [];
        let paramIndex = 1;

        if (city) {
            query += ` AND LOWER(e.venue_city) = LOWER($${paramIndex})`;
            params.push(city);
            paramIndex++;
        }
        if (status && status !== 'all') {
            query += ` AND e.publish_status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        if (showPast !== 'true') {
            query += ` AND e.date >= CURRENT_DATE - INTERVAL '1 day'`;
        }

        query += ` ORDER BY e.date ASC LIMIT 2000`;

        const result = await pool.query(query, params);

        res.json({
            data: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching map events:', error);
        res.json({ data: [], total: 0 });
    }
});

// Get single event with source references
app.get('/db/events/:id', async (req, res) => {
    try {
        const eventId = req.params.id;

        // Get the event
        const result = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const event = result.rows[0];

        // Get source references from event_scraped_links
        try {
            const sourceRefs = await pool.query(`
                SELECT se.id, se.source_code, se.source_event_id, se.title, se.date, 
                       se.start_time, se.content_url, se.flyer_front, se.venue_name, 
                       se.description, se.price_info, esl.match_confidence as confidence
                FROM event_scraped_links esl
                JOIN scraped_events se ON se.id = esl.scraped_event_id
                WHERE esl.event_id = $1
            `, [eventId]);

            event.source_references = sourceRefs.rows;
        } catch (e) {
            console.error(`[Single Event] Error fetching source refs:`, e);
            event.source_references = [];
        }

        res.json(event);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete event
app.delete('/db/events/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM events WHERE id = $1 RETURNING id', [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json({ success: true, deleted: req.params.id });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get pending changes for an event
app.get('/db/events/:id/changes', async (req, res) => {
    try {
        const eventId = req.params.id;

        // Get all linked scraped events with changes
        const result = await pool.query(`
            SELECT 
                se.id,
                se.source_code,
                se.source_event_id,
                se.title,
                se.has_changes,
                se.changes,
                se.updated_at,
                esl.match_confidence
            FROM event_scraped_links esl
            JOIN scraped_events se ON se.id = esl.scraped_event_id
            WHERE esl.event_id = $1 AND se.has_changes = true
            ORDER BY se.updated_at DESC
        `, [eventId]);

        res.json({
            event_id: eventId,
            has_changes: result.rows.length > 0,
            changes: result.rows
        });
    } catch (error) {
        console.error('Error fetching changes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Accept/apply pending changes to event
app.post('/db/events/:id/apply-changes', async (req, res) => {
    try {
        const eventId = req.params.id;
        const { scraped_event_id, fields } = req.body; // fields: array of field names to apply

        if (!scraped_event_id) {
            return res.status(400).json({ error: 'scraped_event_id required' });
        }

        // Get the scraped event with changes
        const scrapedResult = await pool.query(`
            SELECT * FROM scraped_events WHERE id = $1
        `, [scraped_event_id]);

        if (scrapedResult.rows.length === 0) {
            return res.status(404).json({ error: 'Scraped event not found' });
        }

        const scraped = scrapedResult.rows[0];

        // Build update query dynamically based on selected fields
        const fieldsToUpdate = fields && fields.length > 0 
            ? fields 
            : Object.keys(scraped.changes || {});

        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const updates = [];
        const values = [eventId];
        let paramIndex = 2;

        const fieldMap = {
            title: 'title',
            date: 'date',
            start_time: 'start_time',
            end_time: 'end_time',
            description: 'description',
            content_url: 'content_url',
            flyer_front: 'flyer_front',
            venue_name: 'venue_name',
            venue_address: 'venue_address',
            venue_city: 'venue_city',
            venue_country: 'venue_country',
            artists_json: 'artists'
        };

        for (const field of fieldsToUpdate) {
            const eventField = fieldMap[field] || field;
            if (scraped[field] !== undefined) {
                updates.push(`${eventField} = $${paramIndex}`);
                // Special handling for artists_json -> artists string conversion
                if (field === 'artists_json') {
                    values.push(JSON.stringify(scraped.artists_json));
                } else {
                    values.push(scraped[field]);
                }
                paramIndex++;
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        // Update the event
        await pool.query(`
            UPDATE events 
            SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, values);

        // Clear the changes flag on scraped event
        await pool.query(`
            UPDATE scraped_events 
            SET has_changes = false, changes = NULL
            WHERE id = $1
        `, [scraped_event_id]);

        // Check if event still has other pending changes
        const remainingChanges = await pool.query(`
            SELECT COUNT(*) FROM event_scraped_links esl
            JOIN scraped_events se ON se.id = esl.scraped_event_id
            WHERE esl.event_id = $1 AND se.has_changes = true
        `, [eventId]);

        // Update has_pending_changes flag
        await pool.query(`
            UPDATE events 
            SET has_pending_changes = $1
            WHERE id = $2
        `, [parseInt(remainingChanges.rows[0].count) > 0, eventId]);

        res.json({ 
            success: true, 
            applied_fields: fieldsToUpdate,
            has_remaining_changes: parseInt(remainingChanges.rows[0].count) > 0
        });
    } catch (error) {
        console.error('Error applying changes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Dismiss/reject pending changes
app.post('/db/events/:id/dismiss-changes', async (req, res) => {
    try {
        const eventId = req.params.id;
        const { scraped_event_id } = req.body;

        if (!scraped_event_id) {
            return res.status(400).json({ error: 'scraped_event_id required' });
        }

        // Clear the changes flag
        await pool.query(`
            UPDATE scraped_events 
            SET has_changes = false, changes = NULL
            WHERE id = $1
        `, [scraped_event_id]);

        // Check if event still has other pending changes
        const remainingChanges = await pool.query(`
            SELECT COUNT(*) FROM event_scraped_links esl
            JOIN scraped_events se ON se.id = esl.scraped_event_id
            WHERE esl.event_id = $1 AND se.has_changes = true
        `, [eventId]);

        // Update has_pending_changes flag
        await pool.query(`
            UPDATE events 
            SET has_pending_changes = $1
            WHERE id = $2
        `, [parseInt(remainingChanges.rows[0].count) > 0, eventId]);

        res.json({ 
            success: true,
            has_remaining_changes: parseInt(remainingChanges.rows[0].count) > 0
        });
    } catch (error) {
        console.error('Error dismissing changes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete ALL events
app.delete('/db/events', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM events RETURNING id');
        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update event (PATCH)
app.patch('/db/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        console.log(`PATCH /db/events/${id}`, updates);

        // Ensure required columns exist
        await pool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'is_published') THEN
                    ALTER TABLE events ADD COLUMN is_published BOOLEAN DEFAULT false;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'latitude') THEN
                    ALTER TABLE events ADD COLUMN latitude DECIMAL(10, 8);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'longitude') THEN
                    ALTER TABLE events ADD COLUMN longitude DECIMAL(11, 8);
                END IF;
            END $$;
        `);

        // Build dynamic update query
        const allowedFields = [
            'title', 'date', 'start_time', 'end_time', 'content_url',
            'flyer_front', 'description', 'venue_id', 'venue_name',
            'venue_address', 'venue_city', 'venue_country', 'artists',
            'is_published', 'latitude', 'longitude', 'event_type'
        ];

        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                // Handle time fields - convert "HH:MM" to TIMESTAMP by combining with date
                if ((key === 'start_time' || key === 'end_time') && value && typeof value === 'string') {
                    // If it's just a time (HH:MM or HH:MM:SS), combine with the date
                    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
                        // Get the date value from updates or fetch from database
                        const dateValue = updates.date || null;
                        if (dateValue) {
                            // Combine date with time for timestamp
                            setClauses.push(`${key} = $${paramIndex++}::TIMESTAMP`);
                            values.push(`${dateValue} ${value}`);
                        } else {
                            // If no date in updates, use a subquery to get existing date
                            setClauses.push(`${key} = (SELECT date::date || ' ' || $${paramIndex++})::TIMESTAMP`);
                            values.push(value);
                        }
                    } else {
                        setClauses.push(`${key} = $${paramIndex++}::TIMESTAMP`);
                        values.push(value);
                    }
                } else {
                    setClauses.push(`${key} = $${paramIndex++}`);
                    values.push(value);
                }
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        const query = `
            UPDATE events 
            SET ${setClauses.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json({ success: true, event: result.rows[0] });
    } catch (error) {
        console.error('Database error updating event:', error);
        res.status(500).json({ error: error.message, detail: error.detail || null });
    }
});

// Bulk publish/unpublish events
app.post('/db/events/publish', async (req, res) => {
    try {
        const { ids, publish } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids must be a non-empty array' });
        }

        // Check if is_published column exists
        const columnsResult = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'events' AND column_name = 'is_published'
        `);

        if (columnsResult.rows.length === 0) {
            // Column doesn't exist - run migration inline
            await pool.query(`
                ALTER TABLE events ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false
            `);
        }

        const result = await pool.query(
            `UPDATE events 
             SET is_published = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ANY($2::text[])
             RETURNING id`,
            [publish, ids]
        );

        res.json({
            success: true,
            updated: result.rows.length,
            ids: result.rows.map(r => r.id)
        });
    } catch (error) {
        console.error('Database error publishing events:', error);
        res.status(500).json({ error: error.message });
    }
});

// Set publish status for events (new: pending/approved/rejected)
// Geocode specific venues (synchronous, for testing)
app.post('/db/venues/geocode', async (req, res) => {
    try {
        const { limit = 10, debug = false } = req.body;
        
        // Get venues without coordinates
        const venues = await pool.query(`
            SELECT id, name, address, city, country
            FROM venues
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND (address IS NOT NULL OR city IS NOT NULL)
            LIMIT $1
        `, [limit]);
        
        let geocoded = 0;
        let failed = 0;
        const errors = [];
        
        for (const venue of venues.rows) {
            try {
                console.log(`[Geocode] Processing: ${venue.name}`);
                console.log(`[Geocode]   Input: address="${venue.address}", city="${venue.city}", country="${venue.country}"`);
                const coords = await geocodeAddress(venue.address, venue.city, venue.country);
                console.log(`[Geocode]   Result:`, coords);
                
                if (coords) {
                    await pool.query(`
                        UPDATE venues 
                        SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $3
                    `, [coords.latitude, coords.longitude, venue.id]);
                    geocoded++;
                    console.log(`[Geocode] Success: ${venue.name} -> ${coords.latitude}, ${coords.longitude}`);
                } else {
                    failed++;
                    const msg = `No coordinates returned for ${venue.name}`;
                    console.log(`[Geocode] Failed: ${msg}`);
                    if (debug) errors.push(msg);
                }
            } catch (venueError) {
                failed++;
                const msg = `Error geocoding ${venue.name}: ${venueError.message}`;
                console.error(`[Geocode] ${msg}`);
                if (debug) errors.push(msg);
            }
            
            // Rate limit - 1.5 seconds per request for Nominatim (safer than 1s)
            if (geocoded + failed < venues.rows.length) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
        
        const result = {
            success: true,
            processed: venues.rows.length,
            geocoded,
            failed
        };
        
        if (debug) result.errors = errors;
        
        res.json(result);
    } catch (error) {
        console.error('Geocoding error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Geocode venues without coordinates - background task
let geocodingInProgress = false;
let geocodingStats = { processed: 0, geocoded: 0, failed: 0, remaining: 0, failedVenues: [] };

app.post('/db/venues/geocode-all', async (req, res) => {
    try {
        const { limit = 200, background = true } = req.body;
        
        // Check if geocoding is already running
        if (geocodingInProgress) {
            return res.json({
                success: true,
                message: 'Geocoding already in progress',
                stats: geocodingStats
            });
        }
        
        // Get count of venues without coordinates
        const countResult = await pool.query(`
            SELECT COUNT(*) as count
            FROM venues
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND (address IS NOT NULL OR city IS NOT NULL)
        `);
        
        const totalToGeocode = parseInt(countResult.rows[0].count);
        
        if (totalToGeocode === 0) {
            return res.json({
                success: true,
                message: 'All venues already have coordinates',
                stats: { processed: 0, geocoded: 0, failed: 0, remaining: 0 }
            });
        }
        
        // If background mode, start async and return immediately
        if (background) {
            geocodingInProgress = true;
            geocodingStats = { processed: 0, geocoded: 0, failed: 0, remaining: totalToGeocode, failedVenues: [] };
            
            // Start background geocoding
            (async () => {
                try {
                    const venues = await pool.query(`
                        SELECT id, name, address, city, country
                        FROM venues
                        WHERE (latitude IS NULL OR longitude IS NULL)
                        AND (address IS NOT NULL OR city IS NOT NULL)
                        ORDER BY name
                        LIMIT $1
                    `, [limit]);
                    
                    for (const venue of venues.rows) {
                        try {
                            console.log(`[Geocode ${geocodingStats.processed + 1}/${venues.rows.length}] ${venue.name}`);
                            console.log(`  Address: ${venue.address || ''}, ${venue.city}, ${venue.country || ''}`);
                            
                            const coords = await geocodeAddress(venue.address, venue.city, venue.country);
                            
                            if (coords) {
                                await pool.query(`
                                    UPDATE venues 
                                    SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP
                                    WHERE id = $3
                                `, [coords.latitude, coords.longitude, venue.id]);
                                geocodingStats.geocoded++;
                                console.log(`  ✓ ${coords.latitude}, ${coords.longitude}`);
                            } else {
                                geocodingStats.failed++;
                                geocodingStats.failedVenues.push(venue.name);
                                console.log(`  ✗ No coordinates found`);
                            }
                        } catch (venueError) {
                            geocodingStats.failed++;
                            geocodingStats.failedVenues.push(venue.name);
                            console.error(`  Error: ${venueError.message}`);
                        }
                        
                        geocodingStats.processed++;
                        geocodingStats.remaining = totalToGeocode - geocodingStats.processed;
                        
                        // Rate limit
                        if (geocodingStats.processed < venues.rows.length) {
                            await new Promise(resolve => setTimeout(resolve, 1500));
                        }
                    }
                    
                    // Sync venue coordinates to events
                    console.log('\n[Geocode] Syncing venue coordinates to events...');
                    const syncResult = await pool.query(`
                        UPDATE events e
                        SET latitude = v.latitude,
                            longitude = v.longitude,
                            updated_at = CURRENT_TIMESTAMP
                        FROM venues v
                        WHERE e.venue_name = v.name
                        AND e.venue_city = v.city
                        AND v.latitude IS NOT NULL
                        AND v.longitude IS NOT NULL
                        AND (e.latitude IS NULL OR e.longitude IS NULL)
                    `);
                    console.log(`[Geocode] Synced ${syncResult.rowCount} events with venue coordinates`);
                    console.log(`[Geocode] Complete: ${geocodingStats.geocoded} venues geocoded, ${geocodingStats.failed} failed`);
                    if (geocodingStats.failedVenues.length > 0) {
                        console.log(`[Geocode] Failed venues: ${geocodingStats.failedVenues.join(', ')}`);
                    }
                } catch (error) {
                    console.error('[Geocode] Background error:', error);
                } finally {
                    geocodingInProgress = false;
                }
            })();
            
            return res.json({
                success: true,
                message: `Geocoding started in background for ${Math.min(limit, totalToGeocode)} venues`,
                totalToGeocode,
                limit
            });
        }
        
        res.json({ success: false, message: 'Use background mode for venue geocoding' });
    } catch (error) {
        console.error('Venue geocoding error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get geocoding status
app.get('/db/venues/geocode/status', (req, res) => {
    res.json({
        inProgress: geocodingInProgress,
        stats: geocodingStats
    });
});

// Test geocoding function directly
app.post('/db/venues/test-geocode', async (req, res) => {
    try {
        const { address, city, country } = req.body;
        console.log('[Test Geocode] Input:', { address, city, country });
        
        const coords = await geocodeAddress(address, city, country);
        console.log('[Test Geocode] Result:', coords);
        
        res.json({
            success: true,
            input: { address, city, country },
            coordinates: coords
        });
    } catch (error) {
        console.error('[Test Geocode] Error:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// Update events with venue coordinates
app.post('/db/events/sync-venue-coords', async (req, res) => {
    try {
        // Update events with coordinates from their venues
        const result = await pool.query(`
            UPDATE events e
            SET latitude = v.latitude,
                longitude = v.longitude,
                updated_at = CURRENT_TIMESTAMP
            FROM venues v
            WHERE LOWER(e.venue_name) = LOWER(v.name)
            AND LOWER(e.venue_city) = LOWER(v.city)
            AND v.latitude IS NOT NULL
            AND v.longitude IS NOT NULL
            AND (e.latitude IS NULL OR e.longitude IS NULL)
        `);
        
        res.json({
            success: true,
            updated: result.rowCount,
            message: `Updated ${result.rowCount} events with venue coordinates`
        });
    } catch (error) {
        console.error('Sync venue coords error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Match and link artists
app.post('/db/artists/match', async (req, res) => {
    try {
        const { dryRun = false, minConfidence = 0.7 } = req.body;
        const result = await matchAndLinkArtists({ dryRun, minConfidence });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Artist matching error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Match and link venues
app.post('/db/venues/match', async (req, res) => {
    try {
        const { dryRun = false, minConfidence = 0.7 } = req.body;
        const result = await matchAndLinkVenues({ dryRun, minConfidence });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Venue matching error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/db/events/publish-status', async (req, res) => {
    try {
        const { ids, status } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids must be a non-empty array' });
        }

        const validStatuses = ['pending', 'approved', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
        }

        // Update main events table
        const result = await pool.query(
            `UPDATE events 
             SET publish_status = $1, 
                 is_published = $2,
                 updated_at = CURRENT_TIMESTAMP 
             WHERE id = ANY($3::text[])
             RETURNING id`,
            [status, status === 'approved', ids]
        );

        // Also try to update unified_events for backwards compatibility
        try {
            await pool.query(
                `UPDATE unified_events 
                 SET publish_status = $1, 
                     is_published = $2,
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ANY($3::text[])`,
                [status, status === 'approved', ids]
            );
        } catch (e) {
            // unified_events might not exist, that's ok
        }

        res.json({
            success: true,
            updated: result.rows.length,
            status,
            ids: result.rows.map(r => r.id)
        });
    } catch (error) {
        console.error('Database error setting publish status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Auto-classify event types
app.post('/db/events/classify-types', async (req, res) => {
    try {
        // Get all events without a specific type (or with default 'event' type)
        const eventsResult = await pool.query(`
            SELECT id, title, venue_name, description 
            FROM events 
            WHERE event_type IS NULL OR event_type = 'event'
        `);

        let updated = 0;
        const typeUpdates = {};

        for (const event of eventsResult.rows) {
            const classifiedType = classifyEventType(event.title, event.venue_name, event.description);

            if (classifiedType !== 'event') {
                await pool.query(
                    'UPDATE events SET event_type = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                    [classifiedType, event.id]
                );
                updated++;
                typeUpdates[classifiedType] = (typeUpdates[classifiedType] || 0) + 1;
            }
        }

        res.json({
            success: true,
            total_checked: eventsResult.rows.length,
            updated,
            by_type: typeUpdates
        });
    } catch (error) {
        console.error('Error classifying events:', error);
        res.status(500).json({ error: error.message });
    }
});

// Database stats
app.get('/db/stats', async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_events,
                COUNT(DISTINCT venue_city) as cities,
                COUNT(DISTINCT venue_name) as venues,
                MIN(date) as earliest_event,
                MAX(date) as latest_event
            FROM events
        `);

        const byCityResult = await pool.query(`
            SELECT venue_city, COUNT(*) as count 
            FROM events 
            WHERE venue_city IS NOT NULL
            GROUP BY venue_city 
            ORDER BY count DESC 
            LIMIT 10
        `);

        res.json({
            ...stats.rows[0],
            events_by_city: byCityResult.rows
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all cities with event counts
app.get('/db/cities', async (req, res) => {
    try {
        const { search, limit = 100, offset = 0 } = req.query;

        // Get cities with dynamically calculated event and venue counts
        let query = `
            SELECT c.*,
                   COALESCE((SELECT COUNT(*) FROM events e WHERE LOWER(e.venue_city) = LOWER(c.name)), 0) as event_count,
                   COALESCE((SELECT COUNT(DISTINCT venue_name) FROM events e WHERE LOWER(e.venue_city) = LOWER(c.name)), 0) as venue_count
            FROM cities c
            WHERE 1=1`;
        const params = [];
        let paramIdx = 1;

        if (search) {
            query += ` AND (LOWER(c.name) LIKE $${paramIdx} OR LOWER(c.country) LIKE $${paramIdx})`;
            params.push(`%${search.toLowerCase()}%`);
            paramIdx++;
        }

        query += ` ORDER BY (SELECT COUNT(*) FROM events e WHERE LOWER(e.venue_city) = LOWER(c.name)) DESC NULLS LAST, c.name ASC`;
        query += ` LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const citiesResult = await pool.query(query, params);

        // Get total count
        let countQuery = `SELECT COUNT(*) FROM cities WHERE 1=1`;
        const countParams = [];
        if (search) {
            countQuery += ` AND (LOWER(name) LIKE $1 OR LOWER(country) LIKE $1)`;
            countParams.push(`%${search.toLowerCase()}%`);
        }
        const countResult = await pool.query(countQuery, countParams);

        res.json({
            data: citiesResult.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        // If cities table doesn't exist, try fallback from events
        console.log('Cities table error, trying fallback:', error.message);
        try {
            const fallbackResult = await pool.query(`
                SELECT 
                    venue_city as name,
                    venue_country as country,
                    COUNT(*) as event_count,
                    COUNT(DISTINCT venue_name) as venue_count,
                    NULL as latitude,
                    NULL as longitude
                FROM events 
                WHERE venue_city IS NOT NULL AND venue_city != ''
                GROUP BY venue_city, venue_country
                ORDER BY event_count DESC
                LIMIT $1 OFFSET $2
            `, [parseInt(limit), parseInt(offset)]);

            // If no events have cities either, return empty
            if (fallbackResult.rows.length === 0) {
                console.log('No cities found in events table, returning empty array');
                res.json({ data: [], total: 0, limit: parseInt(limit), offset: parseInt(offset) });
            } else {
                res.json({
                    data: fallbackResult.rows,
                    total: fallbackResult.rows.length,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                });
            }
        } catch (fallbackError) {
            console.error('Database error in fallback:', fallbackError);
            res.json({ data: [], total: 0, limit: parseInt(limit), offset: parseInt(offset), error: fallbackError.message });
        }
    }
});

// Get all countries for dropdown
app.get('/db/countries', async (req, res) => {
    try {
        // First try the countries table
        let result;
        try {
            result = await pool.query(`
                SELECT * FROM countries WHERE is_active = true ORDER BY name ASC
            `);
        } catch (tableError) {
            // Countries table doesn't exist yet, use fallback
            console.log('Countries table not found, using fallback query');
            result = { rows: [] };
        }

        if (result.rows.length > 0) {
            res.json({ data: result.rows });
        } else {
            // Fallback: get distinct countries from events and venues
            try {
                const fallbackResult = await pool.query(`
                    SELECT DISTINCT 
                        COALESCE(venue_country, 'Unknown') as name,
                        CASE COALESCE(venue_country, 'Unknown')
                            WHEN 'Germany' THEN 'DE'
                            WHEN 'United Kingdom' THEN 'GB'
                            WHEN 'United States' THEN 'US'
                            WHEN 'Netherlands' THEN 'NL'
                            WHEN 'France' THEN 'FR'
                            WHEN 'Spain' THEN 'ES'
                            ELSE NULL
                        END as code
                    FROM events 
                    WHERE venue_country IS NOT NULL AND venue_country != ''
                    UNION
                    SELECT DISTINCT 
                        COALESCE(country, 'Unknown') as name,
                        NULL as code
                    FROM venues
                    WHERE country IS NOT NULL AND country != ''
                    ORDER BY name ASC
                `);
                res.json({ data: fallbackResult.rows });
            } catch (fallbackError) {
                console.log('No countries data available:', fallbackError.message);
                res.json({ data: [] });
            }
        }
    } catch (error) {
        console.error('Database error fetching countries:', error);
        res.json({ data: [], error: error.message });
    }
});

// Get all cities for dropdown (optimized version)
app.get('/db/cities/dropdown', async (req, res) => {
    try {
        const { country } = req.query;

        let query = `
            SELECT DISTINCT 
                COALESCE(venue_city, '') as name,
                COALESCE(venue_country, '') as country,
                COUNT(*) as event_count
            FROM events 
            WHERE venue_city IS NOT NULL AND venue_city != ''
        `;
        const params = [];

        if (country) {
            query += ` AND LOWER(venue_country) = LOWER($1)`;
            params.push(country);
        }

        query += ` GROUP BY venue_city, venue_country ORDER BY event_count DESC, name ASC LIMIT 500`;

        const result = await pool.query(query, params);
        res.json({ data: result.rows });
    } catch (error) {
        console.error('Database error fetching cities dropdown:', error);
        res.json({ data: [], error: error.message });
    }
});

// Autocomplete search for venues
app.get('/db/venues/search', async (req, res) => {
    try {
        const { q, city, limit = 20 } = req.query;

        if (!q || q.length < 2) {
            return res.json({ data: [] });
        }

        // Check if venues table has data, otherwise use scraped_venues
        const venueCountCheck = await pool.query('SELECT COUNT(*) FROM venues');
        const hasVenues = parseInt(venueCountCheck.rows[0].count) > 0;

        let result;
        if (hasVenues) {
            result = await pool.query(`
                SELECT id, name, address, city, country, latitude, longitude
                FROM venues
                WHERE LOWER(name) LIKE $1
                ${city ? 'AND LOWER(city) = LOWER($2)' : ''}
                ORDER BY 
                    CASE WHEN LOWER(name) = $${city ? '3' : '2'} THEN 0
                         WHEN LOWER(name) LIKE $${city ? '3' : '2'} || '%' THEN 1
                         ELSE 2
                    END,
                    name ASC
                LIMIT $${city ? '4' : '3'}
            `, city
                ? [`%${q.toLowerCase()}%`, city, q.toLowerCase(), parseInt(limit)]
                : [`%${q.toLowerCase()}%`, q.toLowerCase(), parseInt(limit)]
            );
        } else {
            // Fallback to scraped_venues
            result = await pool.query(`
                SELECT DISTINCT ON (LOWER(name), LOWER(COALESCE(city, '')))
                    id, name, address, city, country, latitude, longitude
                FROM scraped_venues
                WHERE LOWER(name) LIKE $1
                ${city ? 'AND LOWER(city) = LOWER($2)' : ''}
                ORDER BY 
                    LOWER(name), LOWER(COALESCE(city, '')),
                    CASE WHEN LOWER(name) = $${city ? '3' : '2'} THEN 0
                         WHEN LOWER(name) LIKE $${city ? '3' : '2'} || '%' THEN 1
                         ELSE 2
                    END,
                    name ASC
                LIMIT $${city ? '4' : '3'}
            `, city
                ? [`%${q.toLowerCase()}%`, city, q.toLowerCase(), parseInt(limit)]
                : [`%${q.toLowerCase()}%`, q.toLowerCase(), parseInt(limit)]
            );
        }

        res.json({ data: result.rows });
    } catch (error) {
        console.error('Venue search error:', error);
        res.json({ data: [], error: error.message });
    }
});

// Autocomplete search for artists
app.get('/db/artists/search', async (req, res) => {
    try {
        const { q, limit = 20 } = req.query;

        if (!q || q.length < 2) {
            return res.json({ data: [] });
        }

        // Check if artists table has data, otherwise use scraped_artists
        const artistCountCheck = await pool.query('SELECT COUNT(*) FROM artists');
        const hasArtists = parseInt(artistCountCheck.rows[0].count) > 0;

        let result;
        if (hasArtists) {
            result = await pool.query(`
                SELECT id, name, country, image_url, genres
                FROM artists
                WHERE LOWER(name) LIKE $1
                ORDER BY 
                    CASE WHEN LOWER(name) = $2 THEN 0
                         WHEN LOWER(name) LIKE $2 || '%' THEN 1
                         ELSE 2
                    END,
                    name ASC
                LIMIT $3
            `, [`%${q.toLowerCase()}%`, q.toLowerCase(), parseInt(limit)]);
        } else {
            // Fallback to scraped_artists
            result = await pool.query(`
                SELECT DISTINCT ON (LOWER(name))
                    id, name, image_url, genres
                FROM scraped_artists
                WHERE LOWER(name) LIKE $1
                ORDER BY 
                    LOWER(name),
                    CASE WHEN LOWER(name) = $2 THEN 0
                         WHEN LOWER(name) LIKE $2 || '%' THEN 1
                         ELSE 2
                    END,
                    name ASC
                LIMIT $3
            `, [`%${q.toLowerCase()}%`, q.toLowerCase(), parseInt(limit)]);
        }

        res.json({ data: result.rows });
    } catch (error) {
        console.error('Artist search error:', error);
        res.json({ data: [], error: error.message });
    }
});

// Event-Artist management endpoints
app.get('/db/events/:id/artists', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT ea.*, a.name, a.image_url, a.country, a.genres
            FROM event_artists ea
            JOIN artists a ON a.id = ea.artist_id
            WHERE ea.event_id = $1
            ORDER BY ea.billing_order ASC, a.name ASC
        `, [id]);

        res.json({ data: result.rows });
    } catch (error) {
        // Table might not exist yet
        if (error.code === '42P01') {
            res.json({ data: [], message: 'event_artists table not yet created' });
        } else {
            console.error('Get event artists error:', error);
            res.json({ data: [], error: error.message });
        }
    }
});

// Add artist to event
app.post('/db/events/:id/artists', async (req, res) => {
    try {
        const { id } = req.params;
        const { artist_id, role = 'performer', billing_order = 0 } = req.body;

        if (!artist_id) {
            return res.status(400).json({ error: 'artist_id is required' });
        }

        const result = await pool.query(`
            INSERT INTO event_artists (event_id, artist_id, role, billing_order)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (event_id, artist_id) DO UPDATE SET
                role = EXCLUDED.role,
                billing_order = EXCLUDED.billing_order
            RETURNING *
        `, [id, artist_id, role, billing_order]);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Add event artist error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Remove artist from event
app.delete('/db/events/:id/artists/:artistId', async (req, res) => {
    try {
        const { id, artistId } = req.params;

        await pool.query(`
            DELETE FROM event_artists WHERE event_id = $1 AND artist_id = $2
        `, [id, artistId]);

        res.json({ success: true });
    } catch (error) {
        console.error('Remove event artist error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Sync event_artists from events.artists JSON column
app.post('/db/events/:id/sync-artists', async (req, res) => {
    try {
        const { id } = req.params;

        // Get the artists JSON from the event
        const eventResult = await pool.query(`
            SELECT artists FROM events WHERE id = $1
        `, [id]);

        if (eventResult.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const artistsJson = eventResult.rows[0].artists;
        if (!artistsJson) {
            return res.json({ success: true, synced: 0, message: 'No artists to sync' });
        }

        let artists;
        try {
            artists = typeof artistsJson === 'string' ? JSON.parse(artistsJson) : artistsJson;
        } catch {
            return res.json({ success: true, synced: 0, message: 'Could not parse artists JSON' });
        }

        if (!Array.isArray(artists) || artists.length === 0) {
            return res.json({ success: true, synced: 0, message: 'No artists in array' });
        }

        let synced = 0;
        for (let i = 0; i < artists.length; i++) {
            const artist = artists[i];
            const artistName = artist.name || artist;

            if (!artistName) continue;

            // Find or create artist
            let artistResult = await pool.query(`
                SELECT id FROM artists WHERE LOWER(name) = LOWER($1) LIMIT 1
            `, [artistName]);

            let artistId;
            if (artistResult.rows.length === 0) {
                // Create artist
                const newArtist = await pool.query(`
                    INSERT INTO artists (id, name, created_at)
                    VALUES ($1, $2, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO NOTHING
                    RETURNING id
                `, [`artist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, artistName]);

                artistId = newArtist.rows[0]?.id;
                if (!artistId) {
                    // Retry fetch if insert had conflict
                    const retry = await pool.query(`SELECT id FROM artists WHERE LOWER(name) = LOWER($1) LIMIT 1`, [artistName]);
                    artistId = retry.rows[0]?.id;
                }
            } else {
                artistId = artistResult.rows[0].id;
            }

            if (artistId) {
                // Link to event
                await pool.query(`
                    INSERT INTO event_artists (event_id, artist_id, billing_order)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (event_id, artist_id) DO NOTHING
                `, [id, artistId, i]);
                synced++;
            }
        }

        res.json({ success: true, synced });
    } catch (error) {
        console.error('Sync event artists error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Version endpoint for deployment tracking
app.get('/api-version', (req, res) => {
    res.json({ 
        version: '1.0.5',
        geocodingFix: 'https-module',
        deployedAt: new Date().toISOString()
    });
});

// Health check endpoint that verifies DB connection
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            status: 'ok',
            dbConnected: true,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            dbConnected: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Fetch from RA API and save to database in one call
app.post('/db/sync', async (req, res) => {
    try {
        const { area, city, startDate, endDate, limit = 100 } = req.body;

        // City to area mapping
        const cityMap = {
            'london': 13, 'berlin': 34, 'hamburg': 148, 'new york': 8, 'paris': 12,
            'amsterdam': 29, 'barcelona': 20, 'manchester': 15, 'bristol': 16,
            'leeds': 17, 'los angeles': 38, 'san francisco': 39, 'tokyo': 10,
            'melbourne': 6, 'sydney': 5, 'miami': 44, 'chicago': 19,
            'detroit': 21, 'ibiza': 24, 'cologne': 143, 'frankfurt': 147,
            'munich': 151, 'vienna': 159
        };

        const areaId = area || (city ? cityMap[city.toLowerCase()] : null);

        if (!areaId) {
            return res.status(400).json({
                error: 'Please provide area ID or city name',
                availableCities: Object.keys(cityMap)
            });
        }

        // Fetch from RA GraphQL API
        const query = `
            query GetEvents($filters: FilterInputDtoInput, $pageSize: Int) {
                eventListings(filters: $filters, pageSize: $pageSize) {
                    data {
                        event {
                            id
                            title
                            date
                            startTime
                            endTime
                            contentUrl
                            flyerFront
                            content
                            venue {
                                id
                                name
                                address
                                area {
                                    name
                                    country { name }
                                }
                            }
                            artists { id name }
                        }
                        listingDate
                    }
                    totalResults
                }
            }
        `;

        const today = new Date().toISOString().split('T')[0];
        const filters = {
            areas: { eq: parseInt(areaId) },
            listingDate: {
                gte: startDate || today,
                lte: endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            }
        };

        const response = await fetch('https://ra.co/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Referer': 'https://ra.co/'
            },
            body: JSON.stringify({ query, variables: { filters, pageSize: parseInt(limit) } })
        });

        const data = await response.json();

        if (data.errors) {
            return res.status(400).json({ error: data.errors });
        }

        const listings = data.data.eventListings.data || [];
        let inserted = 0, updated = 0;
        let geocoded = 0;

        for (const listing of listings) {
            const e = listing.event;
            if (!e) continue;

            try {
                // Try to geocode the venue address if we have it
                let lat = null, lng = null;
                const venueAddress = e.venue?.address;
                const venueCity = e.venue?.area?.name;
                const venueCountry = e.venue?.area?.country?.name;

                if (venueAddress || venueCity) {
                    const coords = await geocodeAddress(venueAddress, venueCity, venueCountry);
                    if (coords) {
                        lat = coords.latitude;
                        lng = coords.longitude;
                        geocoded++;
                    }
                }

                const result = await pool.query(`
                    INSERT INTO events (
                        id, title, date, start_time, end_time, content_url,
                        flyer_front, description, venue_id, venue_name,
                        venue_address, venue_city, venue_country, artists, listing_date,
                        latitude, longitude
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                    ON CONFLICT (id) DO UPDATE SET
                        title = CASE WHEN events.publish_status = 'approved' THEN events.title ELSE EXCLUDED.title END,
                        date = CASE WHEN events.publish_status = 'approved' THEN events.date ELSE EXCLUDED.date END,
                        start_time = CASE WHEN events.publish_status = 'approved' THEN events.start_time ELSE EXCLUDED.start_time END,
                        end_time = CASE WHEN events.publish_status = 'approved' THEN events.end_time ELSE EXCLUDED.end_time END,
                        content_url = CASE WHEN events.publish_status = 'approved' THEN events.content_url ELSE EXCLUDED.content_url END,
                        flyer_front = CASE WHEN events.publish_status = 'approved' THEN events.flyer_front ELSE EXCLUDED.flyer_front END,
                        description = CASE WHEN events.publish_status = 'approved' THEN events.description ELSE EXCLUDED.description END,
                        venue_id = CASE WHEN events.publish_status = 'approved' THEN events.venue_id ELSE EXCLUDED.venue_id END,
                        venue_name = CASE WHEN events.publish_status = 'approved' THEN events.venue_name ELSE EXCLUDED.venue_name END,
                        venue_address = CASE WHEN events.publish_status = 'approved' THEN events.venue_address ELSE EXCLUDED.venue_address END,
                        venue_city = CASE WHEN events.publish_status = 'approved' THEN events.venue_city ELSE EXCLUDED.venue_city END,
                        venue_country = CASE WHEN events.publish_status = 'approved' THEN events.venue_country ELSE EXCLUDED.venue_country END,
                        artists = CASE WHEN events.publish_status = 'approved' THEN events.artists ELSE EXCLUDED.artists END,
                        listing_date = EXCLUDED.listing_date,
                        latitude = COALESCE(EXCLUDED.latitude, events.latitude),
                        longitude = COALESCE(EXCLUDED.longitude, events.longitude),
                        updated_at = CASE WHEN events.publish_status = 'approved' THEN events.updated_at ELSE CURRENT_TIMESTAMP END
                    RETURNING (xmax = 0) AS inserted
                `, [
                    e.id,
                    e.title,
                    e.date,
                    e.startTime,
                    e.endTime,
                    e.contentUrl ? `https://ra.co${e.contentUrl}` : null,
                    e.flyerFront,
                    e.content ? e.content.substring(0, 5000) : null,
                    e.venue?.id,
                    e.venue?.name,
                    e.venue?.address,
                    e.venue?.area?.name,
                    e.venue?.area?.country?.name,
                    (e.artists || []).map(a => a.name).join(', '),
                    listing.listingDate,
                    lat,
                    lng
                ]);

                if (result.rows[0].inserted) inserted++;
                else updated++;
            } catch (err) {
                console.error(`Error saving event ${e.id}:`, err.message);
            }
        }

        res.json({
            success: true,
            fetched: listings.length,
            totalAvailable: data.data.eventListings.totalResults,
            inserted,
            updated,
            geocoded
        });
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Geocode events that don't have coordinates
app.post('/db/events/geocode', async (req, res) => {
    try {
        const { limit = 50, city } = req.body;

        // Find events without coordinates
        let query = `
            SELECT id, venue_address, venue_city, venue_country
            FROM events
            WHERE latitude IS NULL
            AND (venue_address IS NOT NULL OR venue_city IS NOT NULL)
        `;
        const params = [];
        let paramIndex = 1;

        if (city) {
            query += ` AND venue_city ILIKE $${paramIndex++}`;
            params.push(city);
        }

        query += ` ORDER BY date DESC LIMIT $${paramIndex}`;
        params.push(parseInt(limit));

        const eventsResult = await pool.query(query, params);
        const events = eventsResult.rows;

        let geocoded = 0;
        let failed = 0;

        for (const event of events) {
            const coords = await geocodeAddress(
                event.venue_address,
                event.venue_city,
                event.venue_country
            );

            if (coords) {
                await pool.query(
                    'UPDATE events SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                    [coords.latitude, coords.longitude, event.id]
                );
                geocoded++;
            } else {
                failed++;
            }
        }

        res.json({
            success: true,
            processed: events.length,
            geocoded,
            failed
        });
    } catch (error) {
        console.error('Geocoding error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// VENUE & ARTIST ENRICHMENT ENDPOINTS
// ============================================

// Find missing venues (venues in events but not in venues table)
// NOTE: Must be before /db/venues/:id to avoid route conflict
app.get('/db/venues/missing', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT e.venue_id, e.venue_name, e.venue_city, e.venue_country
            FROM events e
            LEFT JOIN venues v ON e.venue_id = v.id
            WHERE e.venue_id IS NOT NULL 
            AND v.id IS NULL
            ORDER BY e.venue_name
        `);
        res.json({ data: result.rows, total: result.rows.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Find missing artists (artists in events but not in artists table)
// NOTE: Must be before /db/artists/:id to avoid route conflict
app.get('/db/artists/missing', async (req, res) => {
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
});

// Get venue from database with source references
app.get('/db/venues/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM venues WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Venue not found' });
        }

        const venue = result.rows[0];

        // Get events at this venue
        const eventsResult = await pool.query(`
            SELECT id, title, date, artists 
            FROM events 
            WHERE venue_id = $1 OR venue_name = $2
            ORDER BY date DESC
            LIMIT 50
        `, [req.params.id, venue.name]);
        venue.events = eventsResult.rows;

        // Try to get source references from venue_scraped_links (new schema)
        // or fall back to unified_venues (old schema)
        try {
            const sourceRefsNew = await pool.query(`
                SELECT sv.id, sv.source_code, sv.source_venue_id, sv.name,
                       sv.address, sv.city, sv.country, sv.content_url,
                       sv.latitude, sv.longitude, vsl.match_confidence as confidence
                FROM venue_scraped_links vsl
                JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
                WHERE vsl.venue_id = $1
            `, [req.params.id]);

            if (sourceRefsNew.rows.length > 0) {
                venue.source_references = sourceRefsNew.rows;
            }
        } catch (e) {
            // Table might not exist yet, try old schema via unified_venues
            try {
                const sourceRefsOld = await pool.query(`
                    SELECT sv.id, sv.source_code, sv.source_venue_id, sv.name,
                           sv.address, sv.city, sv.country, sv.content_url,
                           sv.latitude, sv.longitude, vsl.match_confidence as confidence
                    FROM unified_venues uv
                    JOIN venue_source_links vsl ON vsl.unified_venue_id = uv.id
                    JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
                    WHERE uv.original_venue_id = $1
                `, [req.params.id]);

                venue.source_references = sourceRefsOld.rows;
            } catch (e2) {
                venue.source_references = [];
            }
        }

        res.json(venue);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get artist from database with source references
app.get('/db/artists/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM artists WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Artist not found' });
        }

        const artist = result.rows[0];

        // Get events featuring this artist
        const eventsResult = await pool.query(`
            SELECT id, title, date, venue_name, venue_city 
            FROM events 
            WHERE artists ILIKE $1
            ORDER BY date DESC
            LIMIT 20
        `, [`%${artist.name}%`]);
        artist.events = eventsResult.rows;

        // Try to get source references from artist_scraped_links (new schema)
        // or fall back to unified_artists (old schema)
        try {
            const sourceRefsNew = await pool.query(`
                SELECT sa.id, sa.source_code, sa.source_artist_id, sa.name,
                       sa.content_url, sa.image_url, asl.match_confidence as confidence
                FROM artist_scraped_links asl
                JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                WHERE asl.artist_id = $1
            `, [req.params.id]);

            if (sourceRefsNew.rows.length > 0) {
                artist.source_references = sourceRefsNew.rows;
            }
        } catch (e) {
            // Table might not exist yet, try old schema via unified_artists
            try {
                const sourceRefsOld = await pool.query(`
                    SELECT sa.id, sa.source_code, sa.source_artist_id, sa.name,
                           sa.content_url, sa.image_url, asl.match_confidence as confidence
                    FROM unified_artists ua
                    JOIN artist_source_links asl ON asl.unified_artist_id = ua.id
                    JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                    WHERE ua.original_artist_id = $1
                `, [req.params.id]);

                artist.source_references = sourceRefsOld.rows;
            } catch (e2) {
                artist.source_references = [];
            }
        }

        res.json(artist);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// NOTE: venues list endpoint moved to VENUES CRUD API section below
// NOTE: artists list endpoint moved to ARTISTS CRUD API section below

// Enrich venues - fetch missing venues from RA API and save to database
app.post('/db/venues/enrich', async (req, res) => {
    try {
        const { limit = 50 } = req.body;

        // Find missing venues
        const missingResult = await pool.query(`
            SELECT DISTINCT e.venue_id, e.venue_name, e.venue_city, e.venue_country
            FROM events e
            LEFT JOIN venues v ON e.venue_id = v.id
            WHERE e.venue_id IS NOT NULL 
            AND v.id IS NULL
            LIMIT $1
        `, [parseInt(limit)]);

        const missing = missingResult.rows;
        let fetched = 0, saved = 0, errors = [];

        // Fetch each venue from RA API
        for (const venue of missing) {
            try {
                const query = `
                    query GetVenue($id: ID!) {
                        venue(id: $id) {
                            id
                            name
                            address
                            contentUrl
                            blurb
                            area {
                                id
                                name
                                country { name }
                            }
                        }
                    }
                `;

                const response = await fetch('https://ra.co/graphql', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                        'Referer': 'https://ra.co/'
                    },
                    body: JSON.stringify({ query, variables: { id: venue.venue_id } })
                });

                const data = await response.json();
                fetched++;

                if (data.data?.venue) {
                    const v = data.data.venue;
                    await pool.query(`
                        INSERT INTO venues (id, name, address, city, country, blurb, content_url, area_id)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (id) DO UPDATE SET
                            name = EXCLUDED.name,
                            address = EXCLUDED.address,
                            city = EXCLUDED.city,
                            country = EXCLUDED.country,
                            blurb = EXCLUDED.blurb,
                            content_url = EXCLUDED.content_url,
                            area_id = EXCLUDED.area_id,
                            updated_at = CURRENT_TIMESTAMP
                    `, [
                        v.id,
                        v.name,
                        v.address,
                        v.area?.name,
                        v.area?.country?.name,
                        v.blurb,
                        v.contentUrl ? `https://ra.co${v.contentUrl}` : null,
                        v.area?.id
                    ]);
                    saved++;
                }

                // Small delay to be nice to the API
                await new Promise(r => setTimeout(r, 100));
            } catch (err) {
                errors.push({ id: venue.venue_id, name: venue.venue_name, error: err.message });
            }
        }

        res.json({
            success: true,
            missing: missing.length,
            fetched,
            saved,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Enrich artists - fetch artists by name from RA API and save to database
// Note: This searches by name since events only store artist names, not IDs
app.post('/db/artists/enrich', async (req, res) => {
    try {
        const { limit = 50 } = req.body;

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
            .map(r => r.artist_name)
            .slice(0, parseInt(limit));

        let fetched = 0, saved = 0, notFound = 0, errors = [];

        // Search and save each artist
        for (const artistName of missing) {
            try {
                // Search for artist by name using RA search API
                const searchQuery = `
                    query SearchArtist($searchTerm: String!) {
                        search(searchTerm: $searchTerm, limit: 5, indices: [ARTIST]) {
                            id
                            value
                            contentUrl
                            countryName
                            searchType
                        }
                    }
                `;

                const response = await fetch('https://ra.co/graphql', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                        'Referer': 'https://ra.co/'
                    },
                    body: JSON.stringify({ query: searchQuery, variables: { searchTerm: artistName } })
                });

                const data = await response.json();
                fetched++;

                const results = data.data?.search || [];
                // Find exact or close match (value is the artist name in search results)
                const match = results.find(a =>
                    a.value && a.value.toLowerCase() === artistName.toLowerCase()
                ) || results[0];

                if (match && match.id) {
                    await pool.query(`
                        INSERT INTO artists (id, name, country, content_url)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (id) DO UPDATE SET
                            name = EXCLUDED.name,
                            country = EXCLUDED.country,
                            content_url = EXCLUDED.content_url,
                            updated_at = CURRENT_TIMESTAMP
                    `, [
                        match.id,
                        match.value,
                        match.countryName,
                        match.contentUrl ? `https://ra.co${match.contentUrl}` : null
                    ]);
                    saved++;
                } else {
                    notFound++;
                }

                // Small delay to be nice to the API
                await new Promise(r => setTimeout(r, 100));
            } catch (err) {
                errors.push({ name: artistName, error: err.message });
            }
        }

        res.json({
            success: true,
            missing: missing.length,
            fetched,
            saved,
            notFound,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get enrichment stats
app.get('/db/enrich/stats', async (req, res) => {
    try {
        // Count venues in events vs venues table
        const venueStats = await pool.query(`
            SELECT 
                (SELECT COUNT(DISTINCT venue_id) FROM events WHERE venue_id IS NOT NULL) as venues_in_events,
                (SELECT COUNT(*) FROM venues) as venues_saved
        `);

        // Count unique artists in events vs artists table  
        const artistsInEventsResult = await pool.query(`
            SELECT COUNT(DISTINCT artist_name) as count FROM (
                SELECT unnest(string_to_array(artists, ', ')) as artist_name
                FROM events WHERE artists IS NOT NULL AND artists != ''
            ) sub
        `);

        const artistsSavedResult = await pool.query('SELECT COUNT(*) FROM artists');

        const stats = venueStats.rows[0];
        stats.artists_in_events = parseInt(artistsInEventsResult.rows[0].count);
        stats.artists_saved = parseInt(artistsSavedResult.rows[0].count);
        stats.venues_missing = parseInt(stats.venues_in_events) - parseInt(stats.venues_saved);
        stats.artists_missing = stats.artists_in_events - stats.artists_saved;

        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ARTISTS CRUD API
// ============================================

// List artists with search and pagination
// Falls back to scraped_artists if artists table is empty
app.get('/db/artists', async (req, res) => {
    try {
        const { search, limit = 50, offset = 0, sort = 'name', order = 'asc' } = req.query;

        // First check if artists table has data
        const artistCountCheck = await pool.query('SELECT COUNT(*) FROM artists');
        const hasArtists = parseInt(artistCountCheck.rows[0].count) > 0;

        if (hasArtists) {
            // Use artists table with source references
            let query = `
                SELECT a.*,
                       COALESCE(
                           (SELECT json_agg(json_build_object(
                               'id', sa.id,
                               'source_code', sa.source_code,
                               'name', sa.name,
                               'confidence', asl.match_confidence
                           ))
                           FROM artist_scraped_links asl
                           JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                           WHERE asl.artist_id = a.id),
                           '[]'
                       ) as source_references
                FROM artists a
                WHERE 1=1`;
            const params = [];
            let paramIndex = 1;

            if (search) {
                query += ` AND (a.name ILIKE $${paramIndex} OR a.country ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
                paramIndex++;
            }

            // Get total count
            const countQuery = `SELECT COUNT(*) FROM artists WHERE 1=1` +
                (search ? ` AND (name ILIKE $1 OR country ILIKE $1)` : '');
            const countParams = search ? [`%${search}%`] : [];
            const countResult = await pool.query(countQuery, countParams);
            const total = parseInt(countResult.rows[0].count);

            // Add sorting and pagination
            const validSorts = ['name', 'country', 'created_at', 'updated_at'];
            const sortCol = validSorts.includes(sort) ? sort : 'name';
            const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

            query += ` ORDER BY ${sortCol} ${sortOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
            params.push(parseInt(limit), parseInt(offset));

            const result = await pool.query(query, params);

            res.json({
                data: result.rows,
                total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        } else {
            // Fall back to scraped_artists table
            let query = `
                SELECT DISTINCT ON (LOWER(name))
                    id,
                    name,
                    image_url,
                    content_url,
                    source_code,
                    genres,
                    scraped_at,
                    updated_at
                FROM scraped_artists
                WHERE name IS NOT NULL AND name != ''
            `;
            const params = [];
            let paramIndex = 1;

            if (search) {
                query += ` AND name ILIKE $${paramIndex}`;
                params.push(`%${search}%`);
                paramIndex++;
            }

            query += ` ORDER BY LOWER(name), scraped_at DESC`;

            // Get total count
            const countResult = await pool.query(`
                SELECT COUNT(DISTINCT LOWER(name)) FROM scraped_artists 
                WHERE name IS NOT NULL AND name != ''
                ${search ? `AND name ILIKE $1` : ''}
            `, search ? [`%${search}%`] : []);
            const total = parseInt(countResult.rows[0].count);

            // Add pagination to wrapped query
            const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
            const finalQuery = `
                SELECT * FROM (${query}) artists
                ORDER BY name ${sortOrder}
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;
            params.push(parseInt(limit), parseInt(offset));

            const result = await pool.query(finalQuery, params);

            res.json({
                data: result.rows,
                total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                source: 'scraped_artists'
            });
        }
    } catch (error) {
        console.error('Error fetching artists:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create artist (goes through unified flow)
app.post('/db/artists', async (req, res) => {
    try {
        const { name, country, content_url, image_url, genres } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // Save as 'original' source entry
        const { scrapedId, sourceId } = await saveOriginalEntry('artist', {
            name, country, content_url, image_url, genres
        });

        // Link to unified (finds match or creates new)
        const unifiedId = await linkToUnified('artist', scrapedId, {
            source_code: 'original', name, country, content_url, image_url, genres
        });

        // Return the unified artist
        const result = await pool.query(`
            SELECT ua.*, 
                (SELECT json_agg(json_build_object(
                    'source_code', sa.source_code,
                    'name', sa.name,
                    'image_url', sa.image_url,
                    'content_url', sa.content_url
                ))
                FROM artist_source_links asl
                JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                WHERE asl.unified_artist_id = ua.id) as source_references
            FROM unified_artists ua WHERE ua.id = $1
        `, [unifiedId]);

        res.json({ success: true, artist: result.rows[0], unified_id: unifiedId });
    } catch (error) {
        console.error('Error creating artist:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update artist (updates original source, refreshes unified)
app.patch('/db/artists/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Check if this is a unified ID (UUID) or old artist ID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

        if (isUUID) {
            // Get the original source entry for this unified artist
            const originalLink = await pool.query(`
                SELECT sa.id as scraped_id, sa.source_artist_id 
                FROM artist_source_links asl
                JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                WHERE asl.unified_artist_id = $1 AND sa.source_code = 'original'
            `, [id]);

            let scrapedId;
            if (originalLink.rows.length > 0) {
                // Update existing original entry
                scrapedId = originalLink.rows[0].scraped_id;
                await pool.query(`
                    UPDATE scraped_artists SET
                        name = COALESCE($1, name),
                        country = COALESCE($2, country),
                        image_url = COALESCE($3, image_url),
                        content_url = COALESCE($4, content_url),
                        genres = COALESCE($5, genres),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $6
                `, [updates.name, updates.country, updates.image_url, updates.content_url,
                updates.genres ? JSON.stringify(updates.genres) : null, scrapedId]);
            } else {
                // Create new original entry and link it
                const saved = await saveOriginalEntry('artist', updates);
                scrapedId = saved.scrapedId;
                await pool.query(`
                    INSERT INTO artist_source_links (unified_artist_id, scraped_artist_id, match_confidence, is_primary, priority)
                    VALUES ($1, $2, 1.0, true, 1)
                `, [id, scrapedId]);
            }

            // Refresh unified with merged data
            await refreshUnifiedArtist(id);

            // Return updated unified artist
            const result = await pool.query(`
                SELECT ua.*, 
                    (SELECT json_agg(json_build_object(
                        'source_code', sa.source_code,
                        'name', sa.name,
                        'image_url', sa.image_url,
                        'content_url', sa.content_url
                    ))
                    FROM artist_source_links asl
                    JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                    WHERE asl.unified_artist_id = ua.id) as source_references
                FROM unified_artists ua WHERE ua.id = $1
            `, [id]);

            res.json({ success: true, artist: result.rows[0] });
        } else {
            // Legacy: update old artists table directly
            const allowedFields = ['name', 'country', 'content_url', 'image_url'];
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
        }
    } catch (error) {
        console.error('Error updating artist:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete artist
app.delete('/db/artists/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM artists WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Artist not found' });
        }
        res.json({ success: true, deleted: req.params.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete ALL artists
app.delete('/db/artists', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM artists RETURNING id');
        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Bulk delete artists
app.post('/db/artists/bulk-delete', async (req, res) => {
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
});

// ============================================
// CITIES CRUD API (single city operations)
// ============================================

// Get single city
app.get('/db/cities/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM cities WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'City not found' });
        }

        // Get venues in this city
        const venuesResult = await pool.query(`
            SELECT DISTINCT venue_name, venue_address, COUNT(*) as event_count
            FROM events
            WHERE venue_city = $1
            GROUP BY venue_name, venue_address
            ORDER BY event_count DESC
        `, [result.rows[0].name]);

        res.json({
            ...result.rows[0],
            venues: venuesResult.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create city
app.post('/db/cities', async (req, res) => {
    try {
        // Ensure cities table exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cities (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                country VARCHAR(100),
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                timezone VARCHAR(50),
                ra_area_id INTEGER,
                is_active BOOLEAN DEFAULT true,
                event_count INTEGER DEFAULT 0,
                venue_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const { name, country, latitude, longitude, timezone, ra_area_id, is_active = true } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const result = await pool.query(`
            INSERT INTO cities (name, country, latitude, longitude, timezone, ra_area_id, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (name) DO UPDATE SET
                country = EXCLUDED.country,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                timezone = EXCLUDED.timezone,
                ra_area_id = EXCLUDED.ra_area_id,
                is_active = EXCLUDED.is_active,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [name, country || null, latitude || null, longitude || null, timezone || null, ra_area_id || null, is_active]);

        res.json({ success: true, city: result.rows[0] });
    } catch (error) {
        console.error('Error creating city:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update city
app.patch('/db/cities/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const allowedFields = ['name', 'country', 'latitude', 'longitude', 'timezone', 'ra_area_id', 'is_active'];
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
            UPDATE cities SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *
        `, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'City not found' });
        }

        res.json({ success: true, city: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete city
app.delete('/db/cities/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM cities WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'City not found' });
        }
        res.json({ success: true, deleted: req.params.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Refresh city stats
app.post('/db/cities/refresh-stats', async (req, res) => {
    try {
        await pool.query(`
            UPDATE cities SET 
                event_count = (SELECT COUNT(*) FROM events WHERE venue_city = cities.name),
                venue_count = (SELECT COUNT(DISTINCT venue_name) FROM events WHERE venue_city = cities.name),
                updated_at = CURRENT_TIMESTAMP
        `);

        res.json({ success: true, message: 'City stats refreshed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// VENUES CRUD API
// ============================================

// List venues with search and pagination
// Get venues - combines venues table with venues extracted from events
app.get('/db/venues', async (req, res) => {
    try {
        const { search, city, limit = 100, offset = 0, sort = 'name', order = 'asc' } = req.query;

        // Always combine venues from both tables to show all venues
        // This ensures Berlin venues (in events) and Hamburg venues (in venues table) both appear
        let query = `
            SELECT DISTINCT ON (LOWER(name), LOWER(city))
                name, address, city, country, latitude, longitude,
                (SELECT COUNT(*) FROM events e WHERE LOWER(e.venue_name) = LOWER(combined.name) AND LOWER(e.venue_city) = LOWER(combined.city)) as event_count
            FROM (
                -- Venues from venues table
                SELECT v.name, v.address, v.city, v.country, v.latitude, v.longitude
                FROM venues v
                UNION ALL
                -- Venues from events table (that might not be in venues yet)
                SELECT venue_name as name, venue_address as address, venue_city as city, venue_country as country, 
                       NULL as latitude, NULL as longitude
                FROM events
                WHERE venue_name IS NOT NULL AND venue_name != ''
            ) combined
            WHERE name IS NOT NULL AND city IS NOT NULL`;
        
        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND (combined.name ILIKE $${paramIndex} OR combined.address ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (city) {
            query += ` AND combined.city ILIKE $${paramIndex}`;
            params.push(`%${city}%`);
            paramIndex++;
        }

        // Get count with same filters - need address column for search filter
        let countQuery = `
            SELECT DISTINCT LOWER(name) as name, LOWER(city) as city, address
            FROM (
                SELECT v.name, v.city, v.address FROM venues v
                UNION ALL
                SELECT venue_name as name, venue_city as city, venue_address as address FROM events WHERE venue_name IS NOT NULL AND venue_name != ''
            ) combined
            WHERE name IS NOT NULL AND city IS NOT NULL`;
        
        const countParams = [];
        let countParamIndex = 1;
        
        if (search) {
            countQuery += ` AND (combined.name ILIKE $${countParamIndex} OR combined.address ILIKE $${countParamIndex})`;
            countParams.push(`%${search}%`);
            countParamIndex++;
        }
        
        if (city) {
            countQuery += ` AND combined.city ILIKE $${countParamIndex}`;
            countParams.push(`%${city}%`);
            countParamIndex++;
        }
        
        // Wrap in a COUNT to get total unique venues
        const wrappedCountQuery = `SELECT COUNT(*) FROM (${countQuery}) subq`;
        const countResult = await pool.query(wrappedCountQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        // Add sorting and pagination
        const validSorts = ['name', 'city', 'country', 'event_count'];
        const sortCol = validSorts.includes(sort) ? sort : 'name';
        const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

        query += ` ORDER BY LOWER(name), LOWER(city), ${sortCol} ${sortOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        res.json({
            data: result.rows,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            source: 'combined'
        });
    } catch (error) {
        console.error('Error fetching venues:', error);
        res.status(500).json({ error: error.message });
    }
});

// Sync venues from events - creates missing venues in venues table
app.post('/db/venues/sync-from-events', async (req, res) => {
    try {
        // Get all unique venue combinations from events that don't exist in venues table
        const missingVenues = await pool.query(`
            SELECT DISTINCT 
                e.venue_name,
                e.venue_address,
                e.venue_city,
                e.venue_country,
                COUNT(*) as event_count
            FROM events e
            WHERE e.venue_name IS NOT NULL 
            AND e.venue_name != ''
            AND NOT EXISTS (
                SELECT 1 FROM venues v 
                WHERE LOWER(v.name) = LOWER(e.venue_name) 
                AND LOWER(v.city) = LOWER(e.venue_city)
            )
            GROUP BY e.venue_name, e.venue_address, e.venue_city, e.venue_country
            ORDER BY COUNT(*) DESC
        `);

        let created = 0;
        let errors = 0;
        const results = [];

        for (const venue of missingVenues.rows) {
            try {
                const venueId = uuidv4();
                
                // Try to geocode if no coordinates
                let latitude = null;
                let longitude = null;
                
                if (venue.venue_address && venue.venue_city) {
                    console.log(`[Sync Venues] Geocoding ${venue.venue_name}, ${venue.venue_city}...`);
                    const coords = await geocodeAddress(venue.venue_address, venue.venue_city, venue.venue_country);
                    if (coords) {
                        latitude = coords.latitude;
                        longitude = coords.longitude;
                        console.log(`[Sync Venues] Geocoded: ${latitude}, ${longitude}`);
                    }
                    // Small delay to respect rate limits
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                await pool.query(`
                    INSERT INTO venues (id, name, address, city, country, latitude, longitude, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [
                    venueId,
                    venue.venue_name,
                    venue.venue_address,
                    venue.venue_city,
                    venue.venue_country,
                    latitude,
                    longitude
                ]);

                created++;
                results.push({
                    name: venue.venue_name,
                    city: venue.venue_city,
                    event_count: venue.event_count,
                    geocoded: latitude && longitude ? true : false
                });
            } catch (error) {
                console.error(`Error creating venue ${venue.venue_name}:`, error);
                errors++;
            }
        }

        res.json({
            success: true,
            found: missingVenues.rows.length,
            created,
            errors,
            results: results.slice(0, 20) // Show first 20
        });
    } catch (error) {
        console.error('Error syncing venues:', error);
        res.status(500).json({ error: error.message });
    }
});

// Link events to venues and geocode missing venues
app.post('/db/venues/link-events', async (req, res) => {
    try {
        // First, ensure all venues exist
        await pool.query(`
            INSERT INTO venues (id, name, address, city, country, created_at, updated_at)
            SELECT 
                gen_random_uuid(),
                e.venue_name,
                e.venue_address,
                e.venue_city,
                e.venue_country,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            FROM (
                SELECT DISTINCT ON (LOWER(venue_name), LOWER(venue_city))
                    venue_name,
                    venue_address,
                    venue_city,
                    venue_country
                FROM events
                WHERE venue_name IS NOT NULL 
                AND venue_name != ''
            ) e
            WHERE NOT EXISTS (
                SELECT 1 FROM venues v 
                WHERE LOWER(v.name) = LOWER(e.venue_name) 
                AND LOWER(v.city) = LOWER(e.venue_city)
            )
        `);

        // Link events to venues by matching name and city
        const linkResult = await pool.query(`
            UPDATE events e
            SET venue_id = v.id
            FROM venues v
            WHERE e.venue_id IS NULL
            AND LOWER(e.venue_name) = LOWER(v.name)
            AND LOWER(e.venue_city) = LOWER(v.city)
            RETURNING e.id
        `);

        // Find venues without coordinates that have addresses
        const venuesNeedingGeocode = await pool.query(`
            SELECT DISTINCT v.id, v.name, v.address, v.city, v.country
            FROM venues v
            WHERE (v.latitude IS NULL OR v.longitude IS NULL)
            AND v.address IS NOT NULL
            AND v.address != ''
            LIMIT 50
        `);

        let geocoded = 0;
        for (const venue of venuesNeedingGeocode.rows) {
            try {
                console.log(`[Link Events] Geocoding ${venue.name}, ${venue.city}...`);
                const coords = await geocodeAddress(venue.address, venue.city, venue.country);
                if (coords) {
                    await pool.query(`
                        UPDATE venues 
                        SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $3
                    `, [coords.latitude, coords.longitude, venue.id]);
                    geocoded++;
                    console.log(`[Link Events] Geocoded ${venue.name}: ${coords.latitude}, ${coords.longitude}`);
                }
                // Rate limit: 1 request per second
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Error geocoding venue ${venue.name}:`, error);
            }
        }

        res.json({
            success: true,
            linked: linkResult.rowCount,
            geocoded,
            message: `Linked ${linkResult.rowCount} events to venues and geocoded ${geocoded} venues`
        });
    } catch (error) {
        console.error('Error linking events to venues:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create venue (goes through unified flow)
app.post('/db/venues', async (req, res) => {
    try {
        let { name, address, city, country, blurb, content_url, latitude, longitude, capacity } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // Geocode if address is present but coordinates are missing
        if ((!latitude || !longitude) && address) {
            console.log(`[Create Venue] Missing coordinates for "${name}", attempting to geocode address: ${address}`);
            const coords = await geocodeAddress(address, city, country);
            if (coords) {
                latitude = coords.latitude;
                longitude = coords.longitude;
            }
        }

        // Save as 'original' source entry
        const { scrapedId, sourceId } = await saveOriginalEntry('venue', {
            name, address, city, country, content_url, latitude, longitude, capacity
        });

        // Link to unified (finds match or creates new)
        const unifiedId = await linkToUnified('venue', scrapedId, {
            source_code: 'original', name, address, city, country, content_url, latitude, longitude, capacity
        });

        // Return the unified venue
        const result = await pool.query(`
            SELECT uv.*, 
                (SELECT json_agg(json_build_object(
                    'source_code', sv.source_code,
                    'name', sv.name,
                    'address', sv.address,
                    'content_url', sv.content_url
                ))
                FROM venue_source_links vsl
                JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
                WHERE vsl.unified_venue_id = uv.id) as source_references
            FROM unified_venues uv WHERE uv.id = $1
        `, [unifiedId]);

        res.json({ success: true, venue: result.rows[0], unified_id: unifiedId });
    } catch (error) {
        console.error('Error creating venue:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update venue (updates original source, refreshes unified)
app.patch('/db/venues/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Check if this is a unified ID (UUID)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

        if (isUUID) {
            // Get the original source entry for this unified venue
            const originalLink = await pool.query(`
                SELECT sv.id as scraped_id, sv.source_venue_id, sv.address, sv.city, sv.country, sv.latitude, sv.longitude
                FROM venue_source_links vsl
                JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
                WHERE vsl.unified_venue_id = $1 AND sv.source_code = 'original'
            `, [id]);

            // Geocode if needed
            if (originalLink.rows.length > 0) {
                const current = originalLink.rows[0];
                const effectiveAddress = updates.address || current.address;
                const effectiveCity = updates.city || current.city;
                const effectiveCountry = updates.country || current.country;

                const hasCoords = (updates.latitude && updates.longitude) || (current.latitude && current.longitude);
                const addressChanged = updates.address && updates.address !== current.address;

                if ((!hasCoords || addressChanged) && effectiveAddress) {
                    console.log(`[Update Venue] Resolving coordinates for unified venue ${id}`);
                    const coords = await geocodeAddress(effectiveAddress, effectiveCity, effectiveCountry);
                    if (coords) {
                        updates.latitude = coords.latitude;
                        updates.longitude = coords.longitude;
                    }
                }
            } else if (updates.address && (!updates.latitude || !updates.longitude)) {
                // New original entry being created, but missing coords
                const coords = await geocodeAddress(updates.address, updates.city, updates.country);
                if (coords) {
                    updates.latitude = coords.latitude;
                    updates.longitude = coords.longitude;
                }
            }

            let scrapedId;
            if (originalLink.rows.length > 0) {
                // Update existing original entry
                scrapedId = originalLink.rows[0].scraped_id;
                await pool.query(`
                    UPDATE scraped_venues SET
                        name = COALESCE($1, name),
                        address = COALESCE($2, address),
                        city = COALESCE($3, city),
                        country = COALESCE($4, country),
                        latitude = COALESCE($5, latitude),
                        longitude = COALESCE($6, longitude),
                        content_url = COALESCE($7, content_url),
                        capacity = COALESCE($8, capacity),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $9
                `, [updates.name, updates.address, updates.city, updates.country,
                updates.latitude, updates.longitude, updates.content_url, updates.capacity, scrapedId]);
            } else {
                // Create new original entry and link it
                const saved = await saveOriginalEntry('venue', updates);
                scrapedId = saved.scrapedId;
                await pool.query(`
                    INSERT INTO venue_source_links (unified_venue_id, scraped_venue_id, match_confidence, is_primary, priority)
                    VALUES ($1, $2, 1.0, true, 1)
                `, [id, scrapedId]);
            }

            // Refresh unified with merged data
            await refreshUnifiedVenue(id);

            // Return updated unified venue
            const result = await pool.query(`
                SELECT uv.*, 
                    (SELECT json_agg(json_build_object(
                        'source_code', sv.source_code,
                        'name', sv.name,
                        'address', sv.address,
                        'content_url', sv.content_url
                    ))
                    FROM venue_source_links vsl
                    JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
                    WHERE vsl.unified_venue_id = uv.id) as source_references
                FROM unified_venues uv WHERE uv.id = $1
            `, [id]);

            res.json({ success: true, venue: result.rows[0] });
        } else {
            // Legacy: update old venues table directly

            // Fetch current venue to check for missing coordinates
            const currentVenueRes = await pool.query('SELECT * FROM venues WHERE id = $1', [id]);
            if (currentVenueRes.rows.length > 0) {
                const current = currentVenueRes.rows[0];
                const effectiveAddress = updates.address || current.address;
                const effectiveCity = updates.city || current.city;
                const effectiveCountry = updates.country || current.country;

                const hasCoords = (updates.latitude && updates.longitude) || (current.latitude && current.longitude);
                const addressChanged = updates.address && updates.address !== current.address;

                if ((!hasCoords || addressChanged) && effectiveAddress) {
                    console.log(`[Update Venue] Resolving coordinates for legacy venue ${id}`);
                    const coords = await geocodeAddress(effectiveAddress, effectiveCity, effectiveCountry);
                    if (coords) {
                        updates.latitude = coords.latitude;
                        updates.longitude = coords.longitude;
                    }
                }
            }

            const allowedFields = ['name', 'address', 'city', 'country', 'blurb', 'content_url', 'latitude', 'longitude'];
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
                UPDATE venues SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *
            `, values);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Venue not found' });
            }

            res.json({ success: true, venue: result.rows[0] });
        }
    } catch (error) {
        console.error('Error updating venue:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete venue
app.delete('/db/venues/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM venues WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Venue not found' });
        }
        res.json({ success: true, deleted: req.params.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete ALL venues
app.delete('/db/venues', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM venues RETURNING id');
        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Bulk delete venues
app.post('/db/venues/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids must be a non-empty array' });
        }

        const result = await pool.query(
            'DELETE FROM venues WHERE id = ANY($1::text[]) RETURNING id',
            [ids]
        );

        res.json({ success: true, deleted: result.rows.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Geocode venue address
app.post('/db/venues/:id/geocode', async (req, res) => {
    try {
        const venue = await pool.query('SELECT * FROM venues WHERE id = $1', [req.params.id]);
        if (venue.rows.length === 0) {
            return res.status(404).json({ error: 'Venue not found' });
        }

        const v = venue.rows[0];
        const coords = await geocodeAddress(v.address, v.city, v.country);

        if (coords) {
            const result = await pool.query(`
                UPDATE venues SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $3 RETURNING *
            `, [coords.latitude, coords.longitude, req.params.id]);

            res.json({ success: true, venue: result.rows[0] });
        } else {
            res.status(400).json({ error: 'Could not geocode address' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ENHANCED EVENTS API
// ============================================

// Bulk operations for events
app.post('/db/events/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids must be a non-empty array' });
        }

        const result = await pool.query(
            'DELETE FROM events WHERE id = ANY($1::text[]) RETURNING id',
            [ids]
        );

        res.json({ success: true, deleted: result.rows.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get event statistics
app.get('/db/events/statistics', async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_events,
                COUNT(CASE WHEN is_published = true THEN 1 END) as published_events,
                COUNT(CASE WHEN date >= CURRENT_DATE THEN 1 END) as upcoming_events,
                COUNT(CASE WHEN date < CURRENT_DATE THEN 1 END) as past_events,
                COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as geocoded_events,
                COUNT(DISTINCT venue_name) as unique_venues,
                COUNT(DISTINCT venue_city) as unique_cities,
                MIN(date) as earliest_date,
                MAX(date) as latest_date
            FROM events
        `);

        const byCity = await pool.query(`
            SELECT venue_city as city, COUNT(*) as count,
                   COUNT(CASE WHEN is_published = true THEN 1 END) as published
            FROM events
            WHERE venue_city IS NOT NULL
            GROUP BY venue_city
            ORDER BY count DESC
            LIMIT 10
        `);

        const byMonth = await pool.query(`
            SELECT 
                date_trunc('month', date) as month,
                COUNT(*) as count
            FROM events
            WHERE date IS NOT NULL AND date >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY date_trunc('month', date)
            ORDER BY month
        `);

        const recentActivity = await pool.query(`
            SELECT id, title, venue_name, venue_city, created_at, updated_at
            FROM events
            ORDER BY updated_at DESC
            LIMIT 10
        `);

        res.json({
            ...stats.rows[0],
            by_city: byCity.rows,
            by_month: byMonth.rows,
            recent_activity: recentActivity.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Dashboard overview stats
app.get('/db/dashboard', async (req, res) => {
    try {
        const [events, venues, artists, cities] = await Promise.all([
            pool.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN is_published = true THEN 1 END) as published,
                    COUNT(CASE WHEN date >= CURRENT_DATE THEN 1 END) as upcoming,
                    COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as new_this_week
                FROM events
            `),
            pool.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as geocoded
                FROM venues
            `),
            pool.query('SELECT COUNT(*) as total FROM artists'),
            pool.query(`
                SELECT COUNT(DISTINCT venue_city) as total FROM events WHERE venue_city IS NOT NULL
            `)
        ]);

        const recentEvents = await pool.query(`
            SELECT id, title, venue_name, venue_city, date, is_published, created_at
            FROM events
            ORDER BY created_at DESC
            LIMIT 5
        `);

        const upcomingEvents = await pool.query(`
            SELECT id, title, venue_name, venue_city, date, is_published
            FROM events
            WHERE date >= CURRENT_DATE
            ORDER BY date ASC
            LIMIT 5
        `);

        res.json({
            stats: {
                events: events.rows[0],
                venues: venues.rows[0],
                artists: artists.rows[0],
                cities: cities.rows[0]
            },
            recent_events: recentEvents.rows,
            upcoming_events: upcomingEvents.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// MULTI-SOURCE SCRAPING SYSTEM
// =====================================================

const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY || 'X7oyk3K4mzYNxVTWjXsuX2fU7nJPPqOT';

// City to country code mapping for Ticketmaster
const TICKETMASTER_CITY_MAP = {
    // Germany (all major cities)
    'berlin': { city: 'Berlin', countryCode: 'DE' },
    'hamburg': { city: 'Hamburg', countryCode: 'DE' },
    'munich': { city: 'Munich', countryCode: 'DE' },
    'cologne': { city: 'Cologne', countryCode: 'DE' },
    'frankfurt': { city: 'Frankfurt', countryCode: 'DE' },
    'stuttgart': { city: 'Stuttgart', countryCode: 'DE' },
    'dusseldorf': { city: 'Dusseldorf', countryCode: 'DE' },
    'düsseldorf': { city: 'Dusseldorf', countryCode: 'DE' },
    'dortmund': { city: 'Dortmund', countryCode: 'DE' },
    'essen': { city: 'Essen', countryCode: 'DE' },
    'leipzig': { city: 'Leipzig', countryCode: 'DE' },
    'bremen': { city: 'Bremen', countryCode: 'DE' },
    'dresden': { city: 'Dresden', countryCode: 'DE' },
    'hanover': { city: 'Hanover', countryCode: 'DE' },
    'hannover': { city: 'Hanover', countryCode: 'DE' },
    'nuremberg': { city: 'Nuremberg', countryCode: 'DE' },
    'nürnberg': { city: 'Nuremberg', countryCode: 'DE' },
    'duisburg': { city: 'Duisburg', countryCode: 'DE' },
    'bochum': { city: 'Bochum', countryCode: 'DE' },
    'wuppertal': { city: 'Wuppertal', countryCode: 'DE' },
    'bielefeld': { city: 'Bielefeld', countryCode: 'DE' },
    'bonn': { city: 'Bonn', countryCode: 'DE' },
    'mannheim': { city: 'Mannheim', countryCode: 'DE' },
    'karlsruhe': { city: 'Karlsruhe', countryCode: 'DE' },
    'augsburg': { city: 'Augsburg', countryCode: 'DE' },
    'wiesbaden': { city: 'Wiesbaden', countryCode: 'DE' },
    'münster': { city: 'Munster', countryCode: 'DE' },
    'munster': { city: 'Munster', countryCode: 'DE' },
    'freiburg': { city: 'Freiburg', countryCode: 'DE' },
    'mainz': { city: 'Mainz', countryCode: 'DE' },
    'kiel': { city: 'Kiel', countryCode: 'DE' },
    'aachen': { city: 'Aachen', countryCode: 'DE' },
    'rostock': { city: 'Rostock', countryCode: 'DE' },
    // UK
    'london': { city: 'London', countryCode: 'GB' },
    'manchester': { city: 'Manchester', countryCode: 'GB' },
    'birmingham': { city: 'Birmingham', countryCode: 'GB' },
    'glasgow': { city: 'Glasgow', countryCode: 'GB' },
    'leeds': { city: 'Leeds', countryCode: 'GB' },
    'liverpool': { city: 'Liverpool', countryCode: 'GB' },
    'bristol': { city: 'Bristol', countryCode: 'GB' },
    'edinburgh': { city: 'Edinburgh', countryCode: 'GB' },
    // Other Europe
    'paris': { city: 'Paris', countryCode: 'FR' },
    'amsterdam': { city: 'Amsterdam', countryCode: 'NL' },
    'barcelona': { city: 'Barcelona', countryCode: 'ES' },
    'madrid': { city: 'Madrid', countryCode: 'ES' },
    'vienna': { city: 'Vienna', countryCode: 'AT' },
    'zurich': { city: 'Zurich', countryCode: 'CH' },
    'brussels': { city: 'Brussels', countryCode: 'BE' },
    'prague': { city: 'Prague', countryCode: 'CZ' },
    'copenhagen': { city: 'Copenhagen', countryCode: 'DK' },
    'stockholm': { city: 'Stockholm', countryCode: 'SE' },
    'oslo': { city: 'Oslo', countryCode: 'NO' },
    'milan': { city: 'Milan', countryCode: 'IT' },
    'rome': { city: 'Rome', countryCode: 'IT' },
    // USA
    'new york': { city: 'New York', countryCode: 'US' },
    'los angeles': { city: 'Los Angeles', countryCode: 'US' },
    'chicago': { city: 'Chicago', countryCode: 'US' },
    'miami': { city: 'Miami', countryCode: 'US' },
    'san francisco': { city: 'San Francisco', countryCode: 'US' },
    'seattle': { city: 'Seattle', countryCode: 'US' },
    'boston': { city: 'Boston', countryCode: 'US' },
    'detroit': { city: 'Detroit', countryCode: 'US' },
    'austin': { city: 'Austin', countryCode: 'US' },
    'denver': { city: 'Denver', countryCode: 'US' },
    'atlanta': { city: 'Atlanta', countryCode: 'US' }
};

// RA Area ID mapping (research from ra.co)
const RA_AREA_MAP = {
    // Germany
    'berlin': 34,
    'hamburg': 148,
    'cologne': 143,
    'frankfurt': 147,
    'munich': 151,
    'düsseldorf': 144,
    'dusseldorf': 144,
    'stuttgart': 154,
    'leipzig': 149,
    'dresden': 145,
    'hannover': 178,
    'hanover': 178,
    'nuremberg': 150,
    'nürnberg': 150,
    'mannheim': 176,
    'freiburg': 146,
    'münster': 179,
    'munster': 179,
    'dortmund': 177,
    'essen': 175,
    'bremen': 142,
    // UK
    'london': 13,
    'manchester': 15,
    'bristol': 16,
    'leeds': 17,
    'birmingham': 18,
    'glasgow': 41,
    'edinburgh': 42,
    'liverpool': 43,
    'brighton': 14,
    'nottingham': 45,
    'sheffield': 46,
    // Other Europe
    'amsterdam': 29,
    'paris': 12,
    'barcelona': 20,
    'madrid': 63,
    'ibiza': 24,
    'vienna': 159,
    'zurich': 69,
    'prague': 160,
    'brussels': 30,
    'copenhagen': 58,
    'stockholm': 59,
    'oslo': 62,
    'lisbon': 64,
    'milan': 65,
    'rome': 66,
    // USA
    'new york': 8,
    'los angeles': 38,
    'san francisco': 39,
    'miami': 44,
    'chicago': 19,
    'detroit': 21,
    'seattle': 40,
    'boston': 47,
    'austin': 48,
    'denver': 49,
    'atlanta': 50,
    // Other
    'tokyo': 10,
    'melbourne': 6,
    'sydney': 5
};

// Ticketmaster API scraper
async function scrapeTicketmaster(city, options = {}) {
    const cityConfig = TICKETMASTER_CITY_MAP[city.toLowerCase()];
    if (!cityConfig) {
        throw new Error(`City not configured for Ticketmaster: ${city}. Available: ${Object.keys(TICKETMASTER_CITY_MAP).join(', ')}`);
    }

    const { limit = 100, classificationName = 'Music' } = options;
    const params = new URLSearchParams({
        city: cityConfig.city,
        countryCode: cityConfig.countryCode,
        apikey: TICKETMASTER_API_KEY,
        size: Math.min(limit, 200).toString(),
        classificationName: classificationName,
        sort: 'date,asc'
    });

    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params}`;
    console.log(`Fetching Ticketmaster: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ticketmaster API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const events = data._embedded?.events || [];

    return events.map(event => {
        const venue = event._embedded?.venues?.[0];
        const attractions = event._embedded?.attractions || [];
        const priceRange = event.priceRanges?.[0];

        return {
            source_code: 'ticketmaster',
            source_event_id: event.id,
            title: event.name,
            date: event.dates?.start?.localDate || null,
            start_time: event.dates?.start?.localTime || null,
            end_time: null,
            content_url: event.url,
            flyer_front: event.images?.find(i => i.ratio === '16_9')?.url || event.images?.[0]?.url,
            description: event.info || event.pleaseNote,
            venue_name: venue?.name,
            venue_address: [venue?.address?.line1, venue?.address?.line2].filter(Boolean).join(', '),
            venue_city: venue?.city?.name || cityConfig.city,
            venue_country: venue?.country?.name || venue?.country?.countryCode,
            venue_latitude: venue?.location?.latitude ? parseFloat(venue.location.latitude) : null,
            venue_longitude: venue?.location?.longitude ? parseFloat(venue.location.longitude) : null,
            artists_json: attractions.map(a => ({
                source_artist_id: a.id,
                name: a.name,
                genres: a.classifications?.map(c => c.genre?.name).filter(Boolean),
                image_url: a.images?.[0]?.url
            })),
            price_info: priceRange ? {
                min: priceRange.min,
                max: priceRange.max,
                currency: priceRange.currency
            } : null,
            raw_data: event,
            venue_raw: venue ? {
                source_venue_id: venue.id,
                name: venue.name,
                address: [venue.address?.line1, venue.address?.line2].filter(Boolean).join(', '),
                city: venue.city?.name,
                country: venue.country?.name,
                latitude: venue.location?.latitude,
                longitude: venue.location?.longitude,
                content_url: venue.url
            } : null
        };
    });
}

// RA GraphQL scraper
async function scrapeResidentAdvisor(city, options = {}) {
    const areaId = RA_AREA_MAP[city.toLowerCase()];
    if (!areaId) {
        throw new Error(`City not configured for Resident Advisor: ${city}. Available: ${Object.keys(RA_AREA_MAP).join(', ')}`);
    }

    const { limit = 100, startDate, endDate } = options;
    const today = new Date().toISOString().split('T')[0];

    const query = `
        query GetEvents($filters: FilterInputDtoInput, $pageSize: Int) {
            eventListings(filters: $filters, pageSize: $pageSize) {
                data {
                    event {
                        id
                        title
                        date
                        startTime
                        endTime
                        contentUrl
                        flyerFront
                        content
                        venue {
                            id
                            name
                            address
                            area {
                                name
                                country { name }
                            }
                        }
                        artists { id name }
                    }
                    listingDate
                }
                totalResults
            }
        }
    `;

    const filters = {
        areas: { eq: areaId },
        listingDate: {
            gte: startDate || today,
            lte: endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
    };

    const response = await fetch('https://ra.co/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Referer': 'https://ra.co/'
        },
        body: JSON.stringify({ query, variables: { filters, pageSize: parseInt(limit) } })
    });

    const data = await response.json();
    if (data.errors) {
        throw new Error(`RA GraphQL error: ${JSON.stringify(data.errors)}`);
    }

    const listings = data.data.eventListings.data || [];

    return listings.map(listing => {
        const e = listing.event;
        if (!e) return null;

        return {
            source_code: 'ra',
            source_event_id: e.id,
            title: e.title,
            date: e.date?.split('T')[0] || null,
            start_time: e.startTime?.split('T')[1]?.substring(0, 8) || null,
            end_time: e.endTime?.split('T')[1]?.substring(0, 8) || null,
            content_url: e.contentUrl ? `https://ra.co${e.contentUrl}` : null,
            flyer_front: e.flyerFront,
            description: e.content?.substring(0, 5000),
            venue_name: e.venue?.name,
            venue_address: e.venue?.address,
            venue_city: e.venue?.area?.name,
            venue_country: e.venue?.area?.country?.name,
            venue_latitude: null,
            venue_longitude: null,
            artists_json: (e.artists || []).map(a => ({
                source_artist_id: a.id,
                name: a.name
            })),
            price_info: null,
            raw_data: { ...e, listingDate: listing.listingDate },
            venue_raw: e.venue ? {
                source_venue_id: e.venue.id,
                name: e.venue.name,
                address: e.venue.address,
                city: e.venue.area?.name,
                country: e.venue.area?.country?.name
            } : null
        };
    }).filter(Boolean);
}

// Save scraped events to database
// Extract postal code from address
function extractPostalCode(address) {
    if (!address) return null;
    
    // Match common postal code patterns
    // 5-digit codes (US, Germany, etc): 12345
    // UK postcodes: SW1A 1AA, EC1A 1BB
    // Canada: K1A 0B1
    const patterns = [
        /\b\d{5}\b/,                          // 5-digit (US, Germany)
        /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b/i, // UK
        /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i      // Canada
    ];
    
    for (const pattern of patterns) {
        const match = address.match(pattern);
        if (match) {
            return match[0].trim();
        }
    }
    
    return null;
}

// Clean address by removing duplicate city/country information and extracting postal code
function cleanVenueAddress(address, city, country) {
    if (!address) return { address: address, postalCode: null };
    
    let cleaned = address;
    let postalCode = null;
    
    // Extract postal code before cleaning
    postalCode = extractPostalCode(cleaned);
    
    // Parse address that might contain: "Street; District; Postal City; Country"
    if (cleaned.includes(';')) {
        const parts = cleaned.split(';').map(p => p.trim());
        // Take only the first part (street address)
        cleaned = parts[0];
    }
    
    // Remove city from address if it appears
    if (city && cleaned.toLowerCase().includes(city.toLowerCase())) {
        // Use word boundary to avoid partial matches
        const cityRegex = new RegExp(`[,\\s]*${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,\\s]*`, 'gi');
        cleaned = cleaned.replace(cityRegex, ' ');
    }
    
    // Remove country from address if it appears
    if (country && cleaned.toLowerCase().includes(country.toLowerCase())) {
        const countryRegex = new RegExp(`[,\\s]*${country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,\\s]*`, 'gi');
        cleaned = cleaned.replace(countryRegex, ' ');
    }
    
    // Remove postal code from address
    if (postalCode) {
        cleaned = cleaned.replace(postalCode, '');
    }
    
    // Clean up extra commas, spaces, and trim
    cleaned = cleaned
        .replace(/,+/g, ',')           // Multiple commas to single
        .replace(/\s+/g, ' ')          // Multiple spaces to single
        .replace(/^[,\s]+|[,\s]+$/g, '') // Trim commas and spaces
        .trim();
    
    return { address: cleaned, postalCode };
}

async function saveScrapedEvents(events, options = {}) {
    const { geocodeMissing = true } = options;
    let inserted = 0, updated = 0, geocoded = 0;
    const savedVenues = new Set();
    const savedArtists = new Set();

    for (const event of events) {
        try {
            // Clean venue address before processing and extract postal code
            let venuePostalCode = null;
            if (event.venue_address) {
                const cleaned = cleanVenueAddress(
                    event.venue_address,
                    event.venue_city,
                    event.venue_country
                );
                event.venue_address = cleaned.address;
                venuePostalCode = cleaned.postalCode;
            }
            
            // Geocode if coordinates are missing and we have address info
            let venueLat = event.venue_latitude;
            let venueLon = event.venue_longitude;

            if (geocodeMissing && (!venueLat || !venueLon) && (event.venue_address || event.venue_name)) {
                try {
                    const coords = await geocodeAddress(
                        event.venue_address || event.venue_name,
                        event.venue_city,
                        event.venue_country
                    );
                    if (coords) {
                        venueLat = coords.latitude;
                        venueLon = coords.longitude;
                        geocoded++;
                        // Also update venue_raw if exists
                        if (event.venue_raw) {
                            event.venue_raw.latitude = venueLat;
                            event.venue_raw.longitude = venueLon;
                        }
                    }
                } catch (geoErr) {
                    console.warn(`[Geocode] Failed for ${event.venue_name}: ${geoErr.message}`);
                }
            }

            // Check if event exists and detect changes
            const existingEvent = await pool.query(`
                SELECT * FROM scraped_events 
                WHERE source_code = $1 AND source_event_id = $2
            `, [event.source_code, event.source_event_id]);

            const isNew = existingEvent.rows.length === 0;
            let hasChanges = false;
            let changes = {};

            if (!isNew) {
                // Detect field-level changes
                const old = existingEvent.rows[0];
                const compareFields = [
                    'title', 'date', 'start_time', 'end_time', 'content_url', 
                    'flyer_front', 'description', 'venue_name', 'venue_address',
                    'venue_city', 'venue_country'
                ];

                for (const field of compareFields) {
                    const oldVal = old[field];
                    const newVal = event[field];
                    
                    // Normalize for comparison
                    const normalizeVal = (v) => {
                        if (v === null || v === undefined || v === '') return null;
                        if (typeof v === 'string') return v.trim();
                        return v;
                    };
                    
                    const oldNorm = normalizeVal(oldVal);
                    const newNorm = normalizeVal(newVal);
                    
                    if (oldNorm !== newNorm) {
                        changes[field] = { old: oldVal, new: newVal };
                        hasChanges = true;
                    }
                }

                // Check artists changes
                const oldArtists = old.artists_json || [];
                const newArtists = event.artists_json || [];
                if (JSON.stringify(oldArtists) !== JSON.stringify(newArtists)) {
                    changes.artists_json = { old: oldArtists, new: newArtists };
                    hasChanges = true;
                }

                // Check coordinates if provided
                if (venueLat && old.venue_latitude && Math.abs(parseFloat(venueLat) - parseFloat(old.venue_latitude)) > 0.0001) {
                    changes.venue_latitude = { old: old.venue_latitude, new: venueLat };
                    hasChanges = true;
                }
                if (venueLon && old.venue_longitude && Math.abs(parseFloat(venueLon) - parseFloat(old.venue_longitude)) > 0.0001) {
                    changes.venue_longitude = { old: old.venue_longitude, new: venueLon };
                    hasChanges = true;
                }
            }

            // Save scraped event with change tracking
            const eventResult = await pool.query(`
                INSERT INTO scraped_events (
                    source_code, source_event_id, title, date, start_time, end_time,
                    content_url, flyer_front, description, venue_name, venue_address,
                    venue_city, venue_country, venue_latitude, venue_longitude,
                    artists_json, price_info, raw_data, has_changes, changes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                ON CONFLICT (source_code, source_event_id) DO UPDATE SET
                    title = EXCLUDED.title,
                    date = EXCLUDED.date,
                    start_time = EXCLUDED.start_time,
                    end_time = EXCLUDED.end_time,
                    content_url = EXCLUDED.content_url,
                    flyer_front = EXCLUDED.flyer_front,
                    description = EXCLUDED.description,
                    venue_name = EXCLUDED.venue_name,
                    venue_address = EXCLUDED.venue_address,
                    venue_city = EXCLUDED.venue_city,
                    venue_country = EXCLUDED.venue_country,
                    venue_latitude = COALESCE(EXCLUDED.venue_latitude, scraped_events.venue_latitude),
                    venue_longitude = COALESCE(EXCLUDED.venue_longitude, scraped_events.venue_longitude),
                    artists_json = EXCLUDED.artists_json,
                    price_info = EXCLUDED.price_info,
                    raw_data = EXCLUDED.raw_data,
                    has_changes = EXCLUDED.has_changes,
                    changes = EXCLUDED.changes,
                    updated_at = CASE WHEN EXCLUDED.has_changes THEN CURRENT_TIMESTAMP ELSE scraped_events.updated_at END
                RETURNING id, (xmax = 0) AS is_inserted
            `, [
                event.source_code,
                event.source_event_id,
                event.title,
                event.date,
                event.start_time,
                event.end_time,
                event.content_url,
                event.flyer_front,
                event.description,
                event.venue_name,
                event.venue_address,
                event.venue_city,
                event.venue_country,
                venueLat,
                venueLon,
                JSON.stringify(event.artists_json),
                event.price_info ? JSON.stringify(event.price_info) : null,
                JSON.stringify(event.raw_data),
                hasChanges,
                hasChanges ? JSON.stringify(changes) : null
            ]);

            if (eventResult.rows[0].is_inserted) {
                inserted++;
            } else if (hasChanges) {
                updated++;
                
                // Mark linked events as having pending changes
                await pool.query(`
                    UPDATE events SET has_pending_changes = true
                    WHERE id IN (
                        SELECT event_id FROM event_scraped_links 
                        WHERE scraped_event_id = $1
                    )
                `, [eventResult.rows[0].id]);
            }

            // Save scraped venue if present
            if (event.venue_raw && event.venue_raw.source_venue_id) {
                const venueKey = `${event.source_code}:${event.venue_raw.source_venue_id}`;
                if (!savedVenues.has(venueKey)) {
                    await pool.query(`
                        INSERT INTO scraped_venues (
                            source_code, source_venue_id, name, address, city, country,
                            latitude, longitude, content_url, raw_data
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        ON CONFLICT (source_code, source_venue_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            address = COALESCE(EXCLUDED.address, scraped_venues.address),
                            city = COALESCE(EXCLUDED.city, scraped_venues.city),
                            country = COALESCE(EXCLUDED.country, scraped_venues.country),
                            latitude = COALESCE(EXCLUDED.latitude, scraped_venues.latitude),
                            longitude = COALESCE(EXCLUDED.longitude, scraped_venues.longitude),
                            content_url = COALESCE(EXCLUDED.content_url, scraped_venues.content_url),
                            updated_at = CURRENT_TIMESTAMP
                    `, [
                        event.source_code,
                        event.venue_raw.source_venue_id,
                        event.venue_raw.name,
                        event.venue_raw.address,
                        event.venue_raw.city,
                        event.venue_raw.country,
                        event.venue_raw.latitude,
                        event.venue_raw.longitude,
                        event.venue_raw.content_url,
                        JSON.stringify(event.venue_raw)
                    ]);
                    savedVenues.add(venueKey);
                }
            }

            // Save scraped artists if present
            for (const artist of (event.artists_json || [])) {
                if (artist.source_artist_id) {
                    const artistKey = `${event.source_code}:${artist.source_artist_id}`;
                    if (!savedArtists.has(artistKey)) {
                        await pool.query(`
                            INSERT INTO scraped_artists (
                                source_code, source_artist_id, name, genres, image_url, content_url, raw_data
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                            ON CONFLICT (source_code, source_artist_id) DO UPDATE SET
                                name = EXCLUDED.name,
                                genres = COALESCE(EXCLUDED.genres, scraped_artists.genres),
                                image_url = COALESCE(EXCLUDED.image_url, scraped_artists.image_url),
                                updated_at = CURRENT_TIMESTAMP
                        `, [
                            event.source_code,
                            artist.source_artist_id,
                            artist.name,
                            artist.genres ? JSON.stringify(artist.genres) : null,
                            artist.image_url,
                            artist.content_url,
                            JSON.stringify(artist)
                        ]);
                        savedArtists.add(artistKey);
                    }
                }
            }
        } catch (err) {
            console.error(`Error saving scraped event ${event.source_event_id}:`, err.message);
        }
    }

    return { inserted, updated, venues: savedVenues.size, artists: savedArtists.size, geocoded };
}

// =====================================================
// MATCHING ALGORITHM
// =====================================================

// Normalize string for matching
function normalizeForMatch(str) {
    if (!str) return '';
    return str.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Calculate string similarity (Levenshtein-based)
function stringSimilarity(a, b) {
    if (!a || !b) return 0;
    a = normalizeForMatch(a);
    b = normalizeForMatch(b);
    if (a === b) return 1;

    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    if (longer.length === 0) return 1;

    // Simple contains check
    if (longer.includes(shorter) || shorter.includes(longer)) {
        return shorter.length / longer.length;
    }

    // Word overlap
    const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
    const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);

    if (union.size === 0) return 0;
    return intersection.length / union.size;
}

// =====================================================
// SOURCE PRIORITY & DATA MERGING
// =====================================================

// Source priority (lower = higher priority)
const SOURCE_PRIORITY = {
    'original': 1,
    'ra': 5,
    'ticketmaster': 6,
    'eventbrite': 7,
    'dice': 8
};

function getSourcePriority(sourceCode) {
    return SOURCE_PRIORITY[sourceCode] || 10;
}

// Event type classification based on keywords
const EVENT_TYPE_KEYWORDS = {
    festival: ['festival', 'fest ', 'outdoor', 'camping', 'day festival', 'music festival'],
    concert: ['concert', 'live music', 'gig', 'performance', 'in concert', 'live at', 'tour'],
    club: ['club night', 'club ', 'nightclub', 'techno', 'house music', 'dj set', 'afterhours', 'after hours'],
    rave: ['rave', 'warehouse', 'illegal', 'underground'],
    party: ['party', 'birthday', 'celebration', 'nye', 'new year', 'halloween', 'christmas party'],
    exhibition: ['exhibition', 'gallery', 'art show', 'museum', 'display', 'showcase'],
    workshop: ['workshop', 'class', 'lesson', 'course', 'tutorial', 'learning', 'masterclass'],
    performance: ['theatre', 'theater', 'dance', 'ballet', 'opera', 'play', 'musical', 'show'],
    listening: ['listening session', 'album release', 'record release', 'listening party']
};

function classifyEventType(title, venueName, description) {
    const text = `${title || ''} ${venueName || ''} ${description || ''}`.toLowerCase();

    // Check each type's keywords
    for (const [type, keywords] of Object.entries(EVENT_TYPE_KEYWORDS)) {
        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                return type;
            }
        }
    }

    return 'event'; // Default type
}

// Merge data from multiple sources, respecting priority
function mergeSourceData(sources, fieldMapping = null) {
    // Sort sources by priority (original first)
    const sorted = [...sources].sort((a, b) =>
        getSourcePriority(a.source_code) - getSourcePriority(b.source_code)
    );

    const merged = {};
    const fieldSources = {};

    // Define fields to merge (default event fields)
    const fields = fieldMapping || [
        'title', 'date', 'start_time', 'end_time', 'description',
        'flyer_front', 'content_url', 'ticket_url', 'price_info',
        'venue_name', 'venue_address', 'venue_city', 'venue_country',
        'venue_latitude', 'venue_longitude'
    ];

    for (const field of fields) {
        for (const source of sorted) {
            const value = source[field];
            if (value !== null && value !== undefined && value !== '') {
                if (merged[field] === undefined) {
                    merged[field] = value;
                    fieldSources[field] = source.source_code;
                    break;
                }
            }
        }
    }

    return { merged, fieldSources };
}

// Create or update scraped entry for 'original' source
async function saveOriginalEntry(type, data, unifiedId = null) {
    const sourceCode = 'original';
    const sourceId = data.id || `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    let scrapedId;

    if (type === 'event') {
        const result = await pool.query(`
            INSERT INTO scraped_events (
                source_code, source_event_id, title, date, start_time, end_time,
                content_url, flyer_front, description, venue_name, venue_address,
                venue_city, venue_country, venue_latitude, venue_longitude, price_info
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (source_code, source_event_id) DO UPDATE SET
                title = EXCLUDED.title,
                date = EXCLUDED.date,
                start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                content_url = EXCLUDED.content_url,
                flyer_front = EXCLUDED.flyer_front,
                description = EXCLUDED.description,
                venue_name = EXCLUDED.venue_name,
                venue_address = EXCLUDED.venue_address,
                venue_city = EXCLUDED.venue_city,
                venue_country = EXCLUDED.venue_country,
                venue_latitude = EXCLUDED.venue_latitude,
                venue_longitude = EXCLUDED.venue_longitude,
                price_info = EXCLUDED.price_info,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `, [
            sourceCode, sourceId, data.title, data.date, data.start_time, data.end_time,
            data.content_url, data.flyer_front, data.description, data.venue_name,
            data.venue_address, data.venue_city, data.venue_country,
            data.venue_latitude || data.latitude, data.venue_longitude || data.longitude,
            data.price_info ? JSON.stringify(data.price_info) : null
        ]);
        scrapedId = result.rows[0].id;
    } else if (type === 'venue') {
        const result = await pool.query(`
            INSERT INTO scraped_venues (
                source_code, source_venue_id, name, address, city, country,
                latitude, longitude, content_url, capacity
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (source_code, source_venue_id) DO UPDATE SET
                name = EXCLUDED.name,
                address = EXCLUDED.address,
                city = EXCLUDED.city,
                country = EXCLUDED.country,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                content_url = EXCLUDED.content_url,
                capacity = EXCLUDED.capacity,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `, [
            sourceCode, sourceId, data.name, data.address, data.city, data.country,
            data.latitude, data.longitude, data.content_url, data.capacity
        ]);
        scrapedId = result.rows[0].id;
    } else if (type === 'artist') {
        const result = await pool.query(`
            INSERT INTO scraped_artists (
                source_code, source_artist_id, name, genres, image_url, content_url
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (source_code, source_artist_id) DO UPDATE SET
                name = EXCLUDED.name,
                genres = EXCLUDED.genres,
                image_url = EXCLUDED.image_url,
                content_url = EXCLUDED.content_url,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `, [
            sourceCode, sourceId, data.name,
            data.genres ? JSON.stringify(data.genres) : null,
            data.image_url, data.content_url
        ]);
        scrapedId = result.rows[0].id;
    }

    return { scrapedId, sourceId };
}

// Find or create unified entry and link to scraped entry
async function linkToUnified(type, scrapedId, scrapedData, existingUnifiedId = null) {
    const priority = getSourcePriority(scrapedData.source_code || 'original');
    let unifiedId = existingUnifiedId;

    if (type === 'event') {
        if (!unifiedId) {
            // Try to find matching unified event
            const match = await findMatchingUnifiedEvent(scrapedData);
            unifiedId = match?.id;
        }

        if (!unifiedId) {
            // Create new unified event
            const result = await pool.query(`
                INSERT INTO unified_events (
                    title, date, start_time, end_time, description, flyer_front,
                    ticket_url, price_info, venue_name, venue_address, venue_city, venue_country
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING id
            `, [
                scrapedData.title, scrapedData.date, scrapedData.start_time, scrapedData.end_time,
                scrapedData.description, scrapedData.flyer_front, scrapedData.content_url,
                scrapedData.price_info, scrapedData.venue_name, scrapedData.venue_address,
                scrapedData.venue_city, scrapedData.venue_country
            ]);
            unifiedId = result.rows[0].id;
        }

        // Create link
        await pool.query(`
            INSERT INTO event_source_links (unified_event_id, scraped_event_id, match_confidence, is_primary, priority)
            VALUES ($1, $2, 1.0, $3, $4)
            ON CONFLICT (unified_event_id, scraped_event_id) DO UPDATE SET
                priority = EXCLUDED.priority,
                is_primary = EXCLUDED.is_primary
        `, [unifiedId, scrapedId, priority === 1, priority]);

        // Refresh merged data on unified event
        await refreshUnifiedEvent(unifiedId);

    } else if (type === 'venue') {
        if (!unifiedId) {
            const match = await findMatchingUnifiedVenue(scrapedData);
            unifiedId = match?.id;
        }

        if (!unifiedId) {
            const result = await pool.query(`
                INSERT INTO unified_venues (name, address, city, country, latitude, longitude, website, capacity)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            `, [
                scrapedData.name, scrapedData.address, scrapedData.city, scrapedData.country,
                scrapedData.latitude, scrapedData.longitude, scrapedData.content_url, scrapedData.capacity
            ]);
            unifiedId = result.rows[0].id;
        }

        await pool.query(`
            INSERT INTO venue_source_links (unified_venue_id, scraped_venue_id, match_confidence, is_primary, priority)
            VALUES ($1, $2, 1.0, $3, $4)
            ON CONFLICT (unified_venue_id, scraped_venue_id) DO UPDATE SET
                priority = EXCLUDED.priority,
                is_primary = EXCLUDED.is_primary
        `, [unifiedId, scrapedId, priority === 1, priority]);

        await refreshUnifiedVenue(unifiedId);

    } else if (type === 'artist') {
        if (!unifiedId) {
            const match = await findMatchingUnifiedArtist(scrapedData);
            unifiedId = match?.id;
        }

        if (!unifiedId) {
            const result = await pool.query(`
                INSERT INTO unified_artists (name, genres, country, image_url, website)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            `, [
                scrapedData.name, scrapedData.genres, scrapedData.country,
                scrapedData.image_url, scrapedData.content_url
            ]);
            unifiedId = result.rows[0].id;
        }

        await pool.query(`
            INSERT INTO artist_source_links (unified_artist_id, scraped_artist_id, match_confidence, is_primary, priority)
            VALUES ($1, $2, 1.0, $3, $4)
            ON CONFLICT (unified_artist_id, scraped_artist_id) DO UPDATE SET
                priority = EXCLUDED.priority,
                is_primary = EXCLUDED.is_primary
        `, [unifiedId, scrapedId, priority === 1, priority]);

        await refreshUnifiedArtist(unifiedId);
    }

    return unifiedId;
}

// Find matching unified event
async function findMatchingUnifiedEvent(scrapedData, minConfidence = 0.7) {
    if (!scrapedData.date) return null;

    const potentialMatches = await pool.query(`
        SELECT ue.* FROM unified_events ue
        WHERE ue.date = $1
        AND (LOWER(ue.venue_city) = LOWER($2) OR LOWER(ue.venue_name) ILIKE $3)
    `, [scrapedData.date, scrapedData.venue_city || '', `%${scrapedData.venue_name || ''}%`]);

    let bestMatch = null;
    let bestScore = 0;

    for (const potential of potentialMatches.rows) {
        const titleScore = stringSimilarity(scrapedData.title, potential.title);
        const venueScore = stringSimilarity(scrapedData.venue_name, potential.venue_name);
        const score = (titleScore * 0.6) + (venueScore * 0.4);

        if (score > bestScore && score >= minConfidence) {
            bestScore = score;
            bestMatch = potential;
        }
    }

    return bestMatch;
}

// Find matching unified venue
async function findMatchingUnifiedVenue(scrapedData, minConfidence = 0.7) {
    if (!scrapedData.name) return null;

    const potentialMatches = await pool.query(`
        SELECT uv.* FROM unified_venues uv
        WHERE LOWER(uv.city) = LOWER($1) OR similarity(LOWER(uv.name), LOWER($2)) > 0.3
    `, [scrapedData.city || '', scrapedData.name]);

    let bestMatch = null;
    let bestScore = 0;

    for (const potential of potentialMatches.rows) {
        const nameScore = stringSimilarity(scrapedData.name, potential.name);
        const cityScore = scrapedData.city && potential.city ?
            (scrapedData.city.toLowerCase() === potential.city.toLowerCase() ? 1 : 0) : 0;
        const score = (nameScore * 0.8) + (cityScore * 0.2);

        if (score > bestScore && score >= minConfidence) {
            bestScore = score;
            bestMatch = potential;
        }
    }

    return bestMatch;
}

// Find matching unified artist
async function findMatchingUnifiedArtist(scrapedData, minConfidence = 0.85) {
    if (!scrapedData.name) return null;

    const potentialMatches = await pool.query(`
        SELECT ua.* FROM unified_artists ua
        WHERE similarity(LOWER(ua.name), LOWER($1)) > 0.5
    `, [scrapedData.name]);

    let bestMatch = null;
    let bestScore = 0;

    for (const potential of potentialMatches.rows) {
        const score = stringSimilarity(scrapedData.name, potential.name);
        if (score > bestScore && score >= minConfidence) {
            bestScore = score;
            bestMatch = potential;
        }
    }

    return bestMatch;
}

// Refresh unified event with merged data from all sources
async function refreshUnifiedEvent(unifiedId) {
    // Get all linked sources ordered by priority
    const sourcesResult = await pool.query(`
        SELECT se.*, esl.priority, esl.is_primary
        FROM event_source_links esl
        JOIN scraped_events se ON se.id = esl.scraped_event_id
        WHERE esl.unified_event_id = $1
        ORDER BY esl.priority ASC, esl.is_primary DESC
    `, [unifiedId]);

    if (sourcesResult.rows.length === 0) return;

    const { merged, fieldSources } = mergeSourceData(sourcesResult.rows);

    await pool.query(`
        UPDATE unified_events SET
            title = COALESCE($1, title),
            date = COALESCE($2, date),
            start_time = COALESCE($3, start_time),
            end_time = COALESCE($4, end_time),
            description = COALESCE($5, description),
            flyer_front = COALESCE($6, flyer_front),
            ticket_url = COALESCE($7, ticket_url),
            venue_name = COALESCE($8, venue_name),
            venue_address = COALESCE($9, venue_address),
            venue_city = COALESCE($10, venue_city),
            venue_country = COALESCE($11, venue_country),
            field_sources = $12,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $13
    `, [
        merged.title, merged.date, merged.start_time, merged.end_time,
        merged.description, merged.flyer_front, merged.content_url || merged.ticket_url,
        merged.venue_name, merged.venue_address, merged.venue_city, merged.venue_country,
        JSON.stringify(fieldSources), unifiedId
    ]);
}

// Refresh unified venue with merged data
async function refreshUnifiedVenue(unifiedId) {
    const sourcesResult = await pool.query(`
        SELECT sv.*, vsl.priority
        FROM venue_source_links vsl
        JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
        WHERE vsl.unified_venue_id = $1
        ORDER BY vsl.priority ASC
    `, [unifiedId]);

    if (sourcesResult.rows.length === 0) return;

    const { merged, fieldSources } = mergeSourceData(sourcesResult.rows, [
        'name', 'address', 'city', 'country', 'latitude', 'longitude', 'content_url', 'capacity'
    ]);

    await pool.query(`
        UPDATE unified_venues SET
            name = COALESCE($1, name),
            address = COALESCE($2, address),
            city = COALESCE($3, city),
            country = COALESCE($4, country),
            latitude = COALESCE($5, latitude),
            longitude = COALESCE($6, longitude),
            website = COALESCE($7, website),
            capacity = COALESCE($8, capacity),
            field_sources = $9,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $10
    `, [
        merged.name, merged.address, merged.city, merged.country,
        merged.latitude, merged.longitude, merged.content_url, merged.capacity,
        JSON.stringify(fieldSources), unifiedId
    ]);
}

// Refresh unified artist with merged data
async function refreshUnifiedArtist(unifiedId) {
    const sourcesResult = await pool.query(`
        SELECT sa.*, asl.priority
        FROM artist_source_links asl
        JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
        WHERE asl.unified_artist_id = $1
        ORDER BY asl.priority ASC
    `, [unifiedId]);

    if (sourcesResult.rows.length === 0) return;

    const { merged, fieldSources } = mergeSourceData(sourcesResult.rows, [
        'name', 'genres', 'country', 'image_url', 'content_url'
    ]);

    await pool.query(`
        UPDATE unified_artists SET
            name = COALESCE($1, name),
            genres = COALESCE($2, genres),
            country = COALESCE($3, country),
            image_url = COALESCE($4, image_url),
            website = COALESCE($5, website),
            field_sources = $6,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
    `, [
        merged.name, merged.genres, merged.country, merged.image_url,
        merged.content_url, JSON.stringify(fieldSources), unifiedId
    ]);
}

// Find or create venue and return venue_id
async function findOrCreateVenue(venueName, venueAddress, venueCity, venueCountry, venueLatitude, venueLongitude) {
    const { v4: uuidv4 } = require('uuid');
    
    if (!venueName) return null;

    // Try to find existing venue by name and city
    const existingVenue = await pool.query(`
        SELECT id, latitude, longitude
        FROM venues
        WHERE LOWER(name) = LOWER($1)
          AND (LOWER(city) = LOWER($2) OR $2 IS NULL)
        LIMIT 1
    `, [venueName, venueCity || null]);

    if (existingVenue.rows.length > 0) {
        const venue = existingVenue.rows[0];
        
        // Update venue coordinates if we have them and venue doesn't
        if (venueLatitude && venueLongitude && (!venue.latitude || !venue.longitude)) {
            await pool.query(`
                UPDATE venues
                SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [venueLatitude, venueLongitude, venue.id]);
            console.log(`[Venue] Updated coordinates for ${venueName}`);
        }
        
        return venue.id;
    }

    // Venue doesn't exist, create it
    const venueId = uuidv4();
    
    // Clean address and extract postal code
    let cleanedAddress = venueAddress;
    let postalCode = null;
    if (venueAddress) {
        const cleaned = cleanVenueAddress(venueAddress, venueCity, venueCountry);
        cleanedAddress = cleaned.address;
        postalCode = cleaned.postalCode;
    }
    
    // If no coordinates provided, try geocoding
    let lat = venueLatitude;
    let lon = venueLongitude;
    
    if ((!lat || !lon) && (cleanedAddress || venueName)) {
        console.log(`[Venue] Geocoding ${venueName}...`);
        try {
            const coords = await geocodeAddress(cleanedAddress || venueName, venueCity, venueCountry);
            if (coords) {
                lat = coords.latitude;
                lon = coords.longitude;
                console.log(`[Venue] Geocoded: ${lat}, ${lon}`);
            }
        } catch (err) {
            console.warn(`[Venue] Geocoding failed for ${venueName}:`, err.message);
        }
    }
    
    // Create the venue
    await pool.query(`
        INSERT INTO venues (id, name, address, city, country, postal_code, latitude, longitude, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [venueId, venueName, cleanedAddress, venueCity, venueCountry, postalCode, lat, lon]);
    
    console.log(`[Venue] Created ${venueName} with ID ${venueId}`);
    return venueId;
}

// Refresh main event with merged data from all linked scraped sources
async function refreshMainEvent(eventId) {
    // Get all linked scraped events ordered by source priority
    const sourcesResult = await pool.query(`
        SELECT se.*, esl.match_confidence
        FROM event_scraped_links esl
        JOIN scraped_events se ON se.id = esl.scraped_event_id
        WHERE esl.event_id = $1
        ORDER BY 
            CASE se.source_code 
                WHEN 'original' THEN 1 
                WHEN 'ra' THEN 5 
                WHEN 'ticketmaster' THEN 6 
                ELSE 10 
            END ASC
    `, [eventId]);

    if (sourcesResult.rows.length === 0) return;

    const { merged, fieldSources } = mergeSourceData(sourcesResult.rows);

    // Extract date as YYYY-MM-DD string (handles Date objects and ISO strings)
    let dateStr = null;
    if (merged.date) {
        const d = merged.date instanceof Date ? merged.date : new Date(merged.date);
        dateStr = d.toISOString().split('T')[0];
    }

    // Combine date with time for timestamp fields
    const startTimestamp = dateStr && merged.start_time
        ? `${dateStr} ${merged.start_time}`
        : null;
    const endTimestamp = dateStr && merged.end_time
        ? `${dateStr} ${merged.end_time}`
        : null;

    // Auto-link venue if we have venue name
    let venueId = null;
    if (merged.venue_name) {
        venueId = await findOrCreateVenue(
            merged.venue_name,
            merged.venue_address,
            merged.venue_city,
            merged.venue_country,
            merged.venue_latitude,
            merged.venue_longitude
        );
    }

    // Update main event with merged data including venue_id
    await pool.query(`
        UPDATE events SET
            title = COALESCE($1, title),
            date = COALESCE($2, date),
            start_time = COALESCE($3, start_time),
            end_time = COALESCE($4, end_time),
            description = COALESCE($5, description),
            flyer_front = COALESCE($6, flyer_front),
            content_url = COALESCE($7, content_url),
            venue_id = COALESCE($8, venue_id),
            venue_name = COALESCE($9, venue_name),
            venue_address = COALESCE($10, venue_address),
            venue_city = COALESCE($11, venue_city),
            venue_country = COALESCE($12, venue_country),
            latitude = COALESCE($13, latitude),
            longitude = COALESCE($14, longitude),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $15
    `, [
        merged.title, dateStr, startTimestamp, endTimestamp,
        merged.description, merged.flyer_front, merged.content_url,
        venueId,
        merged.venue_name, merged.venue_address, merged.venue_city, merged.venue_country,
        merged.venue_latitude, merged.venue_longitude,
        eventId
    ]);

    console.log(`[Refresh] Updated main event ${eventId} with merged data from ${sourcesResult.rows.length} sources${venueId ? `, linked to venue ${venueId}` : ''}`);
}

// Auto-reject past events that are still pending
async function autoRejectPastEvents() {
    const result = await pool.query(`
        UPDATE events 
        SET publish_status = 'rejected', updated_at = CURRENT_TIMESTAMP
        WHERE date < CURRENT_DATE 
        AND publish_status = 'pending'
        RETURNING id, title, date
    `);

    if (result.rows.length > 0) {
        console.log(`[Auto-Reject] Rejected ${result.rows.length} past events`);
    }

    return { rejected: result.rows.length, events: result.rows.slice(0, 10) };
}

// Match scraped events to main events or create new ones
// Uses main 'events' table with 'event_scraped_links' for source tracking
async function matchAndLinkEvents(options = {}) {
    const { dryRun = false, minConfidence = 0.6 } = options;
    const { v4: uuidv4 } = require('uuid');

    // Get unlinked scraped events (not in event_scraped_links)
    const unlinkedResult = await pool.query(`
        SELECT se.* FROM scraped_events se
        WHERE NOT EXISTS (
            SELECT 1 FROM event_scraped_links esl WHERE esl.scraped_event_id = se.id
        )
        ORDER BY se.date DESC, se.venue_city
    `);

    const unlinked = unlinkedResult.rows;
    let matched = 0, created = 0;
    const results = [];

    console.log(`[Match] Processing ${unlinked.length} unlinked scraped events`);

    for (const scraped of unlinked) {
        // Try to find matching main event
        const potentialMatches = await pool.query(`
            SELECT e.*, 
                   (SELECT array_agg(se.source_code) FROM event_scraped_links esl 
                    JOIN scraped_events se ON se.id = esl.scraped_event_id 
                    WHERE esl.event_id = e.id) as existing_sources
            FROM events e
            WHERE e.date::date = $1::date
            AND (
                LOWER(e.venue_city) = LOWER($2) 
                OR LOWER(e.venue_name) ILIKE $3
            )
        `, [scraped.date, scraped.venue_city || '', `%${(scraped.venue_name || '').substring(0, 15)}%`]);

        let bestMatch = null;
        let bestScore = 0;

        for (const potential of potentialMatches.rows) {
            // Skip if already linked from same source
            if (potential.existing_sources?.includes(scraped.source_code)) continue;

            // Calculate match score
            const titleScore = stringSimilarity(scraped.title || '', potential.title || '');
            const venueScore = stringSimilarity(scraped.venue_name || '', potential.venue_name || '');
            const score = (titleScore * 0.7) + (venueScore * 0.3);

            if (score > bestScore && score >= minConfidence) {
                bestScore = score;
                bestMatch = potential;
            }
        }

        // If no match, check other scraped events that are already linked
        if (!bestMatch) {
            const similarScraped = await pool.query(`
                SELECT se.*, esl.event_id
                FROM scraped_events se
                JOIN event_scraped_links esl ON esl.scraped_event_id = se.id
                WHERE se.date = $1
                AND se.id != $2
                AND (LOWER(se.venue_city) = LOWER($3) OR LOWER(se.venue_name) ILIKE $4)
                LIMIT 50
            `, [scraped.date, scraped.id, scraped.venue_city || '', `%${(scraped.venue_name || '').substring(0, 15)}%`]);

            for (const other of similarScraped.rows) {
                const titleScore = stringSimilarity(scraped.title || '', other.title || '');
                const venueScore = stringSimilarity(scraped.venue_name || '', other.venue_name || '');
                const score = (titleScore * 0.7) + (venueScore * 0.3);

                if (score >= minConfidence && score > bestScore) {
                    bestScore = score;
                    bestMatch = { id: other.event_id, title: other.title };
                }
            }
        }

        if (bestMatch) {
            // Link to existing main event
            if (!dryRun) {
                await pool.query(`
                    INSERT INTO event_scraped_links (event_id, scraped_event_id, match_confidence)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (event_id, scraped_event_id) DO NOTHING
                `, [bestMatch.id, scraped.id, bestScore]);

                // Refresh main event with merged data from all linked sources
                await refreshMainEvent(bestMatch.id);
            }
            matched++;
            results.push({
                action: 'matched',
                scraped: { id: scraped.id, title: scraped.title, source: scraped.source_code },
                main: { id: bestMatch.id, title: bestMatch.title },
                confidence: bestScore
            });
        } else {
            // Before creating a new event, do a stricter check for near-duplicates
            // This prevents creating multiple events like "DANCÆ x Chlär" on different dates at same venue
            const nearDuplicateCheck = await pool.query(`
                SELECT e.id, e.title, e.date, e.venue_name
                FROM events e
                WHERE e.date::date = $1::date
                AND LOWER(e.venue_name) = LOWER($2)
            `, [scraped.date, scraped.venue_name || '']);

            let foundNearDuplicate = null;
            for (const existing of nearDuplicateCheck.rows) {
                const titleSim = stringSimilarity(scraped.title || '', existing.title || '');
                // If title is very similar (>0.5) and same date/venue, it's likely the same event
                if (titleSim >= 0.5) {
                    foundNearDuplicate = existing;
                    break;
                }
            }

            if (foundNearDuplicate) {
                // Link to existing event instead of creating new
                if (!dryRun) {
                    await pool.query(`
                        INSERT INTO event_scraped_links (event_id, scraped_event_id, match_confidence)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (event_id, scraped_event_id) DO NOTHING
                    `, [foundNearDuplicate.id, scraped.id, 0.5]);

                    await refreshMainEvent(foundNearDuplicate.id);
                }
                matched++;
                results.push({
                    action: 'matched',
                    scraped: { id: scraped.id, title: scraped.title, source: scraped.source_code },
                    main: { id: foundNearDuplicate.id, title: foundNearDuplicate.title },
                    confidence: 0.5,
                    note: 'near-duplicate match'
                });
            } else {
                // Create new main event
                if (!dryRun) {
                    const eventId = uuidv4();

                    // Extract date as YYYY-MM-DD string (handles Date objects and ISO strings)
                    let dateStr = null;
                    if (scraped.date) {
                        const d = scraped.date instanceof Date ? scraped.date : new Date(scraped.date);
                        dateStr = d.toISOString().split('T')[0];
                    }

                    // Combine date with time for timestamp fields
                    const startTimestamp = dateStr && scraped.start_time
                        ? `${dateStr} ${scraped.start_time}`
                        : null;
                    const endTimestamp = dateStr && scraped.end_time
                        ? `${dateStr} ${scraped.end_time}`
                        : null;

                    // Convert artists_json to string for events table
                    const artistsStr = scraped.artists_json && scraped.artists_json.length > 0
                        ? JSON.stringify(scraped.artists_json)
                        : null;

                    // Determine publish status - auto-reject past events
                    const eventDate = dateStr ? new Date(dateStr) : null;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const isPastEvent = eventDate && eventDate < today;
                    const publishStatus = isPastEvent ? 'rejected' : 'pending';

                    // Ensure city exists in database before creating event
                    if (scraped.venue_city) {
                        await pool.query(`
                            INSERT INTO cities (name, country)
                            VALUES ($1, $2)
                            ON CONFLICT (name) DO UPDATE SET
                                country = COALESCE(NULLIF(cities.country, 'Unknown'), EXCLUDED.country)
                        `, [scraped.venue_city, scraped.venue_country || 'Unknown']);
                    }

                    // Auto-link venue if we have venue name
                    let venueId = null;
                    if (scraped.venue_name) {
                        venueId = await findOrCreateVenue(
                            scraped.venue_name,
                            scraped.venue_address,
                            scraped.venue_city,
                            scraped.venue_country,
                            scraped.venue_latitude,
                            scraped.venue_longitude
                        );
                    }

                    await pool.query(`
                        INSERT INTO events (
                            id, source_code, source_id, title, date, start_time, end_time, 
                            description, flyer_front, content_url, venue_id, venue_name, venue_address, 
                            venue_city, venue_country, artists, is_published, publish_status
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, false, $17)
                        ON CONFLICT (id) DO NOTHING
                    `, [
                        eventId,
                        scraped.source_code,
                        scraped.source_event_id,
                        scraped.title,
                        dateStr,
                        startTimestamp,
                        endTimestamp,
                        scraped.description,
                        scraped.flyer_front,
                        scraped.content_url,
                        venueId,
                        scraped.venue_name,
                        scraped.venue_address,
                        scraped.venue_city,
                        scraped.venue_country,
                        artistsStr,
                        publishStatus
                    ]);

                    // Link to the new main event
                    await pool.query(`
                        INSERT INTO event_scraped_links (event_id, scraped_event_id, match_confidence)
                        VALUES ($1, $2, 1.0)
                        ON CONFLICT (event_id, scraped_event_id) DO NOTHING
                    `, [eventId, scraped.id]);

                    created++;
                    results.push({
                        action: 'created',
                        scraped: { id: scraped.id, title: scraped.title, source: scraped.source_code },
                        main: { id: eventId, title: scraped.title }
                    });
                }
            }
        }
    }

    // Auto-reject past events after processing
    const autoRejectResult = await autoRejectPastEvents();

    console.log(`[Match] Processed ${unlinked.length}: ${created} created, ${matched} matched, ${autoRejectResult.rejected} auto-rejected`);

    return { processed: unlinked.length, matched, created, autoRejected: autoRejectResult.rejected, results: results.slice(0, 20) };
}

// Match and link artists from scraped_artists to main artists table
async function matchAndLinkArtists(options = {}) {
    const { dryRun = false, minConfidence = 0.7 } = options;
    const { v4: uuidv4 } = require('uuid');

    // Get unlinked scraped artists (not in artist_scraped_links)
    const unlinkedResult = await pool.query(`
        SELECT sa.* FROM scraped_artists sa
        WHERE NOT EXISTS (
            SELECT 1 FROM artist_scraped_links asl WHERE asl.scraped_artist_id = sa.id
        )
        ORDER BY sa.name
        LIMIT 1000
    `);

    const unlinked = unlinkedResult.rows;
    let matched = 0, created = 0;
    const results = [];

    console.log(`[Match Artists] Processing ${unlinked.length} unlinked scraped artists`);

    for (const scraped of unlinked) {
        // Try to find matching main artist by name
        const potentialMatches = await pool.query(`
            SELECT a.*, 
                   (SELECT array_agg(sa.source_code) FROM artist_scraped_links asl 
                    JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id 
                    WHERE asl.artist_id = a.id) as existing_sources
            FROM artists a
            WHERE LOWER(a.name) = LOWER($1)
            OR similarity(LOWER(a.name), LOWER($1)) > 0.6
        `, [scraped.name || '']);

        let bestMatch = null;
        let bestScore = 0;

        for (const potential of potentialMatches.rows) {
            // Skip if already linked from same source
            if (potential.existing_sources?.includes(scraped.source_code)) continue;

            // Calculate match score based on name similarity
            const nameScore = stringSimilarity(scraped.name || '', potential.name || '');
            
            if (nameScore > bestScore && nameScore >= minConfidence) {
                bestScore = nameScore;
                bestMatch = potential;
            }
        }

        if (bestMatch) {
            // Link to existing main artist
            if (!dryRun) {
                await pool.query(`
                    INSERT INTO artist_scraped_links (artist_id, scraped_artist_id, match_confidence)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (artist_id, scraped_artist_id) DO NOTHING
                `, [bestMatch.id, scraped.id, bestScore]);
            }
            matched++;
            results.push({
                action: 'matched',
                scraped: { id: scraped.id, name: scraped.name, source: scraped.source_code },
                main: { id: bestMatch.id, name: bestMatch.name },
                confidence: bestScore
            });
        } else {
            // Create new main artist
            if (!dryRun) {
                const artistId = uuidv4();
                
                await pool.query(`
                    INSERT INTO artists (id, source_code, source_id, name, country, content_url, image_url, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [
                    artistId,
                    scraped.source_code,
                    scraped.source_artist_id,
                    scraped.name,
                    null, // country not in scraped_artists
                    scraped.content_url,
                    scraped.image_url
                ]);

                // Link scraped artist to new main artist
                await pool.query(`
                    INSERT INTO artist_scraped_links (artist_id, scraped_artist_id, match_confidence, is_primary)
                    VALUES ($1, $2, 1.0, true)
                `, [artistId, scraped.id]);

                created++;
                results.push({
                    action: 'created',
                    scraped: { id: scraped.id, name: scraped.name, source: scraped.source_code },
                    main: { id: artistId, name: scraped.name }
                });
            }
        }
    }

    console.log(`[Match Artists] Processed ${unlinked.length}: ${created} created, ${matched} matched`);

    return { processed: unlinked.length, matched, created, results: results.slice(0, 50) };
}

// Match and link venues from scraped_venues to main venues table
async function matchAndLinkVenues(options = {}) {
    const { dryRun = false, minConfidence = 0.7 } = options;
    const { v4: uuidv4 } = require('uuid');

    // Get unlinked scraped venues (not in venue_scraped_links)
    const unlinkedResult = await pool.query(`
        SELECT sv.* FROM scraped_venues sv
        WHERE NOT EXISTS (
            SELECT 1 FROM venue_scraped_links vsl WHERE vsl.scraped_venue_id = sv.id
        )
        ORDER BY sv.name, sv.city
        LIMIT 1000
    `);

    const unlinked = unlinkedResult.rows;
    let matched = 0, created = 0;
    const results = [];

    console.log(`[Match Venues] Processing ${unlinked.length} unlinked scraped venues`);

    for (const scraped of unlinked) {
        // Try to find matching main venue by name and city
        const potentialMatches = await pool.query(`
            SELECT v.*, 
                   (SELECT array_agg(sv.source_code) FROM venue_scraped_links vsl 
                    JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id 
                    WHERE vsl.venue_id = v.id) as existing_sources
            FROM venues v
            WHERE LOWER(v.city) = LOWER($1)
            AND (
                LOWER(v.name) = LOWER($2)
                OR similarity(LOWER(v.name), LOWER($2)) > 0.6
            )
        `, [scraped.city || '', scraped.name || '']);

        let bestMatch = null;
        let bestScore = 0;

        for (const potential of potentialMatches.rows) {
            // Skip if already linked from same source
            if (potential.existing_sources?.includes(scraped.source_code)) continue;

            // Calculate match score based on name and address similarity
            const nameScore = stringSimilarity(scraped.name || '', potential.name || '');
            const addressScore = scraped.address && potential.address 
                ? stringSimilarity(scraped.address || '', potential.address || '')
                : 0;
            const score = (nameScore * 0.8) + (addressScore * 0.2);
            
            if (score > bestScore && score >= minConfidence) {
                bestScore = score;
                bestMatch = potential;
            }
        }

        if (bestMatch) {
            // Link to existing main venue
            if (!dryRun) {
                await pool.query(`
                    INSERT INTO venue_scraped_links (venue_id, scraped_venue_id, match_confidence)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (venue_id, scraped_venue_id) DO NOTHING
                `, [bestMatch.id, scraped.id, bestScore]);
            }
            matched++;
            results.push({
                action: 'matched',
                scraped: { id: scraped.id, name: scraped.name, city: scraped.city, source: scraped.source_code },
                main: { id: bestMatch.id, name: bestMatch.name },
                confidence: bestScore
            });
        } else {
            // Create new main venue
            if (!dryRun) {
                const venueId = uuidv4();
                
                // Clean address and extract postal code
                let cleanedAddress = scraped.address;
                let postalCode = null;
                if (scraped.address) {
                    const cleaned = cleanVenueAddress(scraped.address, scraped.city, scraped.country);
                    cleanedAddress = cleaned.address;
                    postalCode = cleaned.postalCode;
                }
                
                // If no coordinates, try geocoding
                let latitude = scraped.latitude;
                let longitude = scraped.longitude;
                
                if (!latitude || !longitude) {
                    console.log(`[Match Venues] Geocoding ${scraped.name}...`);
                    const coords = await geocodeAddress(cleanedAddress, scraped.city, scraped.country);
                    if (coords) {
                        latitude = coords.latitude;
                        longitude = coords.longitude;
                        console.log(`[Match Venues] Geocoded: ${latitude}, ${longitude}`);
                    }
                }
                
                await pool.query(`
                    INSERT INTO venues (id, source_code, source_id, name, address, city, country, 
                                      postal_code, latitude, longitude, content_url, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [
                    venueId,
                    scraped.source_code,
                    scraped.source_venue_id,
                    scraped.name,
                    cleanedAddress,
                    scraped.city,
                    scraped.country,
                    postalCode,
                    latitude,
                    longitude,
                    scraped.content_url
                ]);

                // Link scraped venue to new main venue
                await pool.query(`
                    INSERT INTO venue_scraped_links (venue_id, scraped_venue_id, match_confidence, is_primary)
                    VALUES ($1, $2, 1.0, true)
                `, [venueId, scraped.id]);

                created++;
                results.push({
                    action: 'created',
                    scraped: { id: scraped.id, name: scraped.name, city: scraped.city, source: scraped.source_code },
                    main: { id: venueId, name: scraped.name }
                });
            }
        }
    }

    console.log(`[Match Venues] Processed ${unlinked.length}: ${created} created, ${matched} matched`);

    return { processed: unlinked.length, matched, created, results: results.slice(0, 50) };
}

// Deduplicate main events that have the same date/venue and similar titles
async function deduplicateMainEvents() {
    let merged = 0;

    // Find potential duplicates
    const duplicates = await pool.query(`
        SELECT e1.id as id1, e2.id as id2, e1.title as title1, e2.title as title2,
               e1.venue_name, e1.date
        FROM events e1
        JOIN events e2 ON e1.date::date = e2.date::date 
            AND LOWER(e1.venue_city) = LOWER(e2.venue_city)
            AND e1.id < e2.id
        WHERE (
            LOWER(e1.venue_name) = LOWER(e2.venue_name)
            OR similarity(LOWER(e1.venue_name), LOWER(e2.venue_name)) > 0.6
        )
        LIMIT 100
    `);

    for (const dup of duplicates.rows) {
        const titleSim = stringSimilarity(dup.title1 || '', dup.title2 || '');

        if (titleSim >= 0.6) {
            console.log(`[Dedupe] Merging duplicate events: "${dup.title1}" and "${dup.title2}"`);

            // Move all scraped links from id2 to id1
            await pool.query(`
                UPDATE event_scraped_links 
                SET event_id = $1 
                WHERE event_id = $2
                ON CONFLICT (event_id, scraped_event_id) DO NOTHING
            `, [dup.id1, dup.id2]);

            // Delete orphaned links
            await pool.query(`DELETE FROM event_scraped_links WHERE event_id = $1`, [dup.id2]);

            // Delete the duplicate event
            await pool.query(`DELETE FROM events WHERE id = $1`, [dup.id2]);

            merged++;
        }
    }

    return { merged };
}

// Legacy: Deduplicate unified events (for backwards compatibility)
async function deduplicateUnifiedEvents() {
    // Just return empty - we use deduplicateMainEvents now
    return { merged: 0 };
}

// Match scraped venues to unified venues
async function matchAndLinkVenues(options = {}) {
    const { dryRun = false, minConfidence = 0.8 } = options;

    const unlinkedResult = await pool.query(`
        SELECT sv.* FROM scraped_venues sv
        WHERE NOT EXISTS (
            SELECT 1 FROM venue_source_links vsl WHERE vsl.scraped_venue_id = sv.id
        )
        LIMIT 200
    `);

    let matched = 0, created = 0;

    for (const scraped of unlinkedResult.rows) {
        // Find potential matches by city and name similarity
        const potentialMatches = await pool.query(`
            SELECT uv.* FROM unified_venues uv
            WHERE LOWER(uv.city) = LOWER($1)
            AND (
                similarity(LOWER(uv.name), LOWER($2)) > 0.3
                OR LOWER(uv.name) ILIKE $3
            )
        `, [scraped.city, scraped.name, `%${scraped.name}%`]);

        let bestMatch = null;
        let bestScore = 0;

        for (const potential of potentialMatches.rows) {
            const nameScore = stringSimilarity(scraped.name, potential.name);
            const addressScore = stringSimilarity(scraped.address, potential.address);
            const score = (nameScore * 0.7) + (addressScore * 0.3);

            if (score > bestScore && score >= minConfidence) {
                bestScore = score;
                bestMatch = potential;
            }
        }

        if (bestMatch) {
            if (!dryRun) {
                await pool.query(`
                    INSERT INTO venue_source_links (unified_venue_id, scraped_venue_id, match_confidence)
                    VALUES ($1, $2, $3)
                    ON CONFLICT DO NOTHING
                `, [bestMatch.id, scraped.id, bestScore]);
            }
            matched++;
        } else {
            if (!dryRun) {
                const newVenue = await pool.query(`
                    INSERT INTO unified_venues (name, address, city, country, latitude, longitude, website)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING id
                `, [scraped.name, scraped.address, scraped.city, scraped.country,
                scraped.latitude, scraped.longitude, scraped.content_url]);

                await pool.query(`
                    INSERT INTO venue_source_links (unified_venue_id, scraped_venue_id, match_confidence, is_primary)
                    VALUES ($1, $2, 1.0, true)
                `, [newVenue.rows[0].id, scraped.id]);
            }
            created++;
        }
    }

    return { processed: unlinkedResult.rows.length, matched, created };
}

// =====================================================
// MULTI-SOURCE SCRAPE API ENDPOINTS
// =====================================================

// Scrape events from specific source(s)
app.post('/scrape/events', async (req, res) => {
    try {
        const { sources = ['ra', 'ticketmaster'], city, limit = 100, match = true } = req.body;

        if (!city) {
            return res.status(400).json({
                error: 'City required',
                availableCities: {
                    ra: Object.keys(RA_AREA_MAP),
                    ticketmaster: Object.keys(TICKETMASTER_CITY_MAP)
                }
            });
        }

        const results = {};
        const sourceList = Array.isArray(sources) ? sources : [sources];

        for (const source of sourceList) {
            try {
                let events = [];

                if (source === 'ra') {
                    events = await scrapeResidentAdvisor(city, { limit });
                } else if (source === 'ticketmaster') {
                    events = await scrapeTicketmaster(city, { limit });
                } else {
                    results[source] = { error: `Unknown source: ${source}` };
                    continue;
                }

                const saveResult = await saveScrapedEvents(events);
                results[source] = {
                    fetched: events.length,
                    ...saveResult
                };
            } catch (err) {
                console.error(`Error scraping ${source}:`, err.message);
                results[source] = { error: err.message };
            }
        }

        // Optionally run matching
        let matchResult = null;
        if (match) {
            matchResult = await matchAndLinkEvents({ dryRun: false });
        }

        res.json({
            success: true,
            city,
            sources: results,
            matching: matchResult
        });
    } catch (error) {
        console.error('Scrape error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Scrape from Ticketmaster only
app.post('/scrape/ticketmaster', async (req, res) => {
    try {
        const { city, limit = 100, classificationName = 'Music' } = req.body;

        if (!city) {
            return res.status(400).json({
                error: 'City required',
                availableCities: Object.keys(TICKETMASTER_CITY_MAP)
            });
        }

        const events = await scrapeTicketmaster(city, { limit, classificationName });
        const saveResult = await saveScrapedEvents(events);

        res.json({
            success: true,
            city,
            source: 'ticketmaster',
            fetched: events.length,
            ...saveResult
        });
    } catch (error) {
        console.error('Ticketmaster scrape error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Run matching algorithm
app.post('/scrape/match', async (req, res) => {
    try {
        const { dryRun = false, minConfidence = 0.6 } = req.body;

        const eventResult = await matchAndLinkEvents({ dryRun, minConfidence });
        const artistResult = await matchAndLinkArtists({ dryRun, minConfidence: 0.7 });
        const venueResult = await matchAndLinkVenues({ dryRun, minConfidence: 0.7 });

        res.json({
            success: true,
            dryRun,
            events: eventResult,
            artists: artistResult,
            venues: venueResult
        });
    } catch (error) {
        console.error('Match error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Manually trigger auto-reject of past events
app.post('/scrape/auto-reject', async (req, res) => {
    try {
        const result = await autoRejectPastEvents();
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Auto-reject error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Merge duplicate events (same date, venue, similar title)
app.post('/scrape/merge-duplicates', async (req, res) => {
    try {
        const { dryRun = false } = req.body;

        // Find potential duplicate events
        const duplicates = await pool.query(`
            SELECT e1.id as id1, e2.id as id2, 
                   e1.title as title1, e2.title as title2,
                   e1.venue_name, e1.date,
                   e1.created_at as created1, e2.created_at as created2
            FROM events e1
            JOIN events e2 ON e1.date::date = e2.date::date 
                AND LOWER(COALESCE(e1.venue_name, '')) = LOWER(COALESCE(e2.venue_name, ''))
                AND e1.id < e2.id
            WHERE similarity(LOWER(COALESCE(e1.title, '')), LOWER(COALESCE(e2.title, ''))) > 0.5
            LIMIT 200
        `);

        let merged = 0;
        const mergeResults = [];

        for (const dup of duplicates.rows) {
            const titleSim = stringSimilarity(dup.title1 || '', dup.title2 || '');

            if (titleSim >= 0.5) {
                // Keep the older event (id1), merge links from id2 to id1
                if (!dryRun) {
                    // Move all scraped links from id2 to id1
                    await pool.query(`
                        UPDATE event_scraped_links 
                        SET event_id = $1 
                        WHERE event_id = $2
                        AND NOT EXISTS (
                            SELECT 1 FROM event_scraped_links 
                            WHERE event_id = $1 AND scraped_event_id = event_scraped_links.scraped_event_id
                        )
                    `, [dup.id1, dup.id2]);

                    // Delete any remaining links for id2
                    await pool.query(`DELETE FROM event_scraped_links WHERE event_id = $1`, [dup.id2]);

                    // Delete the duplicate event
                    await pool.query(`DELETE FROM events WHERE id = $1`, [dup.id2]);

                    // Refresh the kept event
                    await refreshMainEvent(dup.id1);
                }

                merged++;
                mergeResults.push({
                    kept: { id: dup.id1, title: dup.title1 },
                    removed: { id: dup.id2, title: dup.title2 },
                    similarity: titleSim.toFixed(2),
                    venue: dup.venue_name,
                    date: dup.date
                });
            }
        }

        res.json({
            success: true,
            dryRun,
            merged,
            results: mergeResults.slice(0, 50)
        });
    } catch (error) {
        console.error('Merge duplicates error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Backfill artists for existing events from their linked scraped events
app.post('/scrape/backfill-artists', async (req, res) => {
    try {
        // Find events with null artists that have linked scraped events with artists
        const eventsToUpdate = await pool.query(`
            SELECT DISTINCT e.id, 
                   (SELECT se.artists_json 
                    FROM event_scraped_links esl 
                    JOIN scraped_events se ON se.id = esl.scraped_event_id 
                    WHERE esl.event_id = e.id 
                    AND se.artists_json IS NOT NULL 
                    AND jsonb_array_length(se.artists_json) > 0
                    ORDER BY esl.match_confidence DESC 
                    LIMIT 1) as artists_json
            FROM events e
            WHERE e.artists IS NULL
        `);

        let updated = 0;
        const results = [];

        for (const event of eventsToUpdate.rows) {
            if (event.artists_json && event.artists_json.length > 0) {
                await pool.query(`
                    UPDATE events SET artists = $1 WHERE id = $2
                `, [JSON.stringify(event.artists_json), event.id]);

                updated++;
                results.push({
                    id: event.id,
                    artists: event.artists_json.map(a => a.name).join(', ')
                });
            }
        }

        res.json({
            success: true,
            updated,
            total: eventsToUpdate.rows.length,
            results: results.slice(0, 30)
        });
    } catch (error) {
        console.error('Backfill artists error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Deduplicate venues in the main venues table
async function deduplicateVenues() {
    let merged = 0;

    // Find potential duplicates by name similarity in the same city
    const duplicates = await pool.query(`
        SELECT v1.id as id1, v2.id as id2, v1.name as name1, v2.name as name2,
               v1.city, v1.address as addr1, v2.address as addr2,
               v1.latitude as lat1, v1.longitude as lon1,
               v2.latitude as lat2, v2.longitude as lon2
        FROM venues v1
        JOIN venues v2 ON LOWER(v1.city) = LOWER(v2.city) AND v1.id < v2.id
        WHERE similarity(LOWER(v1.name), LOWER(v2.name)) > 0.7
           OR LOWER(REPLACE(v1.name, ' ', '')) = LOWER(REPLACE(v2.name, ' ', ''))
        LIMIT 100
    `);

    for (const dup of duplicates.rows) {
        const nameSim = stringSimilarity(dup.name1 || '', dup.name2 || '');

        if (nameSim >= 0.7) {
            console.log(`Merging duplicate venues: "${dup.name1}" and "${dup.name2}" in ${dup.city} (similarity: ${nameSim.toFixed(2)})`);

            // Determine which one to keep (prefer the one with more data)
            const score1 = (dup.lat1 ? 1 : 0) + (dup.addr1 ? 1 : 0);
            const score2 = (dup.lat2 ? 1 : 0) + (dup.addr2 ? 1 : 0);
            const [keepId, deleteId] = score1 >= score2 ? [dup.id1, dup.id2] : [dup.id2, dup.id1];

            // Update events to point to the kept venue
            await pool.query(`
                UPDATE events SET venue_id = $1 WHERE venue_id = $2
            `, [keepId, deleteId]);

            // Update venue_source_links if they exist
            try {
                await pool.query(`
                    UPDATE venue_source_links SET unified_venue_id = $1 WHERE unified_venue_id = $2
                `, [keepId, deleteId]);
            } catch (e) { /* table might not exist */ }

            // Merge any missing data from deleted venue to kept venue
            const [keptVenue, deletedVenue] = await Promise.all([
                pool.query('SELECT * FROM venues WHERE id = $1', [keepId]),
                pool.query('SELECT * FROM venues WHERE id = $1', [deleteId])
            ]);

            if (keptVenue.rows[0] && deletedVenue.rows[0]) {
                const kept = keptVenue.rows[0];
                const deleted = deletedVenue.rows[0];
                const updates = [];
                const params = [];
                let paramIdx = 1;

                // Fill in missing fields from the duplicate
                if (!kept.address && deleted.address) {
                    updates.push(`address = $${paramIdx++}`);
                    params.push(deleted.address);
                }
                if (!kept.latitude && deleted.latitude) {
                    updates.push(`latitude = $${paramIdx++}`);
                    params.push(deleted.latitude);
                }
                if (!kept.longitude && deleted.longitude) {
                    updates.push(`longitude = $${paramIdx++}`);
                    params.push(deleted.longitude);
                }
                if (!kept.content_url && deleted.content_url) {
                    updates.push(`content_url = $${paramIdx++}`);
                    params.push(deleted.content_url);
                }

                if (updates.length > 0) {
                    params.push(keepId);
                    await pool.query(`UPDATE venues SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
                }
            }

            // Delete the duplicate venue
            await pool.query('DELETE FROM venues WHERE id = $1', [deleteId]);
            merged++;
        }
    }

    return { merged };
}

// Deduplicate artists in the main artists table
async function deduplicateArtists() {
    let merged = 0;

    // Find potential duplicates by name similarity
    const duplicates = await pool.query(`
        SELECT a1.id as id1, a2.id as id2, a1.name as name1, a2.name as name2
        FROM artists a1
        JOIN artists a2 ON a1.id < a2.id
        WHERE similarity(LOWER(a1.name), LOWER(a2.name)) > 0.85
           OR LOWER(REPLACE(a1.name, ' ', '')) = LOWER(REPLACE(a2.name, ' ', ''))
        LIMIT 100
    `);

    for (const dup of duplicates.rows) {
        const nameSim = stringSimilarity(dup.name1 || '', dup.name2 || '');

        if (nameSim >= 0.85) {
            console.log(`Merging duplicate artists: "${dup.name1}" and "${dup.name2}" (similarity: ${nameSim.toFixed(2)})`);

            // Keep the first one (id1)
            const keepId = dup.id1;
            const deleteId = dup.id2;

            // Update artist_source_links if they exist
            try {
                await pool.query(`
                    UPDATE artist_source_links SET unified_artist_id = $1 WHERE unified_artist_id = $2
                `, [keepId, deleteId]);
            } catch (e) { /* table might not exist */ }

            // Delete the duplicate artist
            await pool.query('DELETE FROM artists WHERE id = $1', [deleteId]);
            merged++;
        }
    }

    return { merged };
}

// ============================================
// SYNC JOB HELPERS
// ============================================

let currentSyncJob = null;

function createSyncJob(cities, sources) {
    currentSyncJob = {
        id: Date.now().toString(),
        startTime: new Date(),
        status: 'running',
        cities,
        sources,
        progress: {
            currentCity: null,
            currentSource: null,
            phase: 'initializing',
            citiesProcessed: 0,
            percentComplete: 0
        },
        results: null,
        error: null
    };
    return currentSyncJob;
}

function updateSyncProgress(update) {
    if (currentSyncJob && currentSyncJob.status === 'running') {
        currentSyncJob.progress = { ...currentSyncJob.progress, ...update };
        currentSyncJob.lastUpdated = new Date();
    }
}

function completeSyncJob(results, error = null) {
    if (currentSyncJob) {
        currentSyncJob.endTime = new Date();
        currentSyncJob.status = error ? 'failed' : 'completed';
        currentSyncJob.results = results;
        currentSyncJob.error = error;
    }
}

// Placeholder enrichment functions
async function enrichMissingVenueData(limit) {
    console.log(`[Enrichment] Placeholder: enrichMissingVenueData called with limit ${limit}`);
    return { saved: 0 };
}

async function enrichMissingArtistData(limit) {
    console.log(`[Enrichment] Placeholder: enrichMissingArtistData called with limit ${limit}`);
    return { saved: 0 };
}

// Get sync status
app.get('/sync/status', (req, res) => {
    if (!currentSyncJob) {
        return res.json({ status: 'idle' });
    }
    res.json(currentSyncJob);
});

// Stop sync job
app.post('/sync/stop', (req, res) => {
    if (currentSyncJob && currentSyncJob.status === 'running') {
        currentSyncJob.status = 'stopped';
        res.json({ success: true, message: 'Sync job stopping...' });
    } else {
        res.json({ success: false, message: 'No running sync job' });
    }
});

// ============== Sync Pipeline Endpoint ==============
// Full sync pipeline: scrape → match → enrich → dedupe
app.post('/sync/pipeline', async (req, res) => {
    try {
        const { cities = [], sources = ['ra', 'ticketmaster'], enrichAfter = true, dedupeAfter = true } = req.body;

        if (!cities || cities.length === 0) {
            return res.status(400).json({ error: 'At least one city is required' });
        }

        // Check if a sync job is already running
        if (currentSyncJob && currentSyncJob.status === 'running') {
            return res.status(409).json({
                error: 'Sync job already in progress',
                currentJob: {
                    status: currentSyncJob.status,
                    currentCity: currentSyncJob.progress.currentCity,
                    phase: currentSyncJob.progress.phase,
                    percentComplete: currentSyncJob.progress.percentComplete
                }
            });
        }

        console.log(`[Sync Pipeline] Starting for ${cities.length} cities:`, cities);

        // Initialize sync job tracking
        createSyncJob(cities, sources);

        const results = {
            scrape: {
                cities_processed: 0,
                total_fetched: 0,
                total_inserted: 0,
                total_updated: 0,
                by_city: {},
                errors: []
            },
            match: null,
            enrich: null,
            dedupe: null
        };

        // Send immediate response with job ID
        res.json({
            success: true,
            message: 'Sync job started',
            jobId: currentSyncJob.id,
            totalCities: cities.length
        });

        // Process each city with a pause between (run async)
        (async () => {
            try {
                for (let i = 0; i < cities.length; i++) {
                    const city = cities[i].toLowerCase();
                    console.log(`[Sync Pipeline] Processing city ${i + 1}/${cities.length}: ${city}`);

                    // Update progress
                    updateSyncProgress({
                        currentCity: city,
                        currentSource: null,
                        phase: 'scraping',
                        citiesProcessed: i,
                        percentComplete: Math.floor((i / cities.length) * 100)
                    });

                    try {
                        const cityResults = {};

                        for (const source of sources) {
                            try {
                                // Update current source
                                updateSyncProgress({ currentSource: source });

                                let events = [];
                                const startTime = Date.now();

                                if (source === 'ra') {
                                    events = await scrapeResidentAdvisor(city, { limit: 100 });
                                } else if (source === 'ticketmaster') {
                                    events = await scrapeTicketmaster(city, { limit: 100 });
                                }

                                const saveResult = await saveScrapedEvents(events);
                                const duration = Date.now() - startTime;

                                cityResults[source] = {
                                    fetched: events.length,
                                    ...saveResult
                                };

                                results.scrape.total_fetched += events.length;
                                results.scrape.total_inserted += saveResult.inserted || 0;
                                results.scrape.total_updated += saveResult.updated || 0;

                                // Log to scrape history
                                await logScrapeHistory({
                                    city,
                                    source_code: source,
                                    events_fetched: events.length,
                                    events_inserted: saveResult.inserted || 0,
                                    events_updated: saveResult.updated || 0,
                                    venues_created: saveResult.venues_created || 0,
                                    artists_created: saveResult.artists_created || 0,
                                    duration_ms: duration
                                });
                            } catch (sourceErr) {
                                console.error(`[Sync Pipeline] Error scraping ${source} for ${city}:`, sourceErr.message);
                                cityResults[source] = { error: sourceErr.message };

                                // Log error to history
                                await logScrapeHistory({
                                    city,
                                    source_code: source,
                                    error: sourceErr.message
                                });
                            }
                        }

                        results.scrape.by_city[city] = cityResults;
                        results.scrape.cities_processed++;

                        // Ensure city exists in database
                        await pool.query(`
                    INSERT INTO cities (name, country)
                    VALUES ($1, $2)
                    ON CONFLICT (name) DO NOTHING
                `, [city.charAt(0).toUpperCase() + city.slice(1), 'Unknown']);

                    } catch (cityErr) {
                        console.error(`[Sync Pipeline] Error processing ${city}:`, cityErr.message);
                        results.scrape.errors.push({ city, error: cityErr.message });
                    }

                    // Pause between cities to avoid rate limiting (2 seconds)
                    if (i < cities.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }

                // Update progress after city completion
                updateSyncProgress({
                    citiesProcessed: i + 1,
                    percentComplete: Math.floor(((i + 1) / cities.length) * 100)
                });

                // Run matching to link scraped data to main tables
                updateSyncProgress({ phase: 'matching' });
                console.log('[Sync Pipeline] Running matching...');
                try {
                    const [eventMatch, artistMatch, venueMatch] = await Promise.all([
                        matchAndLinkEvents({ dryRun: false }),
                        matchAndLinkArtists({ dryRun: false, minConfidence: 0.7 }),
                        matchAndLinkVenues({ dryRun: false, minConfidence: 0.7 })
                    ]);
                    results.match = {
                        events: eventMatch,
                        artists: artistMatch,
                        venues: venueMatch
                    };
                    console.log(`[Sync Pipeline] Matched: ${eventMatch.matched} events, ${artistMatch.matched} artists, ${venueMatch.matched} venues`);
                } catch (matchErr) {
                    console.error('[Sync Pipeline] Matching error:', matchErr.message);
                    results.match = { error: matchErr.message };
                }

                // Enrich venues and artists if enabled
                if (enrichAfter) {
                    updateSyncProgress({ phase: 'enriching' });
                    console.log('[Sync Pipeline] Enriching venues and artists...');
                    try {
                        const [venueResult, artistResult] = await Promise.all([
                            enrichMissingVenueData(100),
                            enrichMissingArtistData(200)
                        ]);
                        results.enrich = {
                            venues_enriched: venueResult.saved || 0,
                            artists_enriched: artistResult.saved || 0
                        };
                    } catch (enrichErr) {
                        console.error('[Sync Pipeline] Enrichment error:', enrichErr.message);
                        results.enrich = { error: enrichErr.message };
                    }
                }

                // Deduplicate if enabled
                if (dedupeAfter) {
                    updateSyncProgress({ phase: 'deduplicating' });
                    console.log('[Sync Pipeline] Deduplicating...');
                    try {
                        const [eventsDeduped, venuesDeduped, artistsDeduped] = await Promise.all([
                            deduplicateUnifiedEvents(),
                            deduplicateVenues(),
                            deduplicateArtists()
                        ]);
                        results.dedupe = {
                            events_merged: eventsDeduped.merged || 0,
                            venues_merged: venuesDeduped.merged || 0,
                            artists_merged: artistsDeduped.merged || 0
                        };
                    } catch (dedupeErr) {
                        console.error('[Sync Pipeline] Deduplication error:', dedupeErr.message);
                        results.dedupe = { error: dedupeErr.message };
                    }
                }

                console.log('[Sync Pipeline] Complete!', results);

                // Complete the sync job
                completeSyncJob(results);

            } catch (error) {
                console.error('[Sync Pipeline] Fatal error:', error);
                completeSyncJob(null, error.message);
            }
        })();

    } catch (error) {
        console.error('[Sync Pipeline] Fatal error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Deduplicate unified events manually
app.post('/scrape/deduplicate', async (req, res) => {
    try {
        const { type = 'all' } = req.body;
        const results = {};

        if (type === 'all' || type === 'events') {
            results.events = await deduplicateUnifiedEvents();
        }
        if (type === 'all' || type === 'venues') {
            results.venues = await deduplicateVenues();
        }
        if (type === 'all' || type === 'artists') {
            results.artists = await deduplicateArtists();
        }

        res.json({
            success: true,
            results,
            message: `Deduplicated: ${results.events?.merged || 0} events, ${results.venues?.merged || 0} venues, ${results.artists?.merged || 0} artists`
        });
    } catch (error) {
        console.error('Deduplication error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get scraped events
app.get('/scraped/events', async (req, res) => {
    try {
        const { source, city, linked, limit = 100, offset = 0 } = req.query;

        // Use event_scraped_links (not event_source_links) for link checking
        let query = 'SELECT se.*, EXISTS(SELECT 1 FROM event_scraped_links esl WHERE esl.scraped_event_id = se.id) as is_linked FROM scraped_events se WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (source) {
            query += ` AND se.source_code = $${paramIndex++}`;
            params.push(source);
        }
        if (city) {
            query += ` AND LOWER(se.venue_city) = LOWER($${paramIndex++})`;
            params.push(city);
        }
        if (linked === 'true') {
            query += ` AND EXISTS(SELECT 1 FROM event_scraped_links esl WHERE esl.scraped_event_id = se.id)`;
        } else if (linked === 'false') {
            query += ` AND NOT EXISTS(SELECT 1 FROM event_scraped_links esl WHERE esl.scraped_event_id = se.id)`;
        }

        query += ` ORDER BY se.date ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        // Build count query separately
        let countQuery = 'SELECT COUNT(*) FROM scraped_events se WHERE 1=1';
        const countParams = [];
        let countParamIndex = 1;
        
        if (source) {
            countQuery += ` AND se.source_code = $${countParamIndex++}`;
            countParams.push(source);
        }
        if (city) {
            countQuery += ` AND LOWER(se.venue_city) = LOWER($${countParamIndex++})`;
            countParams.push(city);
        }
        if (linked === 'true') {
            countQuery += ` AND EXISTS(SELECT 1 FROM event_scraped_links esl WHERE esl.scraped_event_id = se.id)`;
        } else if (linked === 'false') {
            countQuery += ` AND NOT EXISTS(SELECT 1 FROM event_scraped_links esl WHERE esl.scraped_event_id = se.id)`;
        }
        
        const countResult = await pool.query(countQuery, countParams);

        res.json({
            data: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Scraped events error:', error);
        // If event_scraped_links doesn't exist, query without it
        if (error.code === '42P01' && error.message.includes('event_scraped_links')) {
            try {
                let query = 'SELECT se.*, false as is_linked FROM scraped_events se WHERE 1=1';
                const params = [];
                let paramIndex = 1;

                if (source) {
                    query += ` AND se.source_code = $${paramIndex++}`;
                    params.push(source);
                }
                if (city) {
                    query += ` AND LOWER(se.venue_city) = LOWER($${paramIndex++})`;
                    params.push(city);
                }
                // Skip linked filter if table doesn't exist

                query += ` ORDER BY se.date ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
                params.push(parseInt(limit), parseInt(offset));

                const result = await pool.query(query, params);

                let countQuery = 'SELECT COUNT(*) FROM scraped_events se WHERE 1=1';
                const countParams = params.slice(0, -2);
                const countResult = await pool.query(countQuery, countParams.length > 0 ? countParams : []);

                res.json({
                    data: result.rows,
                    total: parseInt(countResult.rows[0].count),
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                });
            } catch (fallbackError) {
                res.json({ data: [], total: 0, limit: parseInt(limit), offset: parseInt(offset), error: fallbackError.message });
            }
        } else {
            res.json({ data: [], total: 0, limit: parseInt(limit), offset: parseInt(offset), error: error.message });
        }
    }
});

// Delete ALL scraped events
app.delete('/scraped/events', async (req, res) => {
    try {
        // First delete links, then scraped events
        await pool.query('DELETE FROM event_scraped_links');
        await pool.query('DELETE FROM event_source_links');
        const result = await pool.query('DELETE FROM scraped_events RETURNING id');
        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete ALL scraped artists
app.delete('/scraped/artists', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM scraped_artists RETURNING id');
        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete ALL scraped venues
app.delete('/scraped/venues', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM scraped_venues RETURNING id');
        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get unified events (with source references)
app.get('/unified/events', async (req, res) => {
    try {
        const { city, published, limit = 100, offset = 0 } = req.query;

        let query = `
            SELECT ue.*,
                (SELECT json_agg(json_build_object(
                    'source_code', se.source_code,
                    'source_event_id', se.source_event_id,
                    'title', se.title,
                    'content_url', se.content_url,
                    'confidence', esl.match_confidence
                ))
                FROM event_source_links esl
                JOIN scraped_events se ON se.id = esl.scraped_event_id
                WHERE esl.unified_event_id = ue.id) as source_references
            FROM unified_events ue
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (city) {
            query += ` AND LOWER(ue.venue_city) = LOWER($${paramIndex++})`;
            params.push(city);
        }
        if (published === 'true') {
            query += ` AND ue.is_published = true`;
        } else if (published === 'false') {
            query += ` AND ue.is_published = false`;
        }

        query += ` ORDER BY ue.date ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        res.json({
            data: result.rows,
            total: result.rows.length,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get unified event by ID with full source details
app.get('/unified/events/:id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ue.*,
                (SELECT json_agg(json_build_object(
                    'id', se.id,
                    'source_code', se.source_code,
                    'source_event_id', se.source_event_id,
                    'title', se.title,
                    'date', se.date,
                    'start_time', se.start_time,
                    'content_url', se.content_url,
                    'flyer_front', se.flyer_front,
                    'venue_name', se.venue_name,
                    'price_info', se.price_info,
                    'confidence', esl.match_confidence,
                    'is_primary', esl.is_primary
                ))
                FROM event_source_links esl
                JOIN scraped_events se ON se.id = esl.scraped_event_id
                WHERE esl.unified_event_id = ue.id) as source_references,
                (SELECT json_agg(json_build_object(
                    'id', ua.id,
                    'name', ua.name,
                    'image_url', ua.image_url
                ))
                FROM unified_event_artists uea
                JOIN unified_artists ua ON ua.id = uea.unified_artist_id
                WHERE uea.unified_event_id = ue.id) as artists
            FROM unified_events ue
            WHERE ue.id = $1
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update unified event (user edits go to 'original' source)
app.patch('/unified/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Check if unified event exists
        const existing = await pool.query('SELECT * FROM unified_events WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const dataFields = ['title', 'date', 'start_time', 'end_time', 'description',
            'flyer_front', 'ticket_url', 'price_info', 'venue_name',
            'venue_address', 'venue_city', 'venue_country'];
        const metaFields = ['is_published', 'is_featured', 'unified_venue_id'];

        // Separate data updates from meta updates
        const dataUpdates = {};
        const metaUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
            if (dataFields.includes(key)) dataUpdates[key] = value;
            if (metaFields.includes(key)) metaUpdates[key] = value;
        }

        // If there are data updates, create/update 'original' source entry
        if (Object.keys(dataUpdates).length > 0) {
            // Check if original source already exists
            const existingOriginal = await pool.query(`
                SELECT se.id FROM event_source_links esl
                JOIN scraped_events se ON se.id = esl.scraped_event_id
                WHERE esl.unified_event_id = $1 AND se.source_code = 'original'
            `, [id]);

            if (existingOriginal.rows.length > 0) {
                // Update existing original source entry
                const originalId = existingOriginal.rows[0].id;
                const updateClauses = [];
                const updateValues = [];
                let idx = 1;
                for (const [key, value] of Object.entries(dataUpdates)) {
                    updateClauses.push(`${key} = $${idx++}`);
                    updateValues.push(key === 'price_info' ? JSON.stringify(value) : value);
                }
                updateValues.push(originalId);
                await pool.query(`
                    UPDATE scraped_events SET ${updateClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $${idx}
                `, updateValues);
            } else {
                // Create new 'original' source entry with current unified data + updates
                const unified = existing.rows[0];
                const mergedData = { ...unified, ...dataUpdates };
                const originalId = `original_${id}_${Date.now()}`;

                await pool.query(`
                    INSERT INTO scraped_events (
                        id, source_code, source_event_id, title, date, start_time, end_time,
                        description, flyer_front, content_url, venue_name, venue_address, 
                        venue_city, venue_country
                    ) VALUES ($1, 'original', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                `, [
                    originalId, id, mergedData.title, mergedData.date, mergedData.start_time,
                    mergedData.end_time, mergedData.description, mergedData.flyer_front,
                    mergedData.ticket_url, mergedData.venue_name, mergedData.venue_address,
                    mergedData.venue_city, mergedData.venue_country
                ]);

                // Link to unified event with highest priority
                await pool.query(`
                    INSERT INTO event_source_links (scraped_event_id, unified_event_id, match_confidence, priority, is_primary)
                    VALUES ($1, $2, 1.0, 1, true)
                `, [originalId, id]);
            }

            // Refresh unified data from all sources
            await refreshUnifiedEvent(id);
        }

        // Apply meta updates directly to unified event
        if (Object.keys(metaUpdates).length > 0) {
            const metaClauses = [];
            const metaValues = [];
            let idx = 1;
            for (const [key, value] of Object.entries(metaUpdates)) {
                metaClauses.push(`${key} = $${idx++}`);
                metaValues.push(value);
            }
            if (metaUpdates.is_published === true) {
                metaClauses.push(`published_at = COALESCE(published_at, CURRENT_TIMESTAMP)`);
            }
            metaValues.push(id);
            await pool.query(`
                UPDATE unified_events SET ${metaClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${idx}
            `, metaValues);
        }

        // Return updated event with sources
        const result = await pool.query(`
            SELECT ue.*,
                (SELECT json_agg(json_build_object(
                    'id', se.id, 'source_code', se.source_code, 'title', se.title,
                    'date', se.date, 'venue_name', se.venue_name, 'is_primary', esl.is_primary
                ))
                FROM event_source_links esl
                JOIN scraped_events se ON se.id = esl.scraped_event_id
                WHERE esl.unified_event_id = ue.id) as source_references
            FROM unified_events ue WHERE ue.id = $1
        `, [id]);

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating unified event:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get scraped venues
app.get('/scraped/venues', async (req, res) => {
    try {
        const { source, city, linked, search, limit = 100, offset = 0 } = req.query;

        let query = `
            SELECT sv.*, 
                EXISTS(SELECT 1 FROM venue_source_links vsl WHERE vsl.scraped_venue_id = sv.id) as is_linked,
                (SELECT uv.name FROM venue_source_links vsl JOIN unified_venues uv ON uv.id = vsl.unified_venue_id WHERE vsl.scraped_venue_id = sv.id LIMIT 1) as linked_venue_name
            FROM scraped_venues sv 
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (source) {
            query += ` AND sv.source_code = $${paramIndex++}`;
            params.push(source);
        }
        if (city) {
            query += ` AND LOWER(sv.city) = LOWER($${paramIndex++})`;
            params.push(city);
        }
        if (search) {
            query += ` AND (sv.name ILIKE $${paramIndex++} OR sv.address ILIKE $${paramIndex - 1})`;
            params.push(`%${search}%`);
        }
        if (linked === 'true') {
            query += ` AND EXISTS(SELECT 1 FROM venue_source_links vsl WHERE vsl.scraped_venue_id = sv.id)`;
        } else if (linked === 'false') {
            query += ` AND NOT EXISTS(SELECT 1 FROM venue_source_links vsl WHERE vsl.scraped_venue_id = sv.id)`;
        }

        const dataQuery = query + ` ORDER BY sv.name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(dataQuery, params);

        // Count query
        const countParams = params.slice(0, -2);
        let countQuery = `SELECT COUNT(*) FROM scraped_venues sv WHERE 1=1`;
        let countParamIndex = 1;
        if (source) countQuery += ` AND sv.source_code = $${countParamIndex++}`;
        if (city) countQuery += ` AND LOWER(sv.city) = LOWER($${countParamIndex++})`;
        if (search) countQuery += ` AND (sv.name ILIKE $${countParamIndex++} OR sv.address ILIKE $${countParamIndex - 1})`;
        if (linked === 'true') countQuery += ` AND EXISTS(SELECT 1 FROM venue_source_links vsl WHERE vsl.scraped_venue_id = sv.id)`;
        else if (linked === 'false') countQuery += ` AND NOT EXISTS(SELECT 1 FROM venue_source_links vsl WHERE vsl.scraped_venue_id = sv.id)`;

        const countResult = await pool.query(countQuery, countParams);

        res.json({
            data: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Scraped venues error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get scraped artists
app.get('/scraped/artists', async (req, res) => {
    try {
        const { source, search, linked, limit = 100, offset = 0 } = req.query;

        let query = `
            SELECT sa.*, 
                EXISTS(SELECT 1 FROM artist_scraped_links asl WHERE asl.scraped_artist_id = sa.id) as is_linked,
                (SELECT a.name FROM artist_scraped_links asl JOIN artists a ON a.id = asl.artist_id WHERE asl.scraped_artist_id = sa.id LIMIT 1) as linked_artist_name
            FROM scraped_artists sa 
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (source) {
            query += ` AND sa.source_code = $${paramIndex++}`;
            params.push(source);
        }
        if (search) {
            query += ` AND sa.name ILIKE $${paramIndex++}`;
            params.push(`%${search}%`);
        }
        if (linked === 'true') {
            query += ` AND EXISTS(SELECT 1 FROM artist_scraped_links asl WHERE asl.scraped_artist_id = sa.id)`;
        } else if (linked === 'false') {
            query += ` AND NOT EXISTS(SELECT 1 FROM artist_scraped_links asl WHERE asl.scraped_artist_id = sa.id)`;
        }

        const dataQuery = query + ` ORDER BY sa.name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(dataQuery, params);

        // Count query
        const countParams = params.slice(0, -2);
        let countQuery = `SELECT COUNT(*) FROM scraped_artists sa WHERE 1=1`;
        let countParamIndex = 1;
        if (source) countQuery += ` AND sa.source_code = $${countParamIndex++}`;
        if (search) countQuery += ` AND sa.name ILIKE $${countParamIndex++}`;
        if (linked === 'true') countQuery += ` AND EXISTS(SELECT 1 FROM artist_scraped_links asl WHERE asl.scraped_artist_id = sa.id)`;
        else if (linked === 'false') countQuery += ` AND NOT EXISTS(SELECT 1 FROM artist_scraped_links asl WHERE asl.scraped_artist_id = sa.id)`;

        const countResult = await pool.query(countQuery, countParams);

        res.json({
            data: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Scraped artists error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get unified venues
app.get('/unified/venues', async (req, res) => {
    try {
        const { city, search, limit = 100, offset = 0 } = req.query;

        let query = `
            SELECT uv.*,
                (SELECT json_agg(json_build_object(
                    'source_code', sv.source_code,
                    'source_venue_id', sv.source_venue_id,
                    'name', sv.name,
                    'content_url', sv.content_url
                ))
                FROM venue_source_links vsl
                JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
                WHERE vsl.unified_venue_id = uv.id) as source_references,
                (SELECT COUNT(*) FROM unified_events ue WHERE ue.unified_venue_id = uv.id) as event_count
            FROM unified_venues uv
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (city) {
            query += ` AND LOWER(uv.city) = LOWER($${paramIndex++})`;
            params.push(city);
        }
        if (search) {
            query += ` AND (uv.name ILIKE $${paramIndex++} OR uv.address ILIKE $${paramIndex - 1})`;
            params.push(`%${search}%`);
        }

        const dataQuery = query + ` ORDER BY uv.name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(dataQuery, params);

        // Count
        const countParams = params.slice(0, -2);
        let countQuery = `SELECT COUNT(*) FROM unified_venues uv WHERE 1=1`;
        let countParamIndex = 1;
        if (city) countQuery += ` AND LOWER(uv.city) = LOWER($${countParamIndex++})`;
        if (search) countQuery += ` AND (uv.name ILIKE $${countParamIndex++} OR uv.address ILIKE $${countParamIndex - 1})`;

        const countResult = await pool.query(countQuery, countParams);

        res.json({
            data: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Unified venues error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get unified venue by ID with source references
app.get('/unified/venues/:id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT uv.*,
                (SELECT json_agg(json_build_object(
                    'id', sv.id,
                    'source_code', sv.source_code,
                    'source_venue_id', sv.source_venue_id,
                    'name', sv.name,
                    'address', sv.address,
                    'city', sv.city,
                    'country', sv.country,
                    'latitude', sv.latitude,
                    'longitude', sv.longitude,
                    'content_url', sv.content_url,
                    'capacity', sv.capacity
                ))
                FROM venue_source_links vsl
                JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
                WHERE vsl.unified_venue_id = uv.id) as source_references,
                (SELECT COUNT(*) FROM unified_events ue WHERE ue.unified_venue_id = uv.id) as event_count
            FROM unified_venues uv
            WHERE uv.id = $1
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Venue not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update unified venue (user edits go to 'original' source)
app.patch('/unified/venues/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const existing = await pool.query('SELECT * FROM unified_venues WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Venue not found' });
        }

        const dataFields = ['name', 'address', 'city', 'country', 'latitude', 'longitude', 'website', 'capacity'];
        const dataUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
            if (dataFields.includes(key)) dataUpdates[key] = value;
        }

        if (Object.keys(dataUpdates).length > 0) {
            // Check if original source already exists
            const existingOriginal = await pool.query(`
                SELECT sv.id FROM venue_source_links vsl
                JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
                WHERE vsl.unified_venue_id = $1 AND sv.source_code = 'original'
            `, [id]);

            if (existingOriginal.rows.length > 0) {
                const originalId = existingOriginal.rows[0].id;
                const updateClauses = [];
                const updateValues = [];
                let idx = 1;
                for (const [key, value] of Object.entries(dataUpdates)) {
                    updateClauses.push(`${key} = $${idx++}`);
                    updateValues.push(value);
                }
                updateValues.push(originalId);
                await pool.query(`
                    UPDATE scraped_venues SET ${updateClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $${idx}
                `, updateValues);
            } else {
                const unified = existing.rows[0];
                const mergedData = { ...unified, ...dataUpdates };
                const originalId = `original_venue_${id}_${Date.now()}`;

                await pool.query(`
                    INSERT INTO scraped_venues (
                        id, source_code, source_venue_id, name, address, city, country, latitude, longitude, content_url, capacity
                    ) VALUES ($1, 'original', $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `, [
                    originalId, id, mergedData.name, mergedData.address, mergedData.city,
                    mergedData.country, mergedData.latitude, mergedData.longitude,
                    mergedData.website, mergedData.capacity
                ]);

                await pool.query(`
                    INSERT INTO venue_source_links (scraped_venue_id, unified_venue_id, match_confidence, priority)
                    VALUES ($1, $2, 1.0, 1)
                `, [originalId, id]);
            }

            await refreshUnifiedVenue(id);
        }

        const result = await pool.query(`
            SELECT uv.*,
                (SELECT json_agg(json_build_object(
                    'id', sv.id, 'source_code', sv.source_code, 'name', sv.name, 'city', sv.city
                ))
                FROM venue_source_links vsl
                JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
                WHERE vsl.unified_venue_id = uv.id) as source_references
            FROM unified_venues uv WHERE uv.id = $1
        `, [id]);

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating unified venue:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get unified artists  
app.get('/unified/artists', async (req, res) => {
    try {
        const { search, limit = 100, offset = 0 } = req.query;

        let query = `
            SELECT ua.*,
                (SELECT json_agg(json_build_object(
                    'source_code', sa.source_code,
                    'source_artist_id', sa.source_artist_id,
                    'name', sa.name,
                    'content_url', sa.content_url,
                    'image_url', sa.image_url
                ))
                FROM artist_source_links asl
                JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                WHERE asl.unified_artist_id = ua.id) as source_references,
                (SELECT COUNT(DISTINCT uea.unified_event_id) FROM unified_event_artists uea WHERE uea.unified_artist_id = ua.id) as event_count
            FROM unified_artists ua
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND ua.name ILIKE $${paramIndex++}`;
            params.push(`%${search}%`);
        }

        const dataQuery = query + ` ORDER BY ua.name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(dataQuery, params);

        // Count
        const countParams = params.slice(0, -2);
        let countQuery = `SELECT COUNT(*) FROM unified_artists ua WHERE 1=1`;
        if (search) countQuery += ` AND ua.name ILIKE $1`;

        const countResult = await pool.query(countQuery, countParams);

        res.json({
            data: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Unified artists error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get unified artist by ID with source references
app.get('/unified/artists/:id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ua.*,
                (SELECT json_agg(json_build_object(
                    'id', sa.id,
                    'source_code', sa.source_code,
                    'source_artist_id', sa.source_artist_id,
                    'name', sa.name,
                    'genres', sa.genres,
                    'country', sa.country,
                    'image_url', sa.image_url,
                    'content_url', sa.content_url
                ))
                FROM artist_source_links asl
                JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                WHERE asl.unified_artist_id = ua.id) as source_references,
                (SELECT COUNT(DISTINCT uea.unified_event_id) FROM unified_event_artists uea WHERE uea.unified_artist_id = ua.id) as event_count
            FROM unified_artists ua
            WHERE ua.id = $1
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Artist not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update unified artist (user edits go to 'original' source)
app.patch('/unified/artists/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const existing = await pool.query('SELECT * FROM unified_artists WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Artist not found' });
        }

        const dataFields = ['name', 'genres', 'country', 'image_url', 'website'];
        const dataUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
            if (dataFields.includes(key)) dataUpdates[key] = value;
        }

        if (Object.keys(dataUpdates).length > 0) {
            const existingOriginal = await pool.query(`
                SELECT sa.id FROM artist_source_links asl
                JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                WHERE asl.unified_artist_id = $1 AND sa.source_code = 'original'
            `, [id]);

            if (existingOriginal.rows.length > 0) {
                const originalId = existingOriginal.rows[0].id;
                const updateClauses = [];
                const updateValues = [];
                let idx = 1;
                for (const [key, value] of Object.entries(dataUpdates)) {
                    updateClauses.push(`${key} = $${idx++}`);
                    updateValues.push(value);
                }
                updateValues.push(originalId);
                await pool.query(`
                    UPDATE scraped_artists SET ${updateClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $${idx}
                `, updateValues);
            } else {
                const unified = existing.rows[0];
                const mergedData = { ...unified, ...dataUpdates };
                const originalId = `original_artist_${id}_${Date.now()}`;

                await pool.query(`
                    INSERT INTO scraped_artists (
                        id, source_code, source_artist_id, name, genres, country, image_url, content_url
                    ) VALUES ($1, 'original', $2, $3, $4, $5, $6, $7)
                `, [
                    originalId, id, mergedData.name, mergedData.genres, mergedData.country,
                    mergedData.image_url, mergedData.website
                ]);

                await pool.query(`
                    INSERT INTO artist_source_links (scraped_artist_id, unified_artist_id, match_confidence, priority)
                    VALUES ($1, $2, 1.0, 1)
                `, [originalId, id]);
            }

            await refreshUnifiedArtist(id);
        }

        const result = await pool.query(`
            SELECT ua.*,
                (SELECT json_agg(json_build_object(
                    'id', sa.id, 'source_code', sa.source_code, 'name', sa.name, 'country', sa.country
                ))
                FROM artist_source_links asl
                JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
                WHERE asl.unified_artist_id = ua.id) as source_references
            FROM unified_artists ua WHERE ua.id = $1
        `, [id]);

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating unified artist:', error);
        res.status(500).json({ error: error.message });
    }
});

// Scrape stats
app.get('/scrape/stats', async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(DISTINCT source_event_id) FROM scraped_events) as total_scraped_events,
                (SELECT COUNT(DISTINCT source_event_id) FROM scraped_events WHERE source_code = 'ra') as ra_events,
                (SELECT COUNT(DISTINCT source_event_id) FROM scraped_events WHERE source_code = 'ticketmaster') as ticketmaster_events,
                (SELECT COUNT(*) FROM scraped_venues) as total_scraped_venues,
                (SELECT COUNT(*) FROM scraped_artists) as total_scraped_artists,
                (SELECT COUNT(*) FROM events) as total_main_events,
                (SELECT COUNT(*) FROM events WHERE is_published = true) as published_events,
                (SELECT COUNT(*) FROM events WHERE publish_status = 'pending') as pending_events,
                (SELECT COUNT(*) FROM events WHERE publish_status = 'approved') as approved_events,
                (SELECT COUNT(*) FROM events WHERE publish_status = 'rejected') as rejected_events,
                (SELECT COUNT(*) FROM venues) as total_main_venues,
                (SELECT COUNT(*) FROM artists) as total_main_artists,
                (SELECT COUNT(*) FROM event_scraped_links) as total_event_links,
                (SELECT COUNT(DISTINCT scraped_event_id) FROM event_scraped_links) as linked_scraped_events,
                (SELECT COUNT(*) FROM scraped_events WHERE NOT EXISTS(SELECT 1 FROM event_scraped_links esl WHERE esl.scraped_event_id = scraped_events.id)) as unlinked_scraped_events,
                (SELECT MAX(created_at) FROM scrape_history WHERE error IS NULL) as last_scraped_at,
                (SELECT city FROM scrape_history WHERE error IS NULL ORDER BY created_at DESC LIMIT 1) as last_scraped_city,
                (SELECT source_code FROM scrape_history WHERE error IS NULL ORDER BY created_at DESC LIMIT 1) as last_scraped_source
        `);

        const statsData = {
            ...stats.rows[0],
            next_scheduled_scrape: nextScheduledScrape,
            auto_scrape_enabled: autoScrapeEnabled
        };

        res.json(statsData);
    } catch (error) {
        console.error('Stats error:', error);
        // If event_scraped_links doesn't exist, return basic stats
        if (error.code === '42P01') {
            try {
                const basicStats = await pool.query(`
                    SELECT 
                        (SELECT COUNT(DISTINCT source_event_id) FROM scraped_events) as total_scraped_events,
                        (SELECT COUNT(DISTINCT source_event_id) FROM scraped_events WHERE source_code = 'ra') as ra_events,
                        (SELECT COUNT(DISTINCT source_event_id) FROM scraped_events WHERE source_code = 'ticketmaster') as ticketmaster_events,
                        (SELECT COUNT(*) FROM scraped_venues) as total_scraped_venues,
                        (SELECT COUNT(*) FROM scraped_artists) as total_scraped_artists,
                        (SELECT COUNT(*) FROM events) as total_main_events,
                        (SELECT COUNT(*) FROM events WHERE is_published = true) as published_events,
                        (SELECT COUNT(*) FROM events WHERE publish_status = 'pending') as pending_events,
                        (SELECT COUNT(*) FROM events WHERE publish_status = 'approved') as approved_events,
                        (SELECT COUNT(*) FROM events WHERE publish_status = 'rejected') as rejected_events,
                        (SELECT COUNT(*) FROM venues) as total_main_venues,
                        (SELECT COUNT(*) FROM artists) as total_main_artists,
                        0 as total_event_links,
                        0 as linked_scraped_events,
                        (SELECT COUNT(DISTINCT source_event_id) FROM scraped_events) as unlinked_scraped_events,
                        (SELECT MAX(created_at) FROM scrape_history WHERE error IS NULL) as last_scraped_at,
                        (SELECT city FROM scrape_history WHERE error IS NULL ORDER BY created_at DESC LIMIT 1) as last_scraped_city,
                        (SELECT source_code FROM scrape_history WHERE error IS NULL ORDER BY created_at DESC LIMIT 1) as last_scraped_source
                `);
                res.json(basicStats.rows[0]);
            } catch (fallbackError) {
                res.json({ error: fallbackError.message, total_scraped_events: 0, total_main_events: 0 });
            }
        } else {
            res.json({ error: error.message, total_scraped_events: 0, total_main_events: 0 });
        }
    }
});

// Auto-scrape configuration endpoints
app.get('/scrape/auto-config', (req, res) => {
    res.json({
        enabled: autoScrapeEnabled,
        cities: CITIES_TO_SCRAPE,
        sources: SOURCES_TO_SCRAPE,
        next_scheduled: nextScheduledScrape,
        schedule: '2:00 AM daily'
    });
});

app.post('/scrape/auto-config', verifyToken, (req, res) => {
    const { enabled } = req.body;
    
    if (typeof enabled === 'boolean') {
        autoScrapeEnabled = enabled;
        console.log(`[Auto-Scrape] ${enabled ? 'Enabled' : 'Disabled'} by admin`);
        
        res.json({
            success: true,
            enabled: autoScrapeEnabled,
            next_scheduled: enabled ? nextScheduledScrape : null
        });
    } else {
        res.status(400).json({ error: 'Invalid configuration' });
    }
});

// Trigger auto-scrape manually
app.post('/scrape/auto-trigger', verifyToken, async (req, res) => {
    try {
        res.json({ 
            success: true, 
            message: 'Auto-scrape triggered. This will run in the background.' 
        });
        
        // Run in background
        performAutoScrape().catch(err => {
            console.error('[Auto-Scrape] Manual trigger error:', err);
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Debug endpoint to check event_scraped_links
app.get('/db/debug/links', async (req, res) => {
    try {
        const { event_id, limit = 10 } = req.query;

        let result;
        if (event_id) {
            result = await pool.query(`
                SELECT esl.*, se.title as scraped_title, se.source_code
                FROM event_scraped_links esl
                JOIN scraped_events se ON se.id = esl.scraped_event_id
                WHERE esl.event_id = $1
            `, [event_id]);
        } else {
            result = await pool.query(`
                SELECT esl.event_id, se.title, se.source_code, esl.match_confidence
                FROM event_scraped_links esl
                JOIN scraped_events se ON se.id = esl.scraped_event_id
                ORDER BY esl.linked_at DESC
                LIMIT $1
            `, [parseInt(limit)]);
        }

        res.json({
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get scrape history for charts
app.get('/scrape/history', async (req, res) => {
    try {
        const { days = 30, groupBy = 'day' } = req.query;

        let query;
        if (groupBy === 'hour') {
            query = `
                SELECT 
                    DATE_TRUNC('hour', created_at) as timestamp,
                    SUM(events_fetched) as events_fetched,
                    SUM(events_inserted) as events_inserted,
                    SUM(events_updated) as events_updated,
                    SUM(venues_created) as venues_created,
                    SUM(artists_created) as artists_created,
                    COUNT(*) as scrape_runs,
                    ARRAY_AGG(DISTINCT city) as cities,
                    ARRAY_AGG(DISTINCT source_code) as sources
                FROM scrape_history
                WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
                AND error IS NULL
                GROUP BY DATE_TRUNC('hour', created_at)
                ORDER BY timestamp DESC
                LIMIT 168
            `;
        } else {
            query = `
                SELECT 
                    DATE(created_at) as timestamp,
                    SUM(events_fetched) as events_fetched,
                    SUM(events_inserted) as events_inserted,
                    SUM(events_updated) as events_updated,
                    SUM(venues_created) as venues_created,
                    SUM(artists_created) as artists_created,
                    COUNT(*) as scrape_runs,
                    ARRAY_AGG(DISTINCT city) as cities,
                    ARRAY_AGG(DISTINCT source_code) as sources
                FROM scrape_history
                WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
                AND error IS NULL
                GROUP BY DATE(created_at)
                ORDER BY timestamp DESC
            `;
        }

        const result = await pool.query(query);

        // Also get totals
        const totalsResult = await pool.query(`
            SELECT 
                SUM(events_fetched) as total_events_fetched,
                SUM(events_inserted) as total_events_inserted,
                SUM(venues_created) as total_venues_created,
                SUM(artists_created) as total_artists_created,
                COUNT(*) as total_scrape_runs,
                COUNT(DISTINCT city) as unique_cities,
                MIN(created_at) as first_scrape,
                MAX(created_at) as last_scrape
            FROM scrape_history
            WHERE error IS NULL
        `);

        res.json({
            history: result.rows,
            totals: totalsResult.rows[0],
            period: `${days} days`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get recent scrape activity
app.get('/scrape/recent', async (req, res) => {
    try {
        const { limit = 20 } = req.query;

        const result = await pool.query(`
            SELECT 
                id,
                created_at,
                city,
                source_code,
                events_fetched,
                events_inserted,
                events_updated,
                venues_created,
                artists_created,
                duration_ms,
                error,
                scrape_type
            FROM scrape_history
            ORDER BY created_at DESC
            LIMIT $1
        `, [parseInt(limit)]);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper function to log scrape history
async function logScrapeHistory(data) {
    try {
        await pool.query(`
            INSERT INTO scrape_history (city, source_code, events_fetched, events_inserted, events_updated, venues_created, artists_created, duration_ms, error, metadata, scrape_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
            data.city,
            data.source_code,
            data.events_fetched || 0,
            data.events_inserted || 0,
            data.events_updated || 0,
            data.venues_created || 0,
            data.artists_created || 0,
            data.duration_ms || null,
            data.error || null,
            JSON.stringify(data.metadata || {}),
            data.scrape_type || 'manual'
        ]);
    } catch (err) {
        console.error('Failed to log scrape history:', err.message);
    }
}

// Get available cities for scraping with source support
app.get('/scrape/cities', (req, res) => {
    const allCities = new Set([
        ...Object.keys(RA_AREA_MAP),
        ...Object.keys(TICKETMASTER_CITY_MAP)
    ]);

    const cities = Array.from(allCities).sort().map(city => {
        const hasRA = RA_AREA_MAP[city] !== undefined;
        const hasTM = TICKETMASTER_CITY_MAP[city] !== undefined;
        return {
            name: city.charAt(0).toUpperCase() + city.slice(1),
            key: city,
            sources: {
                ra: hasRA,
                ticketmaster: hasTM
            },
            ra_area_id: RA_AREA_MAP[city] || null,
            tm_country: TICKETMASTER_CITY_MAP[city]?.countryCode || null
        };
    });

    // Group by country/region
    const german = cities.filter(c =>
        TICKETMASTER_CITY_MAP[c.key]?.countryCode === 'DE' ||
        ['berlin', 'hamburg', 'cologne', 'frankfurt', 'munich', 'düsseldorf', 'dusseldorf',
            'stuttgart', 'leipzig', 'dresden', 'hannover', 'hanover', 'nuremberg', 'nürnberg',
            'mannheim', 'freiburg', 'münster', 'munster', 'dortmund', 'essen', 'bremen'].includes(c.key)
    );

    res.json({
        total: cities.length,
        cities,
        german: german.filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i),
        sources: ['ra', 'ticketmaster']
    });
});

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
    // Application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // process.exit(1); // Optional: restart the process
});

// Initialize required extensions on startup
async function initDatabaseExtensions() {
    try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        console.log('Database extensions initialized (pg_trgm)');
    } catch (error) {
        console.error('Failed to initialize database extensions:', error.message);
    }
}

// Calculate next scheduled scrape time
function calculateNextScrapeTime() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(2, 0, 0, 0); // 2:00 AM
    
    // If it's already past 2 AM today, schedule for tomorrow
    if (next <= now) {
        next.setDate(next.getDate() + 1);
    }
    
    return next.toISOString();
}

// Perform auto-scrape for all configured cities and sources
async function performAutoScrape() {
    if (!autoScrapeEnabled) {
        console.log('[Auto-Scrape] Skipped - auto-scrape is disabled');
        return;
    }

    console.log('[Auto-Scrape] Starting scheduled scrape...');
    
    for (const city of CITIES_TO_SCRAPE) {
        for (const source of SOURCES_TO_SCRAPE) {
            try {
                console.log(`[Auto-Scrape] Scraping ${source} for ${city}...`);
                
                if (source === 'ra') {
                    const events = await scrapeResidentAdvisor(city, { fullScrape: true });
                    await saveScrapedEvents(events, { city, source_code: 'ra' });
                    await logScrapeHistory({ city, source_code: 'ra', events_count: events.length, scrape_type: 'scheduled' });
                    console.log(`[Auto-Scrape] Completed ${source}/${city}: ${events.length} events`);
                } else if (source === 'ticketmaster') {
                    const events = await scrapeTicketmaster(city, { fullScrape: true });
                    await saveScrapedEvents(events, { city, source_code: 'ticketmaster' });
                    await logScrapeHistory({ city, source_code: 'ticketmaster', events_count: events.length, scrape_type: 'scheduled' });
                    console.log(`[Auto-Scrape] Completed ${source}/${city}: ${events.length} events`);
                }
                
                // Wait between scrapes to avoid overloading
                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (error) {
                console.error(`[Auto-Scrape] Error scraping ${source}/${city}:`, error.message);
                await logScrapeHistory({ 
                    city, 
                    source_code: source, 
                    events_count: 0,
                    error: error.message,
                    scrape_type: 'scheduled'
                });
            }
        }
    }
    
    console.log('[Auto-Scrape] Scheduled scrape completed');
    
    // Send notification if Telegram is configured
    if (bot && TELEGRAM_CHAT_ID) {
        try {
            await bot.sendMessage(TELEGRAM_CHAT_ID, 
                `🤖 Auto-scrape completed\nCities: ${CITIES_TO_SCRAPE.join(', ')}\nSources: ${SOURCES_TO_SCRAPE.join(', ')}`
            );
        } catch (err) {
            console.error('[Auto-Scrape] Failed to send Telegram notification:', err);
        }
    }
    
    // Update next scheduled time
    nextScheduledScrape = calculateNextScrapeTime();
}

// Initialize auto-scrape scheduler
function initAutoScrapeScheduler() {
    // Schedule scrape daily at 2:00 AM
    cron.schedule('0 2 * * *', () => {
        console.log('[Auto-Scrape] Cron triggered at 2:00 AM');
        performAutoScrape();
    });
    
    // Set initial next scheduled time
    nextScheduledScrape = calculateNextScrapeTime();
    
    console.log(`[Auto-Scrape] Scheduler initialized. Next scrape at: ${nextScheduledScrape}`);
}

// Main startup function
async function startServer() {
    try {
        // Initialize database (create if not exists, run migrations)
        await initializeDatabase();

        // Initialize database extensions
        await initDatabaseExtensions();

        // Initialize default admin user
        await initializeDefaultAdmin();

        // Initialize auto-scrape scheduler
        initAutoScrapeScheduler();

        // Start the HTTP server
        app.listen(PORT, async () => {
            console.log(`Puppeteer service running on port ${PORT}`);
            console.log(`Proxy list loaded: ${PROXY_LIST.length} proxies`);

            try {
                console.log('Launching browser with first proxy...');
                currentProxy = getNextProxy();
                await initBrowser();
                console.log(`Browser launched with proxy: ${currentProxy}`);
            } catch (err) {
                console.error('Failed to launch browser on startup:', err);
            }
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();
