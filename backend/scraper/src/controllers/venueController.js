const venueService = require('../services/data/venueService');
const { geocodeAddress } = require('../services/geocoder');

// ============================================
// VENUE GEOCODING
// ============================================

const geocodeVenues = async (req, res) => {
    try {
        const { limit = 10, debug = false } = req.body;
        const result = await venueService.geocodeBatch(limit);

        const response = {
            success: true,
            processed: result.processed,
            geocoded: result.geocoded,
            failed: result.failed
        };
        if (debug) response.errors = result.errors;

        res.json(response);
    } catch (error) {
        console.error('Geocoding error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Geocode venues background task state
let geocodingInProgress = false;
let geocodingStats = { processed: 0, geocoded: 0, failed: 0, remaining: 0, failedVenues: [] };

const geocodeAllVenues = async (req, res) => {
    try {
        const { limit = 200, background = true } = req.body;

        if (geocodingInProgress) {
            return res.json({
                success: true,
                message: 'Geocoding already in progress',
                stats: geocodingStats
            });
        }

        const totalToGeocode = await venueService.countUngeocoded();

        if (totalToGeocode === 0) {
            return res.json({
                success: true,
                message: 'All venues already have coordinates',
                stats: { processed: 0, geocoded: 0, failed: 0, remaining: 0 }
            });
        }

        if (background) {
            geocodingInProgress = true;
            geocodingStats = { processed: 0, geocoded: 0, failed: 0, remaining: totalToGeocode, failedVenues: [] };

            // Start background geocoding
            (async () => {
                try {
                    // Process in batches of 10
                    let processedTotal = 0;

                    while (processedTotal < limit && geocodingInProgress) {
                        const batchLimit = Math.min(10, limit - processedTotal);
                        const result = await venueService.geocodeBatch(batchLimit);

                        if (result.processed === 0) break;

                        geocodingStats.geocoded += result.geocoded;
                        geocodingStats.failed += result.failed;
                        geocodingStats.processed += result.processed;
                        geocodingStats.remaining = totalToGeocode - geocodingStats.processed;

                        processedTotal += result.processed;

                        if (result.errors) geocodingStats.failedVenues.push(...result.errors);

                        await new Promise(resolve => setTimeout(resolve, 1500));
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
};

const getGeocodingStatus = (req, res) => {
    res.json({
        inProgress: geocodingInProgress,
        stats: geocodingStats
    });
};

const testGeocode = async (req, res) => {
    try {
        const { address, city, country } = req.body;
        const coords = await geocodeAddress(address, city, country);
        res.json({ success: true, input: { address, city, country }, coordinates: coords });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const geocodeVenue = async (req, res) => {
    try {
        const venue = await venueService.geocodeOne(req.params.id);
        if (!venue) return res.status(400).json({ error: 'Could not geocode address' });
        res.json({ success: true, venue });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// MATCHING AND SYNCING
// ============================================

const matchVenues = async (req, res) => {
    try {
        const { dryRun = false, minConfidence = 0.7 } = req.body;
        const result = await venueService.match({ dryRun, minConfidence });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Venue matching error:', error);
        res.status(500).json({ error: error.message });
    }
};

const syncFromEvents = async (req, res) => {
    try {
        const result = await venueService.syncFromEvents();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error syncing venues:', error);
        res.status(500).json({ error: error.message });
    }
};

const linkEvents = async (req, res) => {
    try {
        const linkedCount = await venueService.linkEvents();
        res.json({ success: true, linked: linkedCount, message: `Linked ${linkedCount} events to venues` });
    } catch (error) {
        console.error('Error linking events to venues:', error);
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// CRUD OPERATIONS
// ============================================

const listVenues = async (req, res) => {
    try {
        const params = req.query;
        const [venues, total] = await Promise.all([
            venueService.findVenues(params),
            venueService.countVenues(params)
        ]);

        res.json({
            data: venues,
            total,
            limit: parseInt(params.limit || 100),
            offset: parseInt(params.offset || 0),
            source: 'combined'
        });
    } catch (error) {
        console.error('Error fetching venues:', error);
        res.status(500).json({ error: error.message });
    }
};

const getVenue = async (req, res) => {
    try {
        const venue = await venueService.findById(req.params.id);
        if (!venue) return res.status(404).json({ error: 'Venue not found' });
        res.json(venue);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getMissingVenues = async (req, res) => {
    try {
        const venues = await venueService.findMissing();
        res.json({ data: venues, total: venues.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getVenueUsage = async (req, res) => {
    try {
        const usage = await venueService.getUsage(req.params.id);
        res.json({ usage });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createVenue = async (req, res) => {
    try {
        const venue = await venueService.create(req.body);
        res.json({ success: true, venue });
    } catch (error) {
        console.error('Error creating venue:', error);
        res.status(500).json({ error: error.message });
    }
};

const getVenueHistory = async (req, res) => {
    try {
        const history = await venueService.getHistory(req.params.id);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateVenue = async (req, res) => {
    try {
        const venue = await venueService.update(req.params.id, req.body, req.user);
        if (!venue) return res.status(404).json({ error: 'Venue not found' });
        res.json({ success: true, venue });
    } catch (error) {
        console.error('Error updating venue:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteVenue = async (req, res) => {
    try {
        const success = await venueService.delete(req.params.id, req.user);
        if (!success) return res.status(404).json({ error: 'Venue not found' });
        res.json({ success: true, deleted: req.params.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ...

module.exports = {
    listVenues,
    getVenue,
    getMissingVenues,
    createVenue,
    updateVenue,
    deleteVenue,
    deleteVenues,
    bulkDeleteVenues,
    geocodeVenues,
    geocodeAllVenues,
    getGeocodingStatus,
    testGeocode,
    geocodeVenue,
    matchVenues,
    syncFromEvents,
    linkEvents,
    enrichVenue,
    getVenueUsage,
    getVenueHistory
};

const deleteVenues = async (req, res) => {
    try {
        const count = await venueService.deleteAll();
        res.json({ success: true, deleted: count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const bulkDeleteVenues = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids must be a non-empty array' });
        }
        const count = await venueService.bulkDelete(ids);
        res.json({ success: true, deleted: count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const enrichVenue = async (req, res) => {
    res.json({ success: true, message: 'Enrichment not implemented' });
};

module.exports = {
    listVenues,
    getVenue,
    getMissingVenues,
    createVenue,
    updateVenue,
    deleteVenue,
    deleteVenues,
    bulkDeleteVenues,
    geocodeVenues,
    geocodeAllVenues,
    getGeocodingStatus,
    testGeocode,
    geocodeVenue,
    matchVenues,
    syncFromEvents,
    linkEvents,
    enrichVenue,
    getVenueUsage
};
