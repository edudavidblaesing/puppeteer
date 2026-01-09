const express = require('express');
const router = express.Router();
const venueController = require('../controllers/venueController');

const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const { verifyToken } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { createVenueSchema, updateVenueSchema } = require('../schemas/venueSchema');

// Geocoding
router.post('/geocode', verifyToken, asyncHandler(venueController.geocodeVenues));
router.post('/geocode-all', verifyToken, asyncHandler(venueController.geocodeAllVenues));
router.get('/geocode/status', venueController.getGeocodingStatus); // Sync
router.post('/test-geocode', verifyToken, asyncHandler(venueController.testGeocode));
router.post('/:id/geocode', verifyToken, asyncHandler(venueController.geocodeVenue));

// Matching and Syncing
router.post('/match', verifyToken, asyncHandler(venueController.matchVenues));
router.post('/sync-from-events', verifyToken, asyncHandler(venueController.syncFromEvents));
router.post('/link-events', verifyToken, asyncHandler(venueController.linkEvents));

// Search and Missing
router.get('/search', asyncHandler(venueController.listVenues)); // /search often maps to list with query params
router.get('/missing', asyncHandler(venueController.getMissingVenues));

// CRUD
router.get('/:id/usage', verifyToken, asyncHandler(venueController.getVenueUsage));
router.get('/:id/history', verifyToken, asyncHandler(venueController.getVenueHistory));
router.get('/:id', asyncHandler(venueController.getVenue));
router.post('/enrich', verifyToken, asyncHandler(venueController.enrichVenue));
router.get('/', asyncHandler(venueController.listVenues));
router.post('/', verifyToken, validate(createVenueSchema), asyncHandler(venueController.createVenue));
router.patch('/:id', verifyToken, validate(updateVenueSchema), asyncHandler(venueController.updateVenue));
router.delete('/:id', verifyToken, asyncHandler(venueController.deleteVenue));
router.delete('/', verifyToken, asyncHandler(venueController.deleteVenues));
router.post('/bulk-delete', verifyToken, asyncHandler(venueController.bulkDeleteVenues));

module.exports = router;
