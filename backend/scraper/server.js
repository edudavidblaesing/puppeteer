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
        
        for (const listing of listings) {
            const e = listing.event;
            if (!e) continue;
            
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
                    listing.listingDate
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
            updated
        });
    } catch (error) {
        console.error('Sync error:', error);
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

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
    // Application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // process.exit(1); // Optional: restart the process
});

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
