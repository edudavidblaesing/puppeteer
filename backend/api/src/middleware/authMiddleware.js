const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

const verifyToken = (req, res, next) => {
    // 1. Check Authorization Header
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    // 2. Validate Bearer format
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Invalid token format. Format is Bearer <token>.' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        // 3. Verify Token
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Attach user payload to request
        next();
    } catch (err) {
        console.error('Token verification failed:', err.message);
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
};

const verifyAdmin = (req, res, next) => {
    // Must run verifyToken first!
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    next();
};

module.exports = {
    verifyToken,
    verifyAdmin
};
