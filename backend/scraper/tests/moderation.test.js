const { getReports, resolveReport, deleteReportedContent } = require('../src/controllers/adminModerationController');
const { pool } = require('../src/db');

jest.mock('../src/db', () => ({
    pool: {
        query: jest.fn(),
    }
}));

describe('Admin Moderation Features', () => {
    let req, res;

    beforeEach(() => {
        req = {
            user: { id: 'admin-123', role: 'admin' },
            params: {},
            body: {},
            query: {}
        };
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
        };
        jest.clearAllMocks();
    });

    test('getReports returns filtered reports', async () => {
        req.query.status = 'pending';
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 'rep-1', reason: 'Spam', status: 'pending' }]
        });

        await getReports(req, res);

        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT r.*'), ['pending', 50, 0]);
        expect(res.json).toHaveBeenCalledWith({ data: expect.any(Array) });
    });

    test('resolveReport updates status', async () => {
        req.params.id = 'rep-1';
        req.body = { status: 'dismissed', admin_notes: 'Not spam' };

        pool.query.mockResolvedValueOnce({ rows: [{ id: 'rep-1', status: 'dismissed' }] });

        await resolveReport(req, res);

        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE content_reports'),
            ['dismissed', 'Not spam', 'rep-1']
        );
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'dismissed' }));
    });

    test('deleteReportedContent removes content and resolves report', async () => {
        req.params.id = 'rep-1';
        req.body = { delete_content: true };

        // 1. Fetch report
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 'rep-1', content_type: 'comment', content_id: 'com-1', status: 'pending' }]
        });

        // 2. Delete content (mock for delete query)
        pool.query.mockResolvedValueOnce({ rows: [] });

        // 3. Update report status
        pool.query.mockResolvedValueOnce({ rows: [] });

        await deleteReportedContent(req, res);

        expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('DELETE FROM event_comments'), ['com-1']);
        expect(pool.query).toHaveBeenNthCalledWith(3, expect.stringContaining("UPDATE content_reports SET status = 'resolved'"), ['rep-1']);

        expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Content deleted and report resolved' });
    });
});
