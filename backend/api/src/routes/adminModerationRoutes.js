const express = require('express');
const router = express.Router();
const controller = require('../controllers/adminModerationController');
// Assume middleware for admin auth exists, e.g. verifyToken for now, ideally specific admin check
const { verifyToken } = require('../middleware/authMiddleware'); // Or similar

router.get('/reports', verifyToken, controller.getReports);
router.patch('/reports/:id', verifyToken, controller.resolveReport);
router.post('/reports/:id/action', verifyToken, controller.deleteReportedContent);

module.exports = router;
