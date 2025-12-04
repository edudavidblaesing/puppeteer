const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const TelegramBot = require('node-telegram-bot-api');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

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

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://rauser:rapassword@localhost:5433/raevents'
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Database connected at:', res.rows[0].now);
    }
});

// Geocoding using OpenStreetMap Nominatim (free, rate-limited to 1 req/sec)
const geocodeCache = new Map();
const GEOCODE_DELAY = 1100; // ms between requests to respect rate limit
let lastGeocodeTime = 0;

async function geocodeAddress(address, city, country) {
    if (!address && !city) return null;
    
    const fullAddress = [address, city, country].filter(Boolean).join(', ');
    
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
        const query = encodeURIComponent(fullAddress);
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
            {
                headers: {
                    'User-Agent': 'SocialEventsAdmin/1.0 (contact@example.com)'
                }
            }
        );
        
        if (!response.ok) {
            console.warn(`Geocoding failed for "${fullAddress}": ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            const result = {
                latitude: parseFloat(data[0].lat),
                longitude: parseFloat(data[0].lon)
            };
            geocodeCache.set(fullAddress, result);
            console.log(`Geocoded "${fullAddress}" -> ${result.latitude}, ${result.longitude}`);
            return result;
        }
        
        geocodeCache.set(fullAddress, null);
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
    console.log(`Waiting for resume signal (timeout: ${timeoutMs/1000}s)...`);
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
                        title = EXCLUDED.title,
                        date = EXCLUDED.date,
                        start_time = EXCLUDED.start_time,
                        end_time = EXCLUDED.end_time,
                        content_url = EXCLUDED.content_url,
                        flyer_front = EXCLUDED.flyer_front,
                        description = EXCLUDED.description,
                        venue_id = EXCLUDED.venue_id,
                        venue_name = EXCLUDED.venue_name,
                        venue_address = EXCLUDED.venue_address,
                        venue_city = EXCLUDED.venue_city,
                        venue_country = EXCLUDED.venue_country,
                        artists = EXCLUDED.artists,
                        listing_date = EXCLUDED.listing_date,
                        updated_at = CURRENT_TIMESTAMP
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
        const { city, limit = 100, offset = 0, from, to } = req.query;
        
        let query = 'SELECT * FROM events WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        
        if (city) {
            query += ` AND LOWER(venue_city) = LOWER($${paramIndex})`;
            params.push(city);
            paramIndex++;
        }
        
        if (from) {
            query += ` AND date >= $${paramIndex}`;
            params.push(from);
            paramIndex++;
        }
        
        if (to) {
            query += ` AND date <= $${paramIndex}`;
            params.push(to);
            paramIndex++;
        }
        
        query += ` ORDER BY date ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await pool.query(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM events WHERE 1=1';
        const countParams = [];
        let countParamIndex = 1;
        
        if (city) {
            countQuery += ` AND LOWER(venue_city) = LOWER($${countParamIndex})`;
            countParams.push(city);
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
        res.status(500).json({ error: error.message });
    }
});

// Get single event
app.get('/db/events/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }
        
        res.json(result.rows[0]);
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
            'is_published', 'latitude', 'longitude'
        ];
        
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
        // First try to get from cities table
        const citiesResult = await pool.query(`
            SELECT * FROM cities WHERE is_active = true ORDER BY event_count DESC
        `);
        
        if (citiesResult.rows.length > 0) {
            res.json({ data: citiesResult.rows });
        } else {
            // Fallback: aggregate from events table
            const fallbackResult = await pool.query(`
                SELECT 
                    venue_city as name,
                    venue_country as country,
                    COUNT(*) as event_count,
                    COUNT(DISTINCT venue_name) as venue_count,
                    CASE venue_city
                        WHEN 'Berlin' THEN 52.52
                        WHEN 'Hamburg' THEN 53.5511
                        WHEN 'London' THEN 51.5074
                        WHEN 'Paris' THEN 48.8566
                        WHEN 'Amsterdam' THEN 52.3676
                        WHEN 'Barcelona' THEN 41.3851
                        ELSE NULL
                    END as latitude,
                    CASE venue_city
                        WHEN 'Berlin' THEN 13.405
                        WHEN 'Hamburg' THEN 9.9937
                        WHEN 'London' THEN -0.1278
                        WHEN 'Paris' THEN 2.3522
                        WHEN 'Amsterdam' THEN 4.9041
                        WHEN 'Barcelona' THEN 2.1734
                        ELSE NULL
                    END as longitude
                FROM events 
                WHERE venue_city IS NOT NULL AND venue_city != ''
                GROUP BY venue_city, venue_country
                ORDER BY event_count DESC
            `);
            res.json({ data: fallbackResult.rows });
        }
    } catch (error) {
        // If cities table doesn't exist, use fallback
        try {
            const fallbackResult = await pool.query(`
                SELECT 
                    venue_city as name,
                    venue_country as country,
                    COUNT(*) as event_count,
                    COUNT(DISTINCT venue_name) as venue_count,
                    CASE venue_city
                        WHEN 'Berlin' THEN 52.52
                        WHEN 'Hamburg' THEN 53.5511
                        WHEN 'London' THEN 51.5074
                        WHEN 'Paris' THEN 48.8566
                        WHEN 'Amsterdam' THEN 52.3676
                        WHEN 'Barcelona' THEN 41.3851
                        ELSE NULL
                    END as latitude,
                    CASE venue_city
                        WHEN 'Berlin' THEN 13.405
                        WHEN 'Hamburg' THEN 9.9937
                        WHEN 'London' THEN -0.1278
                        WHEN 'Paris' THEN 2.3522
                        WHEN 'Amsterdam' THEN 4.9041
                        WHEN 'Barcelona' THEN 2.1734
                        ELSE NULL
                    END as longitude
                FROM events 
                WHERE venue_city IS NOT NULL AND venue_city != ''
                GROUP BY venue_city, venue_country
                ORDER BY event_count DESC
            `);
            res.json({ data: fallbackResult.rows });
        } catch (fallbackError) {
            console.error('Database error:', fallbackError);
            res.status(500).json({ error: fallbackError.message });
        }
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
                        title = EXCLUDED.title,
                        date = EXCLUDED.date,
                        start_time = EXCLUDED.start_time,
                        end_time = EXCLUDED.end_time,
                        content_url = EXCLUDED.content_url,
                        flyer_front = EXCLUDED.flyer_front,
                        description = EXCLUDED.description,
                        venue_id = EXCLUDED.venue_id,
                        venue_name = EXCLUDED.venue_name,
                        venue_address = EXCLUDED.venue_address,
                        venue_city = EXCLUDED.venue_city,
                        venue_country = EXCLUDED.venue_country,
                        artists = EXCLUDED.artists,
                        listing_date = EXCLUDED.listing_date,
                        latitude = COALESCE(EXCLUDED.latitude, events.latitude),
                        longitude = COALESCE(EXCLUDED.longitude, events.longitude),
                        updated_at = CURRENT_TIMESTAMP
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

// Get venue from database
app.get('/db/venues/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM venues WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Venue not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get artist from database
app.get('/db/artists/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM artists WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Artist not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List all venues from database
app.get('/db/venues', async (req, res) => {
    try {
        const { city, limit = 100 } = req.query;
        let query = 'SELECT * FROM venues';
        const params = [];
        
        if (city) {
            query += ' WHERE LOWER(city) = LOWER($1)';
            params.push(city);
        }
        
        query += ' ORDER BY name LIMIT $' + (params.length + 1);
        params.push(parseInt(limit));
        
        const result = await pool.query(query, params);
        res.json({ data: result.rows, total: result.rows.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List all artists from database
app.get('/db/artists', async (req, res) => {
    try {
        const { limit = 100 } = req.query;
        const result = await pool.query('SELECT * FROM artists ORDER BY name LIMIT $1', [parseInt(limit)]);
        res.json({ data: result.rows, total: result.rows.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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
app.get('/db/artists', async (req, res) => {
    try {
        const { search, limit = 50, offset = 0, sort = 'name', order = 'asc' } = req.query;
        
        let query = 'SELECT * FROM artists WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        
        if (search) {
            query += ` AND (name ILIKE $${paramIndex} OR country ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        // Get total count
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
        const countResult = await pool.query(countQuery, params);
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
    } catch (error) {
        console.error('Error fetching artists:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single artist
app.get('/db/artists/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM artists WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Artist not found' });
        }
        
        // Get events featuring this artist
        const eventsResult = await pool.query(`
            SELECT id, title, date, venue_name, venue_city 
            FROM events 
            WHERE artists ILIKE $1
            ORDER BY date DESC
            LIMIT 20
        `, [`%${result.rows[0].name}%`]);
        
        res.json({
            ...result.rows[0],
            events: eventsResult.rows
        });
    } catch (error) {
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
// CITIES CRUD API
// ============================================

// List cities with stats
app.get('/db/cities', async (req, res) => {
    try {
        // First try to get from cities table
        const citiesResult = await pool.query(`
            SELECT * FROM cities WHERE is_active = true ORDER BY event_count DESC
        `);
        
        if (citiesResult.rows.length > 0) {
            res.json({ data: citiesResult.rows });
        } else {
            // Fallback: aggregate from events table
            const fallbackResult = await pool.query(`
                SELECT 
                    venue_city as name,
                    venue_country as country,
                    COUNT(*) as event_count,
                    COUNT(DISTINCT venue_name) as venue_count,
                    CASE venue_city
                        WHEN 'Berlin' THEN 52.52
                        WHEN 'Hamburg' THEN 53.5511
                        WHEN 'London' THEN 51.5074
                        WHEN 'Paris' THEN 48.8566
                        WHEN 'Amsterdam' THEN 52.3676
                        WHEN 'Barcelona' THEN 41.3851
                        ELSE NULL
                    END as latitude,
                    CASE venue_city
                        WHEN 'Berlin' THEN 13.405
                        WHEN 'Hamburg' THEN 9.9937
                        WHEN 'London' THEN -0.1278
                        WHEN 'Paris' THEN 2.3522
                        WHEN 'Amsterdam' THEN 4.9041
                        WHEN 'Barcelona' THEN 2.1734
                        ELSE NULL
                    END as longitude
                FROM events 
                WHERE venue_city IS NOT NULL AND venue_city != ''
                GROUP BY venue_city, venue_country
                ORDER BY event_count DESC
            `);
            res.json({ data: fallbackResult.rows });
        }
    } catch (error) {
        // If cities table doesn't exist, use fallback
        try {
            const fallbackResult = await pool.query(`
                SELECT 
                    venue_city as name,
                    venue_country as country,
                    COUNT(*) as event_count,
                    COUNT(DISTINCT venue_name) as venue_count
                FROM events 
                WHERE venue_city IS NOT NULL AND venue_city != ''
                GROUP BY venue_city, venue_country
                ORDER BY event_count DESC
            `);
            res.json({ data: fallbackResult.rows });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
});

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
app.get('/db/venues', async (req, res) => {
    try {
        const { search, city, limit = 50, offset = 0, sort = 'name', order = 'asc' } = req.query;
        
        let query = 'SELECT * FROM venues WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        
        if (search) {
            query += ` AND (name ILIKE $${paramIndex} OR address ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        if (city) {
            query += ` AND city ILIKE $${paramIndex}`;
            params.push(`%${city}%`);
            paramIndex++;
        }
        
        // Get total count
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);
        
        // Add sorting and pagination
        const validSorts = ['name', 'city', 'country', 'created_at', 'updated_at'];
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
    } catch (error) {
        console.error('Error fetching venues:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single venue with events
app.get('/db/venues/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM venues WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Venue not found' });
        }
        
        // Get events at this venue
        const eventsResult = await pool.query(`
            SELECT id, title, date, artists 
            FROM events 
            WHERE venue_id = $1 OR venue_name = $2
            ORDER BY date DESC
            LIMIT 50
        `, [req.params.id, result.rows[0].name]);
        
        res.json({
            ...result.rows[0],
            events: eventsResult.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create venue (goes through unified flow)
app.post('/db/venues', async (req, res) => {
    try {
        const { name, address, city, country, blurb, content_url, latitude, longitude, capacity } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
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
                SELECT sv.id as scraped_id, sv.source_venue_id 
                FROM venue_source_links vsl
                JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
                WHERE vsl.unified_venue_id = $1 AND sv.source_code = 'original'
            `, [id]);
            
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
async function saveScrapedEvents(events) {
    let inserted = 0, updated = 0;
    const savedVenues = new Set();
    const savedArtists = new Set();
    
    for (const event of events) {
        try {
            // Save scraped event
            const eventResult = await pool.query(`
                INSERT INTO scraped_events (
                    source_code, source_event_id, title, date, start_time, end_time,
                    content_url, flyer_front, description, venue_name, venue_address,
                    venue_city, venue_country, venue_latitude, venue_longitude,
                    artists_json, price_info, raw_data
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
                    updated_at = CURRENT_TIMESTAMP
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
                event.venue_latitude,
                event.venue_longitude,
                JSON.stringify(event.artists_json),
                event.price_info ? JSON.stringify(event.price_info) : null,
                JSON.stringify(event.raw_data)
            ]);
            
            if (eventResult.rows[0].is_inserted) inserted++;
            else updated++;
            
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
    
    return { inserted, updated, venues: savedVenues.size, artists: savedArtists.size };
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

// Match scraped events to unified events or create new ones
async function matchAndLinkEvents(options = {}) {
    const { dryRun = false, minConfidence = 0.7 } = options;
    
    // Get unlinked scraped events
    const unlinkedResult = await pool.query(`
        SELECT se.* FROM scraped_events se
        WHERE NOT EXISTS (
            SELECT 1 FROM event_source_links esl WHERE esl.scraped_event_id = se.id
        )
        ORDER BY se.date, se.venue_city
        LIMIT 500
    `);
    
    const unlinked = unlinkedResult.rows;
    let matched = 0, created = 0;
    const results = [];
    
    for (const scraped of unlinked) {
        // Try to find matching unified event
        const potentialMatches = await pool.query(`
            SELECT ue.*, 
                   (SELECT array_agg(se.source_code) FROM event_source_links esl 
                    JOIN scraped_events se ON se.id = esl.scraped_event_id 
                    WHERE esl.unified_event_id = ue.id) as existing_sources
            FROM unified_events ue
            WHERE ue.date = $1
            AND (
                LOWER(ue.venue_city) = LOWER($2) 
                OR LOWER(ue.venue_name) ILIKE $3
            )
        `, [scraped.date, scraped.venue_city, `%${scraped.venue_name}%`]);
        
        let bestMatch = null;
        let bestScore = 0;
        
        for (const potential of potentialMatches.rows) {
            // Skip if already linked from same source
            if (potential.existing_sources?.includes(scraped.source_code)) continue;
            
            // Calculate match score
            const titleScore = stringSimilarity(scraped.title, potential.title);
            const venueScore = stringSimilarity(scraped.venue_name, potential.venue_name);
            
            // Weighted average
            const score = (titleScore * 0.6) + (venueScore * 0.4);
            
            if (score > bestScore && score >= minConfidence) {
                bestScore = score;
                bestMatch = potential;
            }
        }
        
        if (bestMatch) {
            // Link to existing unified event with priority
            const priority = getSourcePriority(scraped.source_code);
            if (!dryRun) {
                await pool.query(`
                    INSERT INTO event_source_links (unified_event_id, scraped_event_id, match_confidence, priority)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT DO NOTHING
                `, [bestMatch.id, scraped.id, bestScore, priority]);
            }
            matched++;
            results.push({
                action: 'matched',
                scraped: { id: scraped.id, title: scraped.title, source: scraped.source_code },
                unified: { id: bestMatch.id, title: bestMatch.title },
                confidence: bestScore
            });
            
            // Refresh the unified event with merged data
            if (!dryRun) {
                await refreshUnifiedEvent(bestMatch.id);
            }
        } else {
            // Create new unified event
            if (!dryRun) {
                const priority = getSourcePriority(scraped.source_code);
                const newEvent = await pool.query(`
                    INSERT INTO unified_events (
                        title, date, start_time, end_time, description, flyer_front,
                        ticket_url, price_info, venue_name, venue_address, venue_city, venue_country
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    RETURNING id
                `, [
                    scraped.title,
                    scraped.date,
                    scraped.start_time,
                    scraped.end_time,
                    scraped.description,
                    scraped.flyer_front,
                    scraped.content_url,
                    scraped.price_info,
                    scraped.venue_name,
                    scraped.venue_address,
                    scraped.venue_city,
                    scraped.venue_country
                ]);
                
                // Link to the new unified event with priority
                await pool.query(`
                    INSERT INTO event_source_links (unified_event_id, scraped_event_id, match_confidence, is_primary, priority)
                    VALUES ($1, $2, 1.0, true, $3)
                `, [newEvent.rows[0].id, scraped.id, priority]);
            }
            created++;
            results.push({
                action: 'created',
                scraped: { id: scraped.id, title: scraped.title, source: scraped.source_code }
            });
        }
    }
    
    return { processed: unlinked.length, matched, created, results: results.slice(0, 20) };
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
        const { dryRun = false, minConfidence = 0.7 } = req.body;
        
        const eventResult = await matchAndLinkEvents({ dryRun, minConfidence });
        const venueResult = await matchAndLinkVenues({ dryRun, minConfidence: 0.8 });
        
        res.json({
            success: true,
            dryRun,
            events: eventResult,
            venues: venueResult
        });
    } catch (error) {
        console.error('Match error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get scraped events
app.get('/scraped/events', async (req, res) => {
    try {
        const { source, city, linked, limit = 100, offset = 0 } = req.query;
        
        let query = 'SELECT se.*, EXISTS(SELECT 1 FROM event_source_links esl WHERE esl.scraped_event_id = se.id) as is_linked FROM scraped_events se WHERE 1=1';
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
            query += ` AND EXISTS(SELECT 1 FROM event_source_links esl WHERE esl.scraped_event_id = se.id)`;
        } else if (linked === 'false') {
            query += ` AND NOT EXISTS(SELECT 1 FROM event_source_links esl WHERE esl.scraped_event_id = se.id)`;
        }
        
        query += ` ORDER BY se.date ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await pool.query(query, params);
        
        // Build count query separately
        let countQuery = 'SELECT COUNT(*) FROM scraped_events se WHERE 1=1';
        if (source) countQuery += ` AND se.source_code = $1`;
        if (city) countQuery += ` AND LOWER(se.venue_city) = LOWER($${source ? 2 : 1})`;
        if (linked === 'true') countQuery += ` AND EXISTS(SELECT 1 FROM event_source_links esl WHERE esl.scraped_event_id = se.id)`;
        else if (linked === 'false') countQuery += ` AND NOT EXISTS(SELECT 1 FROM event_source_links esl WHERE esl.scraped_event_id = se.id)`;
        
        const countParams = params.slice(0, -2);
        const countResult = await pool.query(countQuery, countParams);
        
        res.json({
            data: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Scraped events error:', error);
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
                EXISTS(SELECT 1 FROM artist_source_links asl WHERE asl.scraped_artist_id = sa.id) as is_linked,
                (SELECT ua.name FROM artist_source_links asl JOIN unified_artists ua ON ua.id = asl.unified_artist_id WHERE asl.scraped_artist_id = sa.id LIMIT 1) as linked_artist_name
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
            query += ` AND EXISTS(SELECT 1 FROM artist_source_links asl WHERE asl.scraped_artist_id = sa.id)`;
        } else if (linked === 'false') {
            query += ` AND NOT EXISTS(SELECT 1 FROM artist_source_links asl WHERE asl.scraped_artist_id = sa.id)`;
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
        if (linked === 'true') countQuery += ` AND EXISTS(SELECT 1 FROM artist_source_links asl WHERE asl.scraped_artist_id = sa.id)`;
        else if (linked === 'false') countQuery += ` AND NOT EXISTS(SELECT 1 FROM artist_source_links asl WHERE asl.scraped_artist_id = sa.id)`;
        
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
                (SELECT COUNT(*) FROM scraped_events) as total_scraped_events,
                (SELECT COUNT(*) FROM scraped_events WHERE source_code = 'ra') as ra_events,
                (SELECT COUNT(*) FROM scraped_events WHERE source_code = 'ticketmaster') as ticketmaster_events,
                (SELECT COUNT(*) FROM scraped_venues) as total_scraped_venues,
                (SELECT COUNT(*) FROM scraped_artists) as total_scraped_artists,
                (SELECT COUNT(*) FROM unified_events) as total_unified_events,
                (SELECT COUNT(*) FROM unified_events WHERE is_published = true) as published_events,
                (SELECT COUNT(*) FROM unified_venues) as total_unified_venues,
                (SELECT COUNT(*) FROM unified_artists) as total_unified_artists,
                (SELECT COUNT(*) FROM event_source_links) as total_event_links,
                (SELECT COUNT(DISTINCT scraped_event_id) FROM event_source_links) as linked_scraped_events,
                (SELECT COUNT(*) FROM scraped_events WHERE NOT EXISTS(SELECT 1 FROM event_source_links esl WHERE esl.scraped_event_id = scraped_events.id)) as unlinked_scraped_events
        `);
        
        res.json(stats.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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
async function initDatabase() {
    try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        console.log('Database extensions initialized (pg_trgm)');
    } catch (error) {
        console.error('Failed to initialize database extensions:', error.message);
    }
}

app.listen(PORT, async () => {
    console.log(`Puppeteer service running on port ${PORT}`);
    console.log(`Proxy list loaded: ${PROXY_LIST.length} proxies`);
    
    // Initialize database extensions
    await initDatabase();
    
    try {
        console.log('Launching browser with first proxy...');
        currentProxy = getNextProxy();
        await initBrowser();
        console.log(`Browser launched with proxy: ${currentProxy}`);
    } catch (err) {
        console.error('Failed to launch browser on startup:', err);
    }
});
