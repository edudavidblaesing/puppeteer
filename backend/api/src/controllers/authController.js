const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('@social-events/shared').db;

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TheKey4u';
const MINE_PASSWORD = 'EventHub2025!'; // Strong password for 'mine' user

// Helper to hash password
const hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
};

// Seed/Ensure default users exist with correct passwords
const ensureDefaultUsers = async () => {
    try {
        // Update or Insert Admin (Superadmin)
        const adminHash = await hashPassword(ADMIN_PASSWORD);
        const adminCheck = await pool.query('SELECT * FROM admin_users WHERE username = $1', [ADMIN_USER]);

        if (adminCheck.rows.length === 0) {
            await pool.query(
                'INSERT INTO admin_users (username, password_hash, role) VALUES ($1, $2, $3)',
                [ADMIN_USER, adminHash, 'superadmin']
            );
            console.log('Created superadmin user');
        } else {
            // Optional: Reset admin password to env var if needed, or keep existing. 
            // For now, only update if it looks like a placeholder
            if (adminCheck.rows[0].password_hash.includes('placeholder')) {
                await pool.query('UPDATE admin_users SET password_hash = $1, role = $2 WHERE username = $3', [adminHash, 'superadmin', ADMIN_USER]);
                console.log('Updated superadmin password');
            }
        }

        // Update or Insert 'mine' (Admin)
        const mineHash = await hashPassword(MINE_PASSWORD);
        const mineCheck = await pool.query('SELECT * FROM admin_users WHERE username = $1', ['mine']);

        if (mineCheck.rows.length === 0) {
            await pool.query(
                'INSERT INTO admin_users (username, password_hash, role) VALUES ($1, $2, $3)',
                ['mine', mineHash, 'admin']
            );
            console.log('Created mine user');
        } else if (mineCheck.rows[0].password_hash.includes('placeholder')) {
            await pool.query('UPDATE admin_users SET password_hash = $1, role = $2 WHERE username = $3', [mineHash, 'admin', 'mine']);
            console.log('Updated mine user password');
        }

    } catch (error) {
        console.error('Failed to seed users:', error);
    }
};

const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        const result = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (user && await bcrypt.compare(password, user.password_hash)) {
            const token = jwt.sign(
                { id: user.id, username: user.username, role: user.role },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            return res.json({
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role
                }
            });
        }

        return res.status(401).json({ error: 'Invalid credentials' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
};

const checkAuth = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            // Optionally fetch fresh user data from DB
            const result = await pool.query('SELECT id, username, role FROM admin_users WHERE id = $1', [decoded.id]);
            const user = result.rows[0];

            if (!user) return res.status(401).json({ error: 'User not found' });

            return res.json({ user });
        } catch (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    } catch (error) {
        console.error('Auth check error:', error);
        res.status(500).json({ error: 'Auth check failed' });
    }
};

// User Management Actions
const getUsers = async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, role, created_at FROM admin_users ORDER BY id');
        res.json({ data: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const createUser = async (req, res) => {
    const { username, password, role } = req.body;
    try {
        const hash = await hashPassword(password);
        const result = await pool.query(
            'INSERT INTO admin_users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
            [username, hash, role || 'admin']
        );
        res.json(result.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM admin_users WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const logout = async (req, res) => {
    res.json({ success: true });
};

module.exports = {
    login,
    checkAuth,
    logout,
    ensureDefaultUsers,
    getUsers,
    createUser,
    deleteUser
};
