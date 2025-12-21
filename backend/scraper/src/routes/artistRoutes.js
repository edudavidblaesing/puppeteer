const express = require('express');
const router = express.Router();
const artistController = require('../controllers/artistController');

const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

router.post('/match', asyncHandler(artistController.matchArtists));
router.get('/search', asyncHandler(artistController.searchArtists)); // This might need to be distinct if logic differs from list
router.get('/missing', asyncHandler(artistController.getMissingArtists));

router.get('/:id', asyncHandler(artistController.getArtist));
router.post('/enrich', asyncHandler(artistController.enrichArtists));
router.post('/:id/enrich', asyncHandler(artistController.enrichArtist));
router.get('/', asyncHandler(artistController.listArtists));
router.post('/', asyncHandler(artistController.createArtist));
router.patch('/:id', asyncHandler(artistController.updateArtist));
router.delete('/:id', asyncHandler(artistController.deleteArtist));
router.delete('/', asyncHandler(artistController.deleteArtists));
router.post('/bulk-delete', asyncHandler(artistController.bulkDeleteArtists));

module.exports = router;
