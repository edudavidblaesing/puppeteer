const eventService = require('./eventService');
const { pool } = require('../../db');

jest.mock('../../db', () => ({
    pool: {
        query: jest.fn(),
        connect: jest.fn()
    }
}));

describe('EventService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('findEvents', () => {
        it('should return empty array if no events found', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] });

            const result = await eventService.findEvents({});
            expect(result).toEqual([]);
            expect(pool.query).toHaveBeenCalledTimes(1);
        });

        it('should fetch and merge relations for found events', async () => {
            // Mock Main Query
            pool.query.mockResolvedValueOnce({
                rows: [
                    { id: 'ev1', title: 'Event 1' },
                    { id: 'ev2', title: 'Event 2' }
                ]
            });

            // Mock Parallel Relations Queries
            pool.query.mockResolvedValueOnce({
                rows: [
                    { event_id: 'ev1', id: 'a1', name: 'Artist 1', role: 'performer' }
                ]
            }); // Artist Query

            pool.query.mockResolvedValueOnce({
                rows: [
                    { event_id: 'ev2', id: 's1', source_code: 'ra', title: 'Source Title' }
                ]
            }); // Sources Query

            const result = await eventService.findEvents({});

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('ev1');
            expect(result[0].artists_list).toHaveLength(1);
            expect(result[0].artists_list[0].name).toBe('Artist 1');
            expect(result[0].source_references).toHaveLength(0); // No sources for ev1

            expect(result[1].id).toBe('ev2');
            expect(result[1].artists_list).toHaveLength(0); // No artists for ev2
            expect(result[1].source_references).toHaveLength(1);
            expect(result[1].source_references[0].source_code).toBe('ra');

            // Verify called 3 times (1 main + 2 parallel)
            expect(pool.query).toHaveBeenCalledTimes(3);
        });
    });
});
