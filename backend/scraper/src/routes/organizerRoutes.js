const express = require('express');
const router = express.Router();
const organizerController = require('../controllers/organizerController');

const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const { verifyToken } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { createOrganizerSchema, updateOrganizerSchema } = require('../schemas/organizerSchema');

router.get('/:id', asyncHandler(organizerController.getOrganizer));
router.get('/', asyncHandler(organizerController.listOrganizers));
router.post('/', verifyToken, validate(createOrganizerSchema), asyncHandler(organizerController.createOrganizer));
router.patch('/:id', verifyToken, validate(updateOrganizerSchema), asyncHandler(organizerController.updateOrganizer));
router.delete('/:id', verifyToken, asyncHandler(organizerController.deleteOrganizer));
router.post('/match', verifyToken, asyncHandler(organizerController.matchOrganizers));

module.exports = router;
