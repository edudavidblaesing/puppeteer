const express = require('express');
const aiController = require('../controllers/aiController');

const router = express.Router();

router.post('/rewrite', aiController.rewriteContent);

module.exports = router;
