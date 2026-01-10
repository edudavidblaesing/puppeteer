const express = require('express');
const router = express.Router();
const guestUserController = require('../controllers/guestUserController');
const cityController = require('../controllers/cityController');

// Guest User Routes

// Public Routes
router.get('/cities', cityController.getCitiesDropdown); // Expose cities list

// Auth
router.post('/auth/register', guestUserController.register);
router.post('/auth/verify', guestUserController.verifyEmail);
router.post('/auth/verify/resend', guestUserController.resendVerificationCode);
router.post('/auth/login', guestUserController.login);


// Public Routes (Map should be public?)
// The user.id is optional in `getEventsForMap`, so it handles both.
router.get('/events/map', (req, res, next) => {
    // Optional Auth Middleware for Map to get filtered friend data
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        guestUserController.verifyGuestToken(req, res, next);
    } else {
        next();
    }
}, guestUserController.getEventsForMap);

// Protected "My Events" MUST come before /events/:id to avoid shadowing
router.get('/events/my', guestUserController.verifyGuestToken, guestUserController.getMyEvents);

router.get('/events/:id', (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        guestUserController.verifyGuestToken(req, res, next);
    } else {
        next();
    }
}, guestUserController.getEventDetails);
// getEventDetails uses req.user.id for "my_rsvp_status". So it needs Auth or optional Auth.
// Let's assume for now strictly Social App = Login Required for interactions.
// But browsing? 
// For now, let's put middleware for everything ELSE.

// Protected Routes Middleware
router.use(guestUserController.verifyGuestToken);

// Protected Routes
router.get('/auth/me', guestUserController.getMe);
router.patch('/profile', guestUserController.updateProfile);
router.get('/search', guestUserController.searchUsers);

// Follows & Contacts
router.post('/contacts/sync', guestUserController.syncContacts);
router.post('/users/follow', guestUserController.followUser);
router.post('/users/unfollow', guestUserController.unfollowUser);
router.get('/me/following', guestUserController.getFollowing);
// Backward compatibility / Alias
router.get('/friends', guestUserController.getFriends);

// Events
router.get('/events/map', guestUserController.getEventsForMap);
router.post('/events/:eventId/rsvp', guestUserController.rsvpEvent);


router.post('/events/:id/rate', guestUserController.rateEvent);
router.post('/report', guestUserController.reportContent);

module.exports = router;
