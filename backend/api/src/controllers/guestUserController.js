const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('@social-events/shared').db;
const { sendVerificationEmail } = require('@social-events/shared').services.emailService;

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Helper to hash password
const hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
};

// Generate 6-digit code
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// Register
const register = async (req, res) => {
    const { email, password, username, full_name, phone_number } = req.body;

    if (!phone_number) return res.status(400).json({ error: 'Phone number is required' });

    try {
        // Check if user exists (by email, username OR phone)
        const userCheck = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR username = $2 OR phone_number = $3',
            [email, username, phone_number]
        );

        if (userCheck.rows.length > 0) {
            const existingUser = userCheck.rows[0];

            if (existingUser.is_verified) {
                return res.status(409).json({ error: 'User already exists' });
            }

            // Resend logic (update phone if provided)
            const hashedPassword = await hashPassword(password);
            const code = generateCode();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

            await sendVerificationEmail(email, code);

            await pool.query(
                `UPDATE users 
                 SET password_hash = $1, full_name = $2, verification_code = $3, 
                     verification_expires_at = $4, username = $5, phone_number = $6
                 WHERE id = $7`,
                [hashedPassword, full_name, code, expiresAt, username, phone_number, existingUser.id]
            );

            return res.status(200).json({ success: true, message: 'Verification resend', email });
        }

        const hashedPassword = await hashPassword(password);
        const code = generateCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await sendVerificationEmail(email, code);

        await pool.query(
            `INSERT INTO users (email, password_hash, username, full_name, phone_number, is_verified, verification_code, verification_expires_at) 
             VALUES ($1, $2, $3, $4, $5, false, $6, $7) 
             RETURNING id`,
            [email, hashedPassword, username, full_name, phone_number, code, expiresAt]
        );

        res.status(201).json({ success: true, message: 'Verification code sent', email });

    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ error: e.message });
    }
};

// Verify Email
const verifyEmail = async (req, res) => {
    const { email, code } = req.body;

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (user.is_verified) {
            return res.status(400).json({ error: 'User already verified' });
        }

        if (user.verification_code !== code) {
            return res.status(400).json({ error: 'Invalid code' });
        }

        if (new Date() > new Date(user.verification_expires_at)) {
            return res.status(400).json({ error: 'Code expired' });
        }

        // Verify user
        await pool.query(
            'UPDATE users SET is_verified = true, verification_code = NULL, verification_expires_at = NULL WHERE id = $1',
            [user.id]
        );

        // Generate Token
        const token = jwt.sign({ id: user.id, role: 'guest' }, JWT_SECRET, { expiresIn: '7d' });
        delete user.password_hash;
        delete user.verification_code;

        res.json({ token, user });

    } catch (e) {
        console.error('Verify error:', e);
        res.status(500).json({ error: e.message });
    }
};

// Login
const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (user && await bcrypt.compare(password, user.password_hash)) {
            const token = jwt.sign({ id: user.id, role: 'guest' }, JWT_SECRET, { expiresIn: '7d' });

            // Update last active
            await pool.query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [user.id]);

            // Remove password from response
            delete user.password_hash;

            res.json({ token, user });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ error: e.message });
    }
};

// Get Profile (Me)
const getMe = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.*,
                   (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
                   (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count
            FROM users u WHERE u.id = $1
        `, [req.user.id]);
        const user = result.rows[0];

        if (!user) return res.status(404).json({ error: 'User not found' });

        delete user.password_hash;
        res.json({ user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ...



const updateProfile = async (req, res) => {
    const { full_name, bio, avatar_url, location_lat, location_lng, fcm_token } = req.body;
    const userId = req.user.id;

    const fields = [];
    const values = [];
    let idx = 1;

    if (full_name !== undefined) { fields.push(`full_name = $${idx++}`); values.push(full_name); }
    if (bio !== undefined) { fields.push(`bio = $${idx++}`); values.push(bio); }
    if (avatar_url !== undefined) { fields.push(`avatar_url = $${idx++}`); values.push(avatar_url); }
    if (location_lat !== undefined) { fields.push(`location_lat = $${idx++}`); values.push(location_lat); }
    if (location_lng !== undefined) { fields.push(`location_lng = $${idx++}`); values.push(location_lng); }
    if (fcm_token !== undefined) { fields.push(`fcm_token = $${idx++}`); values.push(fcm_token); }
    if (req.body.interests !== undefined) { fields.push(`interests = $${idx++}`); values.push(req.body.interests); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(userId);

    try {
        const result = await pool.query(
            `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
            values
        );
        const user = result.rows[0];
        delete user.password_hash;
        res.json({ user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Search Users
const searchUsers = async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ data: [] });

    try {
        const result = await pool.query(
            `SELECT id, username, full_name, avatar_url 
             FROM users 
             WHERE username ILIKE $1 OR full_name ILIKE $1 
             LIMIT 20`,
            [`%${q}%`]
        );
        res.json({ data: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Middleware to verify Guest Token
const verifyGuestToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'guest') {
            return res.status(403).json({ error: 'Access denied' });
        }
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Friendships
// Friendships & Follows
const syncContacts = async (req, res) => {
    const userId = req.user.id;
    const { contacts } = req.body; // Array of phone numbers

    if (!contacts || !Array.isArray(contacts)) return res.status(400).json({ error: 'Contacts array required' });

    try {
        // Find users matching phone numbers
        const result = await pool.query(
            `SELECT id, username, full_name, avatar_url, phone_number 
             FROM users 
             WHERE phone_number = ANY($1) AND id != $2`,
            [contacts, userId]
        );

        const foundUsers = result.rows;

        // Check which ones we already follow
        const followsCheck = await pool.query(
            'SELECT following_id FROM follows WHERE follower_id = $1',
            [userId]
        );
        const followingIds = new Set(followsCheck.rows.map(r => r.following_id));

        const usersWithStatus = foundUsers.map(u => ({
            ...u,
            is_following: followingIds.has(u.id)
        }));

        res.json({ data: usersWithStatus });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const followUser = async (req, res) => {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    if (userId === targetUserId) return res.status(400).json({ error: 'Cannot follow yourself' });

    try {
        await pool.query(
            'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, targetUserId]
        );
        res.json({ success: true, message: 'Followed' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const unfollowUser = async (req, res) => {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    try {
        await pool.query(
            'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
            [userId, targetUserId]
        );
        res.json({ success: true, message: 'Unfollowed' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const getFollowing = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await pool.query(
            `SELECT u.id, u.username, u.full_name, u.avatar_url 
             FROM follows f
             JOIN users u ON f.following_id = u.id
             WHERE f.follower_id = $1`,
            [userId]
        );
        res.json({ data: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Event Attendance (RSVP)
const rsvpEvent = async (req, res) => {
    const userId = req.user.id;
    const { eventIds, status } = req.body; // Can accept single ID or array? Let's assume params has eventId for REST

    // Wait, let's use route param for eventId: POST /events/:id/rsvp
    // But helper function signature is (req, res)
    const eventId = req.params.eventId;
    const { status: rsvpStatus } = req.body; // 'going', 'interested', 'not_going'

    if (!['going', 'interested', 'not_going'].includes(rsvpStatus)) return res.status(400).json({ error: 'Invalid status' });

    try {
        if (rsvpStatus === 'not_going') {
            await pool.query('DELETE FROM event_attendance WHERE user_id = $1 AND event_id = $2', [userId, eventId]);
        } else {
            await pool.query(
                `INSERT INTO event_attendance (user_id, event_id, status) 
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, event_id) DO UPDATE SET status = $3, updated_at = NOW()`,
                [userId, eventId, rsvpStatus]
            );
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const getMyEvents = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await pool.query(
            `SELECT ea.event_id, ea.status, e.title, e.date, e.venue_name, e.flyer_front 
             FROM event_attendance ea
             JOIN events e ON ea.event_id = e.id
             WHERE ea.user_id = $1
             ORDER BY e.date ASC`,
            [userId]
        );
        res.json({ data: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Map Events
const getEventsForMap = async (req, res) => {
    const userId = req.user ? req.user.id : null;
    const { lat, lng, radius = 50, limit = 500 } = req.query;

    try {
        let query = `
            WITH friend_attendance AS (
                SELECT ea.event_id, 
                       json_agg(json_build_object(
                           'id', u.id, 
                           'username', u.username, 
                           'full_name', u.full_name, 
                           'avatar_url', u.avatar_url
                       )) as friends
                FROM event_attendance ea
                JOIN follows f ON (f.following_id = ea.user_id AND f.follower_id = $1)
                JOIN users u ON ea.user_id = u.id
                WHERE ea.status = 'going'
                GROUP BY ea.event_id
            )
            SELECT e.id, e.title, e.date, e.venue_name, 
                   e.latitude, e.longitude, e.flyer_front, e.publish_status,
                   COALESCE(fa.friends, '[]'::json) as friends_attending
            `;

        const params = [userId];

        // Add distance calculation if coordinates provided
        if (lat && lng) {
            query += `,
                   (
                       6371 * acos(
                           LEAST(1.0, GREATEST(-1.0, 
                               cos(radians($2)) * cos(radians(e.latitude)) * cos(radians(e.longitude) - radians($3)) +
                               sin(radians($2)) * sin(radians(e.latitude))
                           ))
                       )
                   ) as distance
            `;
            params.push(parseFloat(lat), parseFloat(lng));
        } else {
            query += `, 0 as distance `;
        }

        // Time Filter (today, tomorrow, this_week)
        const { time_filter } = req.query;
        let dateClause = "AND e.date > (NOW() - INTERVAL '24 hours')"; // Default: Recent + Upcoming

        if (time_filter === 'today') {
            dateClause = "AND e.date >= CURRENT_DATE AND e.date < CURRENT_DATE + INTERVAL '1 day'";
        } else if (time_filter === 'tomorrow') {
            dateClause = "AND e.date >= CURRENT_DATE + INTERVAL '1 day' AND e.date < CURRENT_DATE + INTERVAL '2 days'";
        } else if (time_filter === 'this_week') {
            dateClause = "AND e.date >= CURRENT_DATE AND e.date < CURRENT_DATE + INTERVAL '7 days'";
        }

        query += `
            FROM events e
            LEFT JOIN friend_attendance fa ON e.id = fa.event_id
            WHERE 
              e.status = 'PUBLISHED' 
              AND e.latitude IS NOT NULL 
              AND e.longitude IS NOT NULL
              ${dateClause}
        `;

        if (lat && lng) {
            params.push(parseFloat(radius)); // $4
            query += ` AND (
                6371 * acos(
                    LEAST(1.0, GREATEST(-1.0, 
                        cos(radians($2)) * cos(radians(e.latitude)) * cos(radians(e.longitude) - radians($3)) +
                        sin(radians($2)) * sin(radians(e.latitude))
                    ))
                )
            ) < $4 `;
        }

        query += `
            ORDER BY e.date ASC
            LIMIT $${params.length + 1}
        `;

        params.push(parseInt(limit));

        // DEBUG: Diagnose why map is empty
        const debugTotal = await pool.query('SELECT COUNT(*) FROM events');
        const debugPublished = await pool.query("SELECT COUNT(*) FROM events WHERE publish_status = 'published'");
        const debugCoords = await pool.query('SELECT COUNT(*) FROM events WHERE latitude IS NOT NULL AND longitude IS NOT NULL');
        const debugFuture = await pool.query('SELECT COUNT(*) FROM events WHERE date >= CURRENT_DATE');
        const debugFutureCoords = await pool.query('SELECT COUNT(*) FROM events WHERE date >= CURRENT_DATE AND latitude IS NOT NULL');

        console.log(`[Map Debug] Total: ${debugTotal.rows[0].count}`);
        console.log(`[Map Debug] Published: ${debugPublished.rows[0].count}`);
        console.log(`[Map Debug] With Coords: ${debugCoords.rows[0].count}`);
        console.log(`[Map Debug] Future (Today+): ${debugFuture.rows[0].count}`);
        console.log(`[Map Debug] Future (Today+) & With Coords: ${debugFutureCoords.rows[0].count}`);

        const result = await pool.query(query, params);
        console.log(`[Map] Returning ${result.rows.length} events. Filter: STATUS='PUBLISHED' + 24h Window`);

        res.json({ data: result.rows });
    } catch (e) {
        console.error('Map events error:', e);
        res.status(500).json({ error: e.message });
    }
};

// Event Details
const getEventDetails = async (req, res) => {
    const userId = req.user ? req.user.id : null;
    const { id } = req.params;

    try {
        let params = [id];
        let userParamIdx = 0;

        let query = `
            WITH ratings_stats AS(
                SELECT AVG(rating):: numeric(2, 1) as avg_rating, COUNT(*) as rating_count FROM event_ratings WHERE event_id = $1
            ),
            all_attendees_count AS(
                SELECT COUNT(*) as count FROM event_attendance WHERE event_id = $1 AND status = 'going'
            ),
            all_interested_count AS(
                SELECT COUNT(*) as count FROM event_attendance WHERE event_id = $1 AND status = 'interested'
            )
        `;

        if (userId) {
            params.push(userId);
            userParamIdx = 2;

            query += `,
                my_attendance AS(
                    SELECT status FROM event_attendance WHERE user_id = $2 AND event_id = $1
                ),
                friend_attendance AS(
                    SELECT ea.event_id,
                           json_agg(json_build_object(
                               'id', u.id, 
                               'username', u.username, 
                               'full_name', u.full_name, 
                               'avatar_url', u.avatar_url
                           )) as friends
                    FROM event_attendance ea
                    JOIN follows f ON (f.following_id = ea.user_id AND f.follower_id = $2)
                    JOIN users u ON ea.user_id = u.id
                    WHERE ea.status = 'going' AND ea.event_id = $1
                    GROUP BY ea.event_id
                ),
                friend_interested AS(
                    SELECT ea.event_id,
                           json_agg(json_build_object(
                               'id', u.id, 
                               'username', u.username, 
                               'full_name', u.full_name, 
                               'avatar_url', u.avatar_url
                           )) as friends
                    FROM event_attendance ea
                    JOIN follows f ON (f.following_id = ea.user_id AND f.follower_id = $2)
                    JOIN users u ON ea.user_id = u.id
                    WHERE ea.status = 'interested' AND ea.event_id = $1
                    GROUP BY ea.event_id
                ),
                my_rating AS(
                    SELECT rating FROM event_ratings WHERE user_id = $2 AND event_id = $1
                )
            `;
        } else {
            // Null CTEs if no user
            query += `,
                my_attendance AS(SELECT null:: text as status WHERE false),
                friend_attendance AS(SELECT null:: json as friends WHERE false),
                friend_interested AS(SELECT null:: json as friends WHERE false),
                my_rating AS(SELECT null:: int as rating WHERE false)
            `;
        }

        query += `
            SELECT e.*,
                (SELECT status FROM my_attendance) as my_rsvp_status,
                COALESCE((SELECT friends FROM friend_attendance), '[]'::json) as friends_attending,
                COALESCE((SELECT friends FROM friend_interested), '[]'::json) as friends_interested,
                (SELECT count FROM all_attendees_count) as total_attendees,
                (SELECT count FROM all_interested_count) as total_interested,
                (SELECT avg_rating FROM ratings_stats) as average_rating,
                (SELECT rating_count FROM ratings_stats) as rating_count,
                (SELECT rating FROM my_rating) as my_rating
            FROM events e
            WHERE e.id = $1
        `;

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        let event = result.rows[0];

        // Fetch Artists
        const artistsResult = await pool.query(`
            SELECT a.id, a.name, a.image_url, ea.role, ea.start_time
            FROM event_artists ea
            JOIN artists a ON ea.artist_id = a.id
            WHERE ea.event_id = $1
            ORDER BY ea.billing_order ASC
        `, [id]);

        event.artists_list = artistsResult.rows;

        // Fetch Organizers
        const organizersResult = await pool.query(`
            SELECT o.id, o.name, o.image_url
            FROM event_organizers eo
            JOIN organizers o ON eo.organizer_id = o.id
            WHERE eo.event_id = $1
        `, [id]);

        event.organizers_list = organizersResult.rows;

        res.json(event);
    } catch (e) {
        console.error('getEventDetails error:', e);
        res.status(500).json({ error: e.message });
    }
};

// Comments & Ratings


const rateEvent = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });

    try {
        await pool.query(
            `INSERT INTO event_ratings(event_id, user_id, rating)
VALUES($1, $2, $3) 
             ON CONFLICT(event_id, user_id) DO UPDATE SET rating = $3, updated_at = NOW()`,
            [id, userId, rating]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const reportContent = async (req, res) => {
    const userId = req.user.id;
    const { content_type, content_id, reason } = req.body;

    if (!content_type || !content_id || !reason) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        await pool.query(
            'INSERT INTO content_reports (reporter_id, content_type, content_id, reason) VALUES ($1, $2, $3, $4)',
            [userId, content_type, content_id, reason]
        );
        res.json({ success: true, message: 'Report submitted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const resendVerificationCode = async (req, res) => {
    const { email } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.is_verified) return res.status(400).json({ error: 'User already verified' });

        const code = generateCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await sendVerificationEmail(email, code);

        await pool.query(
            'UPDATE users SET verification_code = $1, verification_expires_at = $2 WHERE id = $3',
            [code, expiresAt, user.id]
        );

        res.json({ success: true, message: 'Verification code resent' });
    } catch (e) {
        console.error('Resend code error:', e);
        res.status(500).json({ error: e.message });
    }
};


const getFriendRequests = async (req, res) => {
    const userId = req.user.id;
    try {
        // Updated to returning blank given friend requests are deprecated in favor of follow
        res.json({ data: [] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

module.exports = {
    register,
    verifyEmail,
    resendVerificationCode,
    login,
    getMe,
    updateProfile,
    searchUsers,
    verifyGuestToken,
    // Friends / Follows
    syncContacts,
    followUser,
    unfollowUser,
    getFollowing,
    // getFriends is replaced or aliases getFollowing?
    // Let's keep getFriends as getFollowing for compatibility if needed or deprecate
    getFriends: getFollowing,
    getFriendRequests,
    rsvpEvent,
    getMyEvents,
    getEventsForMap,
    getEventDetails,
    rateEvent,
    reportContent,
    getUserUsage: async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.query(`
SELECT
    (SELECT COUNT(*) FROM event_attendance WHERE user_id = $1) as attendance_count,
    (SELECT COUNT(*) FROM event_ratings WHERE user_id = $1) as ratings_count,
    (SELECT COUNT(*) FROM follows WHERE follower_id = $1) as following_count,
    (SELECT COUNT(*) FROM follows WHERE following_id = $1) as followers_count
                `, [id]);

            const counts = result.rows[0];
            const usage = parseInt(counts.attendance_count) + parseInt(counts.ratings_count) + parseInt(counts.following_count);

            res.json({ usage, details: counts });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    },
    deleteUser: async (req, res) => {
        const { id } = req.params;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            await client.query('DELETE FROM event_attendance WHERE user_id = $1', [id]);
            await client.query('DELETE FROM event_ratings WHERE user_id = $1', [id]);
            await client.query('DELETE FROM event_comments WHERE user_id = $1', [id]);
            await client.query('DELETE FROM follows WHERE follower_id = $1 OR following_id = $1', [id]);
            await client.query('DELETE FROM content_reports WHERE reporter_id = $1', [id]);

            await client.query('DELETE FROM users WHERE id = $1', [id]);

            await client.query('COMMIT');
            res.json({ success: true });
        } catch (e) {
            await client.query('ROLLBACK');
            res.status(500).json({ error: e.message });
        } finally {
            client.release();
        }
    }
};

