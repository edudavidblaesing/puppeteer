const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { pool } = require('@social-events/shared').db;

let io;

const initSocket = (server) => {
    io = socketIo(server, {
        cors: {
            origin: "*", // Allow all for now, restrict in prod
            methods: ["GET", "POST"]
        }
    });

    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication error'));

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            socket.user = decoded; // { id, role }
            next();
        } catch (e) {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`[Socket] User connected: ${socket.user.id}`);

        socket.on('join_room', (roomId) => {
            // Verify access (optional but recommended)
            socket.join(roomId);
            console.log(`[Socket] User ${socket.user.id} joined room ${roomId}`);
        });

        socket.on('leave_room', (roomId) => {
            socket.leave(roomId);
        });

        socket.on('send_message', async (data) => {
            const { roomId, content, type = 'text', tempId } = data;

            // Persist to DB directly here or via API?
            // Usually API persists and then emits.
            // But if we want full socket chat, we persist here.
            // Let's persist here for speed.

            try {
                const result = await pool.query(
                    `INSERT INTO messages (room_id, user_id, content, type) 
                     VALUES ($1, $2, $3, $4) 
                     RETURNING *`,
                    [roomId, socket.user.id, content, type]
                );

                const message = result.rows[0];

                // Fetch user info to send back
                const userRes = await pool.query('SELECT username, avatar_url FROM users WHERE id = $1', [socket.user.id]);
                message.user = userRes.rows[0];
                message.tempId = tempId; // Echo back for client confirmation

                io.to(roomId).emit('new_message', message);
            } catch (e) {
                console.error('Socket message error:', e);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        socket.on('typing', (data) => {
            const { roomId, isTyping } = data;
            socket.to(roomId).emit('user_typing', { userId: socket.user.id, isTyping });
        });

        socket.on('disconnect', () => {
            console.log(`[Socket] User disconnected: ${socket.user.id}`);
        });
    });

    return io;
};

const getIo = () => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};

module.exports = {
    initSocket,
    getIo
};
