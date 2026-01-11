const { pool } = require('@social-events/shared').db;
const bcrypt = require('bcryptjs');

exports.createGuestUser = async (req, res) => {
    const { username, email, password, full_name, is_verified } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email and password are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users (username, email, password_hash, full_name, is_verified)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, username, email, full_name, is_verified, created_at`,
            [username, email, hashedPassword, full_name, is_verified || false]
        );

        res.status(201).json(result.rows[0]);
    } catch (e) {
        if (e.code === '23505') { // Unique violation
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        res.status(500).json({ error: e.message });
    }
};

exports.getGuestUsers = async (req, res) => {
    try {
        const { search, limit = 50, offset = 0, sort = 'created_at', order = 'DESC', status } = req.query;
        let query = `
            SELECT u.*,
            (SELECT COUNT(*) FROM friendships f WHERE (f.user_id_1 = u.id OR f.user_id_2 = u.id) AND f.status = 'accepted') as friend_count,
            (SELECT COUNT(*) FROM event_attendance ea WHERE ea.user_id = u.id) as event_count
            FROM users u
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (status) {
            if (status === 'blocked') {
                query += ` AND u.is_blocked = true`;
            } else if (status === 'verified') {
                query += ` AND u.is_verified = true AND u.is_blocked = false`;
            } else if (status === 'unverified') {
                query += ` AND u.is_verified = false AND u.is_blocked = false`;
            }
        }

        if (search) {
            query += ` AND (LOWER(u.username) LIKE $${paramIndex} OR LOWER(u.email) LIKE $${paramIndex} OR LOWER(u.full_name) LIKE $${paramIndex})`;
            params.push(`%${search.toLowerCase()}%`);
            paramIndex++;
        }

        // Sorting
        const allowedSorts = ['created_at', 'last_active_at', 'username', 'email'];
        const safeSort = allowedSorts.includes(sort) ? sort : 'created_at';
        const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        query += ` ORDER BY u.${safeSort} ${safeOrder} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM users u WHERE 1=1';
        let countParams = [];
        let countParamIndex = 1;

        if (status) {
            if (status === 'blocked') {
                countQuery += ` AND u.is_blocked = true`;
            } else if (status === 'verified') {
                countQuery += ` AND u.is_verified = true AND u.is_blocked = false`;
            } else if (status === 'unverified') {
                countQuery += ` AND u.is_verified = false AND u.is_blocked = false`;
            }
        }

        if (search) {
            countQuery += ` AND (LOWER(u.username) LIKE $${countParamIndex} OR LOWER(u.email) LIKE $${countParamIndex} OR LOWER(u.full_name) LIKE $${countParamIndex})`;
            countParams.push(`%${search.toLowerCase()}%`);
            countParamIndex++;
        }

        const countResult = await pool.query(countQuery, countParams);

        // Remove passwords
        const users = result.rows.map(user => {
            delete user.password_hash;
            return user;
        });

        res.json({
            data: users,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (e) {
        console.error('Error fetching guest users:', e);
        res.status(500).json({ error: e.message });
    }
};

exports.getGuestUser = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = result.rows[0];
        delete user.password_hash;

        // Fetch stats
        const friendCount = await pool.query('SELECT COUNT(*) FROM friendships WHERE (user_id_1 = $1 OR user_id_2 = $1) AND status = \'accepted\'', [id]);
        const eventCount = await pool.query('SELECT COUNT(*) FROM event_attendance WHERE user_id = $1', [id]);

        user.stats = {
            friends: parseInt(friendCount.rows[0].count),
            events: parseInt(eventCount.rows[0].count)
        };

        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.updateGuestUser = async (req, res) => {
    const { id } = req.params;
    const { is_verified, is_blocked, blocked_reason } = req.body;

    try {
        const result = await pool.query(
            `UPDATE users 
             SET 
                is_verified = COALESCE($1, is_verified), 
                is_blocked = COALESCE($2, is_blocked),
                blocked_reason = COALESCE($3, blocked_reason),
                updated_at = NOW() 
             WHERE id = $4 
             RETURNING *`,
            [is_verified, is_blocked, blocked_reason, id]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = result.rows[0];
        delete user.password_hash;

        // Force logout if blocked? 
        // We can't easily invalidate JWTs without a blacklist or versioning.
        // Assuming the auth middleware checks DB user status.
        // If we want to force logout immediately, we might need to update a 'token_version' or similar, 
        // but for now, the next time they hit an endpoint protected by 'protectGuest', it should check DB.

        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.deleteGuestUser = async (req, res) => {
    const { id } = req.params;
    try {
        // This might fail due to FK constraints (friends, chats, etc.)
        // Should probably just deactivate? Or cascade delete?
        // For now, let's try delete and catch error.
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Cannot delete user. Might have dependencies. ' + e.message });
    }
};

exports.getUserUsage = async (req, res) => {
    const { id } = req.params;
    try {
        const friendCount = await pool.query('SELECT COUNT(*) FROM friendships WHERE (user_id_1 = $1 OR user_id_2 = $1) AND status = \'accepted\'', [id]);
        const eventCount = await pool.query('SELECT COUNT(*) FROM event_attendance WHERE user_id = $1', [id]);

        res.json({
            usage: {
                friends: parseInt(friendCount.rows[0].count),
                events: parseInt(eventCount.rows[0].count)
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
