const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');

router.get('/stats', statsController.getStats);
router.post('/reset', statsController.resetDb);

module.exports = router;
