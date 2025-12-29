const organizerService = require('../services/data/organizerService');

// ============================================
// ORGANIZER OPERATIONS
// ============================================

const listOrganizers = async (req, res) => {
    try {
        const params = req.query;
        const [organizers, total] = await Promise.all([
            organizerService.findOrganizers(params),
            organizerService.countOrganizers(params)
        ]);

        res.json({
            data: organizers,
            total,
            limit: parseInt(params.limit || 100),
            offset: parseInt(params.offset || 0)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getOrganizer = async (req, res) => {
    try {
        const organizer = await organizerService.findById(req.params.id);
        if (!organizer) return res.status(404).json({ error: 'Organizer not found' });
        res.json(organizer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createOrganizer = async (req, res) => {
    try {
        const organizer = await organizerService.create(req.body);
        res.json({ success: true, organizer });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateOrganizer = async (req, res) => {
    try {
        const organizer = await organizerService.update(req.params.id, req.body);
        if (!organizer) return res.status(404).json({ error: 'Organizer not found' });
        res.json({ success: true, organizer });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deleteOrganizer = async (req, res) => {
    try {
        const success = await organizerService.delete(req.params.id);
        if (!success) return res.status(404).json({ error: 'Organizer not found' });
        res.json({ success: true, deleted: req.params.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const matchOrganizers = async (req, res) => {
    try {
        const { dryRun = false, minConfidence = 0.7 } = req.body;
        const result = await organizerService.match({ dryRun, minConfidence });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    listOrganizers,
    getOrganizer,
    createOrganizer,
    updateOrganizer,
    deleteOrganizer,
    matchOrganizers
};
