const express = require('express');
const router = express.Router();
const organizerController = require('../controllers/organizerController');

const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

router.get('/:id', asyncHandler(organizerController.getOrganizer));
router.get('/', asyncHandler(organizerController.listOrganizers));
router.post('/', asyncHandler(organizerController.createOrganizer));
router.patch('/:id', asyncHandler(organizerController.updateOrganizer));
router.delete('/:id', asyncHandler(organizerController.deleteOrganizer));
router.post('/match', asyncHandler(organizerController.matchOrganizers));

module.exports = router;
