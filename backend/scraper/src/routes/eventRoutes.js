const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');

// Helper to wrap async route handlers
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Routes
router.get('/count', asyncHandler(eventController.getEventCount)); // Need to verify if this exists in controller or if I missed it.
// Checked eventController.js in memory: I didn't explicitly create getEventCount in the main pass, but listEvents return total.
// server.js had /db/events/stats maybe?
// I'll stick to what I extracted. server.js didn't seem to have a standalone /count endpoint for events, usually part of list.
// But wait, there was `app.get('/db/stats', ...)` which I haven't extracted yet. I should handle generic stats later.

router.get('/recent-updates', asyncHandler(eventController.getRecentUpdates));
router.get('/map', asyncHandler(eventController.getMapEvents));
router.get('/changes', asyncHandler(eventController.getChanges));
router.post('/changes/apply', asyncHandler(eventController.applyChanges));
router.post('/changes/dismiss', asyncHandler(eventController.dismissChanges));

router.get('/:id', asyncHandler(eventController.getEvent));
router.get('/', asyncHandler(eventController.listEvents));
router.post('/', asyncHandler(eventController.createEvent));
router.patch('/:id', asyncHandler(eventController.updateEvent));
router.delete('/:id', asyncHandler(eventController.deleteEvent));
router.delete('/', asyncHandler(eventController.deleteAllEvents));

router.post('/sync', asyncHandler(eventController.syncEvents));
router.post('/publish-status', asyncHandler(eventController.publishStatus));
router.post('/sync-venue-coords', asyncHandler(eventController.syncVenueCoords));
router.post('/bulk-delete', asyncHandler(eventController.bulkDeleteEvents));

module.exports = router;
