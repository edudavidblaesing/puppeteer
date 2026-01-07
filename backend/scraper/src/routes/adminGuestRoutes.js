const express = require('express');
const router = express.Router();
const controller = require('../controllers/adminGuestController');

router.post('/', controller.createGuestUser);
router.get('/', controller.getGuestUsers);
router.get('/:id', controller.getGuestUser);
router.patch('/:id', controller.updateGuestUser);
router.get('/:id/usage', controller.getUserUsage);
router.delete('/:id', controller.deleteGuestUser);

module.exports = router;
