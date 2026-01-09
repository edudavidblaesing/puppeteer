const fetch = require('node-fetch');
const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:3008';

const callScraper = async (endpoint, method = 'POST', body = {}) => {
    const url = `${SCRAPER_URL}${endpoint}`;
    const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        let errorMsg = response.statusText;
        try {
            const errBody = await response.json();
            if (errBody.error || errBody.message) errorMsg = errBody.error || errBody.message;
        } catch (e) { /* ignore json parse error */ }
        throw new Error(`Scraper request failed: ${errorMsg}`);
    }
    return await response.json();
};

module.exports = { callScraper };
