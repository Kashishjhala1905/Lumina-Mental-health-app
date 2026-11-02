const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'lumina_token';
const SESSION_TTL = '12h';           // token lifetime when "remember me" is off
const REMEMBER_TTL_DAYS = 7;         // token + cookie lifetime when "remember me" is on

let devSecret;

/**
 * Returns the JWT signing secret.
 * Production refuses to start without JWT_SECRET; development falls back to a
 * per-process random secret (sessions then reset on restart) and logs a warning.
 */
function getJwtSecret() {
    const secret = process.env.JWT_SECRET && process.env.JWT_SECRET.trim();
    if (secret) return secret;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production');
    }
    if (!devSecret) {
        devSecret = crypto.randomBytes(48).toString('hex');
        console.warn('⚠️  JWT_SECRET is not set. Using a temporary development secret; logins reset when the server restarts.');
    }
    return devSecret;
}

function signToken(user, rememberMe = false) {
    return jwt.sign(
        { id: String(user._id || user.id), role: user.role, tv: user.tokenVersion || 0 },
        getJwtSecret(),
        {
            expiresIn: rememberMe ? `${REMEMBER_TTL_DAYS}d` : SESSION_TTL,
            // Unique session id, so signing out can revoke this one token without touching other devices
            jwtid: crypto.randomUUID(),
        }
    );
}

function verifyToken(token) {
    return jwt.verify(token, getJwtSecret());
}

function cookieOptions(rememberMe = false) {
    const isProd = process.env.NODE_ENV === 'production';
    // COOKIE_SAMESITE=none is required only when the frontend and API are on different sites.
    const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
    const secure = sameSite === 'none' ? true : (process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd);
    const options = {
        httpOnly: true,
        secure,
        sameSite,
        path: '/',
    };
    if (rememberMe) options.maxAge = REMEMBER_TTL_DAYS * 24 * 60 * 60 * 1000;
    return options;
}

function setAuthCookie(res, token, rememberMe = false) {
    res.cookie(COOKIE_NAME, token, cookieOptions(rememberMe));
}

function clearAuthCookie(res) {
    const { maxAge, ...options } = cookieOptions(false);
    res.clearCookie(COOKIE_NAME, options);
}

module.exports = {
    COOKIE_NAME,
    getJwtSecret,
    signToken,
    verifyToken,
    setAuthCookie,
    clearAuthCookie,
};
