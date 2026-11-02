// Centralized error handling: safe, consistent JSON errors without leaking internals.

function notFound(req, res) {
    res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl.split('?')[0]}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    if (res.headersSent) return;

    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, message: 'Malformed JSON request body' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ success: false, message: 'Request body is too large' });
    }
    if (err.name === 'CastError') {
        return res.status(400).json({ success: false, message: 'Invalid identifier' });
    }
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors || {}).map((e) => ({ field: e.path, message: e.message }));
        return res.status(400).json({ success: false, message: errors[0]?.message || 'Validation failed', errors });
    }
    if (err.code === 11000) {
        return res.status(409).json({ success: false, message: 'A record with these details already exists' });
    }

    const status = err.statusCode || err.status || 500;
    if (status >= 500) console.error('Unhandled error:', err.message, process.env.NODE_ENV === 'production' ? '' : err.stack);
    res.status(status).json({
        success: false,
        message: status >= 500 ? 'Something went wrong on our side. Please try again.' : err.message,
    });
}

/** Small helper for throwing HTTP errors from controllers/services. */
class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

module.exports = { notFound, errorHandler, HttpError };
