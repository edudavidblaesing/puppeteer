const externalSearchService = require('../services/externalSearchService');

const search = async (req, res) => {
    try {
        const { type, q } = req.query;

        if (!q || q.length < 2) {
            return res.json({ data: [] });
        }

        let results = [];
        switch (type) {
            case 'venue':
                results = await externalSearchService.searchVenues(q);
                break;
            case 'artist':
                results = await externalSearchService.searchArtists(q);
                break;
            case 'organizer':
                results = await externalSearchService.searchOrganizers(q);
                break;
            case 'city':
                results = await externalSearchService.searchCities(q);
                break;
            default:
                return res.status(400).json({ error: 'Invalid type. Use venue, artist, organizer, or city.' });
        }

        res.json({ data: results });
    } catch (error) {
        console.error('External Search Controller Error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    search
};
