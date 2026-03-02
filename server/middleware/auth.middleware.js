const jwt = require('jsonwebtoken');

// Middleware to authenticate token
exports.authenticate = (req, res, next) => {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    // Token format is "Bearer <token>"
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Access denied. Malformed token.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Add user payload to request object
        next();
    } catch (ex) {
        res.status(400).json({ error: 'Invalid token.' });
    }
};

// Middleware to authorize roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden. You do not have permission to perform this action.' });
        }
        next();
    };
};