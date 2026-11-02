const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const { COOKIE_NAME, verifyToken, clearAuthCookie } = require('../utils/authTokens');
const { expandRoles, normalizeRole } = require('../utils/roles');

/** Reads the JWT from the HttpOnly cookie (browser) or an `Authorization: Bearer` header (API clients). */
function extractToken(req) {
    if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) return header.slice(7).trim();
    return null;
}

async function resolveUser(token) {
    const decoded = verifyToken(token);
    const [user, signedOut] = await Promise.all([
        User.findById(decoded.id).select('-password'),
        decoded.jti ? RevokedToken.exists({ jti: decoded.jti }) : null,
    ]);
    if (!user) return { error: 'USER_NOT_FOUND' };
    if (signedOut) return { error: 'TOKEN_REVOKED' };
    if ((user.tokenVersion || 0) !== (decoded.tv || 0)) return { error: 'TOKEN_REVOKED' };
    return { user, session: decoded };
}

const protect = async (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({ success: false, code: 'NO_TOKEN', message: 'Please sign in to continue' });
    }
    try {
        const { user, session, error } = await resolveUser(token);
        if (error) {
            clearAuthCookie(res);
            return res.status(401).json({ success: false, code: error, message: 'Your session is no longer valid. Please sign in again.' });
        }
        req.user = user;
        req.user.normalizedRole = normalizeRole(user.role);
        req.authSession = session;
        return next();
    } catch (error) {
        clearAuthCookie(res);
        const expired = error.name === 'TokenExpiredError';
        return res.status(401).json({
            success: false,
            code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
            message: expired ? 'Your session has expired. Please sign in again.' : 'Not authorized, invalid session',
        });
    }
};

/** Attaches req.user when a valid session exists, but never rejects the request. */
const optionalAuth = async (req, res, next) => {
    const token = extractToken(req);
    if (!token) return next();
    try {
        const { user, session } = await resolveUser(token);
        if (user) {
            req.user = user;
            req.user.normalizedRole = normalizeRole(user.role);
            req.authSession = session;
        }
    } catch {
        // ignore invalid tokens for optional auth
    }
    return next();
};

const restrictTo = (...roles) => {
    const allowed = expandRoles(roles);
    return (req, res, next) => {
        if (!req.user || !allowed.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'User role is not authorized to access this route'
            });
        }
        next();
    };
};

/** Counselors must be approved by an admin before accessing counselor tools. */
const requireApprovedCounselor = (req, res, next) => {
    if (req.user?.role !== 'counselor' || !req.user.isApproved) {
        return res.status(403).json({ success: false, message: 'An approved counselor account is required' });
    }
    next();
};

module.exports = { protect, optionalAuth, restrictTo, requireApprovedCounselor, extractToken };
