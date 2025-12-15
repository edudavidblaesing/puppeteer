const express = require('express');
const router = express.Router();
const venueController = require('../controllers/venueController');

const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Geocoding
router.post('/geocode', asyncHandler(venueController.geocodeVenues));
router.post('/geocode-all', asyncHandler(venueController.geocodeAllVenues));
router.get('/geocode/status', venueController.getGeocodingStatus); // Sync
router.post('/test-geocode', asyncHandler(venueController.testGeocode));
router.post('/:id/geocode', asyncHandler(venueController.geocodeVenue));

// Matching and Syncing
router.post('/match', asyncHandler(venueController.matchVenues));
router.post('/sync-from-events', asyncHandler(venueController.syncFromEvents));
router.post('/link-events', asyncHandler(venueController.linkEvents));

// Search and Missing
router.get('/search', asyncHandler(venueController.listVenues)); // /search often maps to list with query params
router.get('/missing', asyncHandler(venueController.getMissingVenues));

// CRUD
router.get('/:id', asyncHandler(venueController.getVenue));
router.post('/enrich', asyncHandler(venueController.enrichVenue));
router.get('/', asyncHandler(venueController.listVenues));
router.post('/', asyncHandler(venueController.createVenue));
router.patch('/:id', asyncHandler(venueController.updateVenue));
router.delete('/:id', asyncHandler(venueController.deleteVenue));
router.delete('/', asyncHandler(venueController.deleteVenues));
router.post('/bulk-delete', asyncHandler(venueController.bulkDeleteVenues));

module.exports = router;
