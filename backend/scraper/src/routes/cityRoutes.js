const express = require('express');
const router = express.Router();
const cityController = require('../controllers/cityController');

router.get('/', cityController.getCities);
router.get('/dropdown', cityController.getCitiesDropdown);
router.get('/:id', cityController.getCity);
router.get('/:id/usage', cityController.getCityUsage);
router.get('/:id/history', cityController.getCityHistory);
router.post('/', cityController.createCity);
router.patch('/:id', cityController.updateCity);
router.delete('/:id', cityController.deleteCity);

module.exports = router;
