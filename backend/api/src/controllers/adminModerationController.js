const { pool } = require('@social-events/shared').db;

const getReports = async (req, res) => {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;

    try {
        const result = await pool.query(`
            SELECT r.*, 
                   u.username as reporter_username,
                   u.avatar_url as reporter_avatar,
                   CASE 
                       WHEN r.content_type = 'comment' THEN (SELECT content FROM event_comments WHERE id = r.content_id::uuid)
                       WHEN r.content_type = 'event' THEN (SELECT title FROM events WHERE id = r.content_id)
                       ELSE NULL
                   END as content_preview
            FROM content_reports r
            LEFT JOIN users u ON r.reporter_id = u.id
            WHERE r.status = $1
            ORDER BY r.created_at DESC
            LIMIT $2 OFFSET $3
        `, [status, limit, offset]);

        res.json({ data: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const resolveReport = async (req, res) => {
    const { id } = req.params; // Report ID
    const { status, admin_notes } = req.body;
    // status can be 'resolved', 'dismissed'

    if (!['resolved', 'dismissed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const result = await pool.query(
            `UPDATE content_reports 
             SET status = $1, admin_notes = $2, updated_at = NOW() 
             WHERE id = $3 
             RETURNING *`,
            [status, admin_notes, id]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });

        res.json(result.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const deleteReportedContent = async (req, res) => {
    const { id } = req.params; // Report ID
    const { delete_content } = req.body; // boolean

    try {
        // 1. Get report to find content
        const reportRes = await pool.query('SELECT * FROM content_reports WHERE id = $1', [id]);
        if (reportRes.rows.length === 0) return res.status(404).json({ error: 'Report not found' });

        const report = reportRes.rows[0];

        if (delete_content) {
            if (report.content_type === 'comment') {
                await pool.query('DELETE FROM event_comments WHERE id = $1', [report.content_id]);
            } else if (report.content_type === 'event') {
                await pool.query('DELETE FROM events WHERE id = $1', [report.content_id]);
            }
            // Add other types as needed
        }

        // 2. Mark report resolved
        await pool.query("UPDATE content_reports SET status = 'resolved', admin_notes = 'Content deleted' WHERE id = $1", [id]);

        res.json({ success: true, message: 'Content deleted and report resolved' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

module.exports = {
    getReports,
    resolveReport,
    deleteReportedContent
};
