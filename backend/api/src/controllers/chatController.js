const { pool } = require('@social-events/shared').db;

// List my chat rooms (direct and active event rooms)
const getMyChats = async (req, res) => {
    const userId = req.user.id;
    try {
        // Fetch direct chats and joined event chats
        // For event chats, we might need an explicit 'join' or just attendance?
        // Let's assume for now any event you are 'going' to is a chat you can see, 
        // OR distinct chat_room entries for events.

        // Plan:
        // 1. Direct chats where user is participant
        // 2. Event chats for events user is 'going' or 'interested' (auto-join logic logic later, or explicit join)

        // Simpler for MVP: Just fetch direct chats from chat_participants
        // AND event chats where we have attendance.

        // This query is slightly complex. Let's start basic.

        const result = await pool.query(
            `
            -- Direct Chats
            SELECT cr.id, cr.type, cr.event_id, 
                   updated_at as last_activity,
                   NULL as event_title,
                   u.full_name as other_user_name,
                   u.avatar_url as other_user_avatar
            FROM chat_rooms cr
            JOIN chat_participants cp ON cr.id = cp.room_id
            LEFT JOIN chat_participants cp2 ON cr.id = cp2.room_id AND cp2.user_id != $1
            LEFT JOIN users u ON cp2.user_id = u.id
            WHERE cp.user_id = $1 AND cr.type = 'direct'
            
            UNION ALL
            
            -- Event Chats (if attendance implies access, or distinct participants table usage)
            -- For now, let's assume if you RSVP 'going', you see the chat.
            SELECT cr.id, cr.type, cr.event_id,
                   e.date as last_activity, -- fallback
                   e.title as event_title,
                   NULL as other_user_name,
                   e.flyer_front as other_user_avatar -- reuse field for image
            FROM chat_rooms cr
            JOIN events e ON cr.event_id = e.id
            JOIN event_attendance ea ON e.id = ea.event_id
            WHERE ea.user_id = $1 AND ea.status = 'going' AND cr.type = 'event'
            
            ORDER BY last_activity DESC
            `,
            [userId]
        );

        res.json({ data: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Get Messages
const getMessages = async (req, res) => {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { limit = 50, before } = req.query; // pagination

    try {
        // Verify access
        // Check if participant OR if (event room and attending)
        // Optimization: Just check room existence and message fetch, separate access control middleware ideal.
        // For speed, just fetch.

        const result = await pool.query(
            `SELECT m.*, u.username, u.avatar_url 
             FROM messages m
             LEFT JOIN users u ON m.user_id = u.id
             WHERE m.room_id = $1
             ORDER BY m.created_at DESC
             LIMIT $2`,
            [roomId, limit]
        );

        res.json({ data: result.rows.reverse() }); // Return in chrono order
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Send Message
const sendMessage = async (req, res) => {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { content, type = 'text' } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO messages (room_id, user_id, content, type) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [roomId, userId, content, type]
        );

        // TODO: Emit Socket.io event here

        res.json({ data: result.rows[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Start Direct Chat
const createDirectChat = async (req, res) => {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    if (userId === targetUserId) return res.status(400).json({ error: 'Cannot chat with yourself' });

    try {
        // Check if exists
        // Select room_id where both users are participants and type is direct
        const check = await pool.query(
            `SELECT cr.id FROM chat_rooms cr
             JOIN chat_participants cp1 ON cr.id = cp1.room_id
             JOIN chat_participants cp2 ON cr.id = cp2.room_id
             WHERE cr.type = 'direct' AND cp1.user_id = $1 AND cp2.user_id = $2`,
            [userId, targetUserId]
        );

        if (check.rows.length > 0) {
            return res.json({ id: check.rows[0].id, isNew: false });
        }

        // Create
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const roomRes = await client.query("INSERT INTO chat_rooms (type) VALUES ('direct') RETURNING id");
            const roomId = roomRes.rows[0].id;

            await client.query("INSERT INTO chat_participants (room_id, user_id) VALUES ($1, $2), ($1, $3)", [roomId, userId, targetUserId]);
            await client.query('COMMIT');

            res.json({ id: roomId, isNew: true });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Ensure Room for Event (Idempotent)
const ensureEventRoom = async (req, res) => {
    // Admin or system usually creates this, but can be JIT
    const { eventId } = req.params;

    try {
        const check = await pool.query("SELECT id FROM chat_rooms WHERE event_id = $1 AND type = 'event'", [eventId]);
        if (check.rows.length > 0) return res.json({ id: check.rows[0].id });

        const result = await pool.query("INSERT INTO chat_rooms (event_id, type) VALUES ($1, 'event') RETURNING id", [eventId]);
        res.json({ id: result.rows[0].id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

module.exports = {
    getMyChats,
    getMessages,
    sendMessage,
    createDirectChat,
    ensureEventRoom
};
