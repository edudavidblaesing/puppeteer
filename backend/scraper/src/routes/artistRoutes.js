const express = require('express');
const router = express.Router();
const artistController = require('../controllers/artistController');

const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const { verifyToken } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { createArtistSchema, updateArtistSchema } = require('../schemas/artistSchema');

router.post('/match', verifyToken, asyncHandler(artistController.matchArtists));
router.get('/search', asyncHandler(artistController.searchArtists)); // This might need to be distinct if logic differs from list
router.get('/missing', asyncHandler(artistController.getMissingArtists));

router.get('/:id/usage', verifyToken, asyncHandler(artistController.getArtistUsage));
router.get('/:id/history', verifyToken, asyncHandler(artistController.getArtistHistory));
router.get('/:id', asyncHandler(artistController.getArtist));
router.post('/enrich', verifyToken, asyncHandler(artistController.enrichArtists));
router.post('/:id/enrich', verifyToken, asyncHandler(artistController.enrichArtist));
router.get('/', asyncHandler(artistController.listArtists));
router.post('/', verifyToken, validate(createArtistSchema), asyncHandler(artistController.createArtist));
router.patch('/:id', verifyToken, validate(updateArtistSchema), asyncHandler(artistController.updateArtist));
router.delete('/:id', verifyToken, asyncHandler(artistController.deleteArtist));
router.delete('/', verifyToken, asyncHandler(artistController.deleteArtists));
router.post('/bulk-delete', verifyToken, asyncHandler(artistController.bulkDeleteArtists));

module.exports = router;
