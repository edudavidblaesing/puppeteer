const { pool, query } = require('./db');
const { initializeDatabase } = require('./db/init');
const AppError = require('./utils/AppError');
const catchAsync = require('./utils/catchAsync');

// Services
const eventService = require('./services/data/eventService');
const venueService = require('./services/data/venueService');
const artistService = require('./services/data/artistService');
const organizerService = require('./services/data/organizerService');
const emailService = require('./services/emailService');
const geocoder = require('./services/geocoder');
const eventStateMachine = require('./models/eventStateMachine');

module.exports = {
    db: { pool, query, initializeDatabase },
    AppError,
    catchAsync,
    services: {
        eventService,
        venueService,
        artistService,
        organizerService,
        emailService,
        geocoder
    },
    models: {
        eventStateMachine
    }
};
