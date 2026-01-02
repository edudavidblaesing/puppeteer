const artistService = require('../services/data/artistService');

// ============================================
// ARTIST OPERATIONS
// ============================================

const listArtists = async (req, res) => {
    try {
        const params = req.query;
        const [artists, total] = await Promise.all([
            artistService.findArtists(params),
            artistService.countArtists(params)
        ]);

        res.json({
            data: artists,
            total,
            limit: parseInt(params.limit || 100),
            offset: parseInt(params.offset || 0)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getArtist = async (req, res) => {
    try {
        const artist = await artistService.findById(req.params.id);
        if (!artist) return res.status(404).json({ error: 'Artist not found' });
        res.json(artist);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getMissingArtists = async (req, res) => {
    try {
        const missing = await artistService.findMissing();
        res.json({ data: missing, total: missing.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getArtistUsage = async (req, res) => {
    try {
        const usage = await artistService.getUsage(req.params.id);
        res.json({ usage });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createArtist = async (req, res) => {
    try {
        const artist = await artistService.create(req.body);
        res.json({ success: true, artist });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getArtistHistory = async (req, res) => {
    try {
        const history = await artistService.getHistory(req.params.id);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateArtist = async (req, res) => {
    try {
        const artist = await artistService.update(req.params.id, req.body, req.user);
        if (!artist) return res.status(404).json({ error: 'Artist not found' });
        res.json({ success: true, artist });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deleteArtist = async (req, res) => {
    try {
        const success = await artistService.delete(req.params.id, req.user);
        if (!success) return res.status(404).json({ error: 'Artist not found' });
        res.json({ success: true, deleted: req.params.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ... other methods ...

module.exports = {
    listArtists,
    getArtist,
    getMissingArtists,
    createArtist,
    updateArtist,
    deleteArtist,
    deleteArtists,
    bulkDeleteArtists,
    matchArtists,
    enrichArtist,
    enrichArtists,
    searchArtists,
    getArtistUsage,
    getArtistHistory
};

const deleteArtists = async (req, res) => {
    try {
        const count = await artistService.deleteAll();
        res.json({ success: true, deleted: count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const bulkDeleteArtists = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids must be a non-empty array' });
        }
        const count = await artistService.bulkDelete(ids);
        res.json({ success: true, deleted: count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const matchArtists = async (req, res) => {
    try {
        const { dryRun = false, minConfidence = 0.7 } = req.body;
        const result = await artistService.match({ dryRun, minConfidence });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const enrichArtists = async (req, res) => {
    try {
        await artistService.autoEnrich();
        res.json({ success: true, message: 'Enrichment started' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const enrichArtist = async (req, res) => {
    try {
        const result = await artistService.enrichOne(req.params.id);
        if (!result) return res.json({ success: false, message: 'No matches found on MusicBrainz' });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Enrichment failed:', error);
        res.status(500).json({ error: error.message });
    }
};

const searchArtists = async (req, res) => {
    try {
        const result = await artistService.searchByName(req.query.q);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    listArtists,
    getArtist,
    getMissingArtists,
    createArtist,
    updateArtist,
    deleteArtist,
    deleteArtists,
    bulkDeleteArtists,
    matchArtists,
    enrichArtist,
    enrichArtists,
    searchArtists,
    getArtistUsage
};
