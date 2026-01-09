const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/', authController.getUsers);
router.post('/', authController.createUser);
router.delete('/:id', authController.deleteUser);

module.exports = router;
