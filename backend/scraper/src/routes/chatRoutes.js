const express = require('express');
const router = express.Router();
const controller = require('../controllers/chatController');
const { verifyGuestToken } = require('../controllers/guestUserController');

router.use(verifyGuestToken);

router.get('/', controller.getMyChats);
router.post('/direct', controller.createDirectChat);

router.get('/:roomId/messages', controller.getMessages);
router.post('/:roomId/messages', controller.sendMessage);

router.post('/event/:eventId', controller.ensureEventRoom);

module.exports = router;
