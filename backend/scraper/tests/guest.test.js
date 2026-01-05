const { getEventDetails, addComment, rateEvent } = require('../src/controllers/guestUserController');
const { pool } = require('../src/db');

jest.mock('../src/db', () => ({
    pool: {
        query: jest.fn(),
    }
}));

describe('Guest User Social Features', () => {
    let req, res;

    beforeEach(() => {
        req = {
            user: { id: 'user-123' },
            params: { id: 'event-123' },
            body: {},
            query: {}
        };
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
        };
        jest.clearAllMocks();
    });

    test('getEventDetails returns event with social stats', async () => {
        // Mock query results
        // 1. Main event details query with CTEs
        pool.query.mockResolvedValueOnce({
            rows: [{
                id: 'event-123',
                title: 'Test Event',
                total_attendees: 5,
                my_rsvp_status: 'going',
                friends_attending: [],
                average_rating: 4.5
            }]
        });

        // 2. Artists query
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'artist-1', name: 'DJ Test' }] });

        // 3. Organizers query
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'org-1', name: 'Test Org' }] });

        await getEventDetails(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            id: 'event-123',
            my_rsvp_status: 'going',
            average_rating: 4.5,
            artists_list: expect.any(Array),
            organizers_list: expect.any(Array)
        }));
    });

    test('getEventDetails returns 404 if event not found', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        await getEventDetails(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Event not found' });
    });

    test('addComment creates comment and enriches user', async () => {
        req.body.content = 'Great event!';

        // 1. Insert comment
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, content: 'Great event!', created_at: new Date() }] });

        // 2. Fetch user details
        pool.query.mockResolvedValueOnce({ rows: [{ username: 'testuser', avatar_url: 'http://avatar.url' }] });

        await addComment(req, res);

        expect(pool.query).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO event_comments'), expect.arrayContaining(['event-123', 'user-123', 'Great event!']));

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            content: 'Great event!',
            user: expect.objectContaining({ username: 'testuser' })
        }));
    });

    test('addComment returns 400 if content missing', async () => {
        req.body.content = '';
        await addComment(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rateEvent inserts or updates rating', async () => {
        req.body.rating = 5;
        pool.query.mockResolvedValueOnce({ rows: [] }); // Update doesn't strictly need return unless RETURNING *

        await rateEvent(req, res);

        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO event_ratings'),
            ['event-123', 'user-123', 5]
        );
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('rateEvent returns 400 for invalid rating', async () => {
        req.body.rating = 6;
        await rateEvent(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});
