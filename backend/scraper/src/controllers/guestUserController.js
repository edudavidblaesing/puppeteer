const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { sendVerificationEmail } = require('../services/emailService');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Helper to hash password
const hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
};

// Generate 6-digit code
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// Register
const register = async (req, res) => {
    const { email, password, username, full_name } = req.body;

    try {
        // Check if user exists
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1 OR username = $2', [email, username]);

        if (userCheck.rows.length > 0) {
            const existingUser = userCheck.rows[0];

            // If user exists and is verified, blocked
            if (existingUser.is_verified) {
                return res.status(409).json({ error: 'User with this email or username already exists' });
            }

            // If user exists but NOT verified, we resend the code (and update it)
            // We can also update the password if they changed it, but let's stick to resending logic for now
            // Actually, better to update the record with new details in case they fixed a typo in name/password
            const hashedPassword = await hashPassword(password);
            const code = generateCode();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

            // Send Email
            await sendVerificationEmail(email, code);

            await pool.query(
                `UPDATE users 
                 SET password_hash = $1, full_name = $2, verification_code = $3, verification_expires_at = $4, username = $5
                 WHERE id = $6`,
                [hashedPassword, full_name, code, expiresAt, username, existingUser.id]
            );

            return res.status(200).json({
                success: true,
                message: 'Verification sender (resend)',
                email: email
            });
        }

        const hashedPassword = await hashPassword(password);
        const code = generateCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

        // ...

        // Mock Send Email (Log to console) -> Now real send
        // console.log(`[EMAIL MOCK] To: ${email}, Code: ${code}`);
        await sendVerificationEmail(email, code);

        const result = await pool.query(
            `INSERT INTO users (email, password_hash, username, full_name, is_verified, verification_code, verification_expires_at) 
             VALUES ($1, $2, $3, $4, false, $5, $6) 
             RETURNING id, email, username, full_name, created_at`,
            [email, hashedPassword, username, full_name, code, expiresAt]
        );

        res.status(201).json({
            success: true,
            message: 'Verification code sent',
            email: email
        });

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
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        const user = result.rows[0];

        if (!user) return res.status(404).json({ error: 'User not found' });

        delete user.password_hash;
        res.json({ user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Update Profile
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
const sendFriendRequest = async (req, res) => {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    if (userId === targetUserId) return res.status(400).json({ error: 'Cannot add yourself' });

    try {
        await pool.query(
            `INSERT INTO friendships (user_id_1, user_id_2, status) 
             VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), 'pending')
             ON CONFLICT (user_id_1, user_id_2) DO NOTHING`,
            [userId, targetUserId]
        );
        res.json({ success: true, message: 'Request sent' });
    } catch (e) {
        console.error('SendFriendRequest Error:', e);
        console.error('UserId:', userId, 'TargetUserId:', targetUserId);
        res.status(500).json({ error: e.message, details: e.toString() });
    }
};

const respondToFriendRequest = async (req, res) => {
    const userId = req.user.id;
    const { targetUserId, status } = req.body; // status: 'accepted' or 'rejected'

    if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    try {
        if (status === 'rejected') {
            await pool.query(
                `DELETE FROM friendships 
                 WHERE user_id_1 = LEAST($1, $2) AND user_id_2 = GREATEST($1, $2)`,
                [userId, targetUserId]
            );
            return res.json({ success: true, message: 'Request rejected' });
        }

        const result = await pool.query(
            `UPDATE friendships 
             SET status = 'accepted', updated_at = NOW() 
             WHERE user_id_1 = LEAST($1, $2) AND user_id_2 = GREATEST($1, $2) 
             RETURNING *`,
            [userId, targetUserId]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Friendship request not found' });

        res.json({ success: true, message: 'Friend accepted' });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const getFriends = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await pool.query(
            `SELECT u.id, u.username, u.full_name, u.avatar_url 
             FROM friendships f
             JOIN users u ON (u.id = CASE WHEN f.user_id_1 = $1 THEN f.user_id_2 ELSE f.user_id_1 END)
             WHERE (f.user_id_1 = $1 OR f.user_id_2 = $1) AND f.status = 'accepted'`,
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
                JOIN friendships f ON (f.user_id_1 = $1 OR f.user_id_2 = $1) AND f.status = 'accepted'
                JOIN users u ON ea.user_id = u.id
                WHERE (
                    (ea.user_id = f.user_id_1 AND f.user_id_2 = $1) OR 
                    (ea.user_id = f.user_id_2 AND f.user_id_1 = $1)
                ) AND ea.status = 'going'
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

        query += `
            FROM events e
            LEFT JOIN friend_attendance fa ON e.id = fa.event_id
            WHERE e.publish_status IN ('published', 'cancelled')
              AND e.publish_status NOT IN ('draft', 'approved') -- Explicit safety check
              AND e.latitude IS NOT NULL 
              AND e.longitude IS NOT NULL
              AND e.date > NOW()
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

        const result = await pool.query(query, params);
        console.log(`[Map] Returning ${result.rows.length} events. Filter: published/cancelled`);

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
            WITH ratings_stats AS (
                SELECT AVG(rating)::numeric(2,1) as avg_rating, COUNT(*) as rating_count FROM event_ratings WHERE event_id = $1
            ),
            all_attendees_count AS (
                SELECT COUNT(*) as count FROM event_attendance WHERE event_id = $1 AND status = 'going'
            )
        `;

        if (userId) {
            params.push(userId);
            userParamIdx = 2;

            query += `,
            my_attendance AS (
                SELECT status FROM event_attendance WHERE user_id = $2 AND event_id = $1
            ),
            friend_attendance AS (
                SELECT ea.event_id, 
                       json_agg(json_build_object(
                           'id', u.id, 
                           'username', u.username, 
                           'full_name', u.full_name, 
                           'avatar_url', u.avatar_url
                       )) as friends
                FROM event_attendance ea
                JOIN friendships f ON (f.user_id_1 = $2 OR f.user_id_2 = $2) AND f.status = 'accepted'
                JOIN users u ON ea.user_id = u.id
                WHERE (
                    (ea.user_id = f.user_id_1 AND f.user_id_2 = $2) OR 
                    (ea.user_id = f.user_id_2 AND f.user_id_1 = $2)
                ) AND ea.status = 'going' AND ea.event_id = $1
                GROUP BY ea.event_id
            ),
            my_rating AS (
                SELECT rating FROM event_ratings WHERE user_id = $2 AND event_id = $1
            )
            `;
        } else {
            // Null CTEs if no user
            query += `,
            my_attendance AS (SELECT null::text as status WHERE false),
            friend_attendance AS (SELECT null::json as friends WHERE false),
            my_rating AS (SELECT null::int as rating WHERE false)
            `;
        }

        query += `
            SELECT e.*,
                   (SELECT status FROM my_attendance) as my_rsvp_status,
                   COALESCE((SELECT friends FROM friend_attendance), '[]'::json) as friends_attending,
                   (SELECT count FROM all_attendees_count) as total_attendees,
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
const addComment = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { content } = req.body;

    if (!content) return res.status(400).json({ error: 'Content is required' });

    try {
        const result = await pool.query(
            'INSERT INTO event_comments (event_id, user_id, content) VALUES ($1, $2, $3) RETURNING id, content, created_at',
            [id, userId, content]
        );
        // Enrich with user info
        const comment = result.rows[0];
        const userRes = await pool.query('SELECT username, avatar_url FROM users WHERE id = $1', [userId]);
        comment.user = userRes.rows[0];

        res.json(comment);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const deleteComment = async (req, res) => {
    const userId = req.user.id;
    const { commentId } = req.params;

    try {
        const result = await pool.query('DELETE FROM event_comments WHERE id = $1 AND user_id = $2 RETURNING id', [commentId, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Comment not found or unauthorized' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const getComments = async (req, res) => {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    try {
        const result = await pool.query(`
            SELECT c.*, u.username, u.avatar_url, u.full_name
            FROM event_comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.event_id = $1
            ORDER BY c.created_at DESC
            LIMIT $2 OFFSET $3
        `, [id, limit, offset]);

        res.json({ data: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const rateEvent = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });

    try {
        await pool.query(
            `INSERT INTO event_ratings (event_id, user_id, rating) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (event_id, user_id) DO UPDATE SET rating = $3, updated_at = NOW()`,
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
        const result = await pool.query(
            `SELECT u.id, u.username, u.full_name, u.avatar_url, f.created_at
             FROM friendships f
             JOIN users u ON f.user_id_1 = u.id
             WHERE f.user_id_2 = $1 AND f.status = 'pending'
             ORDER BY f.created_at DESC`,
            [userId]
        );
        res.json({ data: result.rows });
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
    sendFriendRequest,
    getFriendRequests,
    respondToFriendRequest,
    getFriends,
    rsvpEvent,
    getMyEvents,
    getEventsForMap,
    getEventDetails,
    addComment,
    deleteComment,
    getComments,
    rateEvent,
    reportContent
};
