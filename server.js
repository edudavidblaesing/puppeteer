const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const TelegramBot = require('node-telegram-bot-api');
const bodyParser = require('body-parser');

puppeteer.use(StealthPlugin());

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let bot = null;
if (TELEGRAM_TOKEN) {
    bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
}

let browser = null;
let page = null;

async function initBrowser() {
    if (browser) return;
    browser = await puppeteer.launch({
        headless: "new", // Set to false if you have a display/VNC
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--remote-debugging-port=9222',
            '--remote-debugging-address=0.0.0.0'
        ]
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Set default headers
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9'
    });
}

async function checkCaptcha(page) {
    const title = await page.title();
    const content = await page.content();

    if (title.includes('Just a moment') || content.includes('captcha-delivery')) {
        console.log('Captcha detected!');
        if (bot && TELEGRAM_CHAT_ID) {
            const screenshot = await page.screenshot();
            await bot.sendPhoto(TELEGRAM_CHAT_ID, screenshot, {
                caption: `Captcha detected on ${page.url()}! \n\nPlease solve it. \n\nCall POST /resume to continue after solving.`
            });
        }

        // Wait for manual resolution signal
        // We use a simple polling mechanism here. 
        // In a real scenario, you might want to wait for a specific event or file.
        await waitForResume();
    }
}

let resumeSignal = null;

function waitForResume() {
    console.log('Waiting for resume signal...');
    return new Promise(resolve => {
        resumeSignal = resolve;
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

app.post('/scrape-event', async (req, res) => {
    try {
        await initBrowser();
        const { contentUrl } = req.body;
        const url = `https://ra.co${contentUrl}`;

        await page.goto(url, { waitUntil: 'networkidle0' });
        await checkCaptcha(page);

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
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, async () => {
    console.log(`Puppeteer service running on port ${PORT}`);
    try {
        console.log('Launching browser...');
        await initBrowser();
        console.log('Browser launched and ready for debugging on port 9222');
    } catch (err) {
        console.error('Failed to launch browser on startup:', err);
    }
});
