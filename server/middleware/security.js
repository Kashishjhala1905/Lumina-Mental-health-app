const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { COOKIE_NAME } = require('../utils/authTokens');

const DEV_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
];

/** Allow-listed browser origins: CLIENT_URL / FRONTEND_URL (comma separated) + local dev ports outside production. */
function getAllowedOrigins() {
    const configured = [process.env.CLIENT_URL, process.env.FRONTEND_URL]
        .filter(Boolean)
        .flatMap((value) => value.split(','))
        .map((value) => value.trim().replace(/\/+$/, ''))
        .filter(Boolean);
    const origins = process.env.NODE_ENV === 'production' ? configured : [...configured, ...DEV_ORIGINS];
    return [...new Set(origins)];
}

/** Recursively strips MongoDB operator keys ($...) and dotted keys from user input (NoSQL injection guard). */
function stripOperators(value, depth = 0) {
    if (depth > 10 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => stripOperators(item, depth + 1));
    const clean = {};
    for (const [key, val] of Object.entries(value)) {
        if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor') continue;
        clean[key] = stripOperators(val, depth + 1);
    }
    return clean;
}

function sanitizeRequest(req, res, next) {
    if (req.body && typeof req.body === 'object') req.body = stripOperators(req.body);
    next();
}

/**
 * CSRF defence for cookie-authenticated requests: state-changing requests that carry the
 * auth cookie must come from an allow-listed Origin (or the API's own host).
 * Combined with SameSite cookies this blocks cross-site form/XHR forgery.
 */
function verifyOrigin(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!req.cookies || !req.cookies[COOKIE_NAME]) return next();

    const source = req.get('origin') || req.get('referer');
    if (!source) return next(); // non-browser client; browsers always send Origin on unsafe requests

    let origin;
    try {
        origin = new URL(source);
    } catch {
        return res.status(403).json({ success: false, message: 'Request origin not allowed' });
    }
    const normalized = `${origin.protocol}//${origin.host}`;
    if (origin.host === req.get('host') || getAllowedOrigins().includes(normalized)) return next();
    return res.status(403).json({ success: false, message: 'Request origin not allowed' });
}

const envInt = (name, fallback) => {
    const parsed = parseInt(process.env[name], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const limiterDefaults = {
    standardHeaders: 'draft-8',
    legacyHeaders: false,
};

const apiLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 15 * 60 * 1000,
    limit: envInt('API_RATE_LIMIT', 600),
    message: { success: false, message: 'Too many requests. Please slow down and try again shortly.' },
});

// Brute-force protection: per IP + identifier, so one attacker cannot lock out everyone on a shared IP.
const loginLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 15 * 60 * 1000,
    limit: envInt('LOGIN_RATE_LIMIT', 10),
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.identifier || req.body?.email || '').toLowerCase().slice(0, 100)}`,
    message: { success: false, message: 'Too many failed sign-in attempts. Please wait 15 minutes and try again.' },
});

const registerLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 60 * 60 * 1000,
    limit: envInt('REGISTER_RATE_LIMIT', 20),
    message: { success: false, message: 'Too many accounts created from this network. Please try again later.' },
});

// Password recovery: per IP. (A silent per-account limit also applies in the controller.)
const forgotPasswordLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 15 * 60 * 1000,
    limit: envInt('FORGOT_PASSWORD_RATE_LIMIT', 5),
    message: { success: false, message: 'Too many password reset requests. Please wait 15 minutes and try again.' },
});

const resetPasswordLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 15 * 60 * 1000,
    limit: envInt('RESET_PASSWORD_RATE_LIMIT', 10),
    message: { success: false, message: 'Too many attempts. Please wait 15 minutes and try again.' },
});

const chatbotLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 60 * 1000,
    limit: envInt('CHATBOT_RATE_LIMIT', 20),
    message: { success: false, message: 'You are sending messages very quickly. Please wait a moment.' },
});

const checkinLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 60 * 60 * 1000,
    limit: envInt('CHECKIN_RATE_LIMIT', 12),
    keyGenerator: (req) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
    message: { success: false, message: 'You have submitted several check-ins recently. Please try again later.' },
});

const perUser = (req) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip));

const communityPostLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 60 * 60 * 1000,
    limit: envInt('COMMUNITY_POST_RATE_LIMIT', 10),
    keyGenerator: perUser,
    message: { success: false, message: 'You have posted a lot in the last hour. Please take a break and try again later.' },
});

const communityCommentLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 60 * 60 * 1000,
    limit: envInt('COMMUNITY_COMMENT_RATE_LIMIT', 60),
    keyGenerator: perUser,
    message: { success: false, message: 'You are commenting very quickly. Please slow down.' },
});

const feedbackLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 60 * 60 * 1000,
    limit: envInt('FEEDBACK_RATE_LIMIT', 5),
    skipFailedRequests: true, // rejected (invalid/duplicate) submissions don't count
    keyGenerator: perUser,
    message: { success: false, message: 'Thank you! You have sent several feedback messages recently – please try again later.' },
});

module.exports = {
    getAllowedOrigins,
    sanitizeRequest,
    verifyOrigin,
    apiLimiter,
    loginLimiter,
    registerLimiter,
    forgotPasswordLimiter,
    resetPasswordLimiter,
    chatbotLimiter,
    checkinLimiter,
    communityPostLimiter,
    communityCommentLimiter,
    feedbackLimiter,
    stripOperators,
};
