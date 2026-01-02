
try {
    const eventController = require('./backend/scraper/src/controllers/eventController');
    const eventService = require('./backend/scraper/src/services/data/eventService');
    const eventRoutes = require('./backend/scraper/src/routes/eventRoutes');

    console.log('Backend files loaded successfully.');

    if (typeof eventController.getEventUsage !== 'function') {
        throw new Error('eventController.getEventUsage is missing');
    }
    if (typeof eventService.getUsage !== 'function') {
        throw new Error('eventService.getUsage is missing');
    }

    console.log('Methods exist.');
} catch (e) {
    console.error('Syntax or Import Error:', e);
    process.exit(1);
}
