const express = require('express');
const router = express.Router();
const scrapedController = require('../controllers/scrapedController');

const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

router.get('/events', asyncHandler(scrapedController.getScrapedEvents));

module.exports = router;
