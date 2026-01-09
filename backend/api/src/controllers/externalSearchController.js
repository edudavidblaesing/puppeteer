const { callScraper } = require('../utils/scraperProxy');

const search = async (req, res) => {
    try {
        const { type, q } = req.query;
        // Forward to scraper
        const result = await callScraper('/scrape/search', 'POST', { type, q });
        res.json(result);
    } catch (error) {
        console.error('External Search Controller Error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    search
};
