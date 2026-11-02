// Forgot / reset password.
// - 256-bit random token, only its SHA-256 hash is stored, 15-minute expiry, single use (atomic consume).
// - Neutral responses + background processing so responses never reveal whether an account exists.
// - Successful reset bumps tokenVersion (signs out every session) and invalidates other outstanding tokens.
// - Tokens and passwords are never logged.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const { sendEmail } = require('../services/email/emailService');
const { appLink, appUrlIssues } = require('../services/email/appUrl');
const { auditLog } = require('../services/auditService');
const { passwordProblems } = require('./authController');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url
const ttlMinutes = () => Math.min(Math.max(parseInt(process.env.PASSWORD_RESET_TTL_MINUTES, 10) || 15, 5), 60);
const MAX_REQUESTS_PER_HOUR = 3;
const NEUTRAL_MESSAGE = 'If an account exists for that email address, we have sent a link to reset the password. The link expires in a few minutes.';
const INVALID_MESSAGE = 'This password reset link is invalid or has expired. Please request a new one.';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Processes a reset request for an email. Never throws; never reveals anything to the caller. */
async function processResetRequest(email) {
    try {
        // Case-insensitive: older accounts may store the address with capitals or spaces
        const user = await User.findByEmail(email, { projection: '_id name email' });
        if (!user) return { sent: false };
        if (!appLink('/reset-password') || appUrlIssues().some((i) => /not set|localhost/.test(i))) {
            console.error('Password reset email not sent: CLIENT_URL / APP_BASE_URL is not configured for production.');
            await auditLog({ action: 'PASSWORD_RESET_NOT_SENT', targetUserId: user._id, entityType: 'User', entityId: user._id, metadata: { cause: 'app_url_not_configured' } });
            return { sent: false, misconfigured: true };
        }

        const recent = await PasswordResetToken.countDocuments({ userId: user._id, createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } });
        if (recent >= MAX_REQUESTS_PER_HOUR) {
            await auditLog({ action: 'PASSWORD_RESET_THROTTLED', targetUserId: user._id, entityType: 'User', entityId: user._id });
            return { sent: false, throttled: true };
        }

        // Only the newest link works
        await PasswordResetToken.updateMany({ userId: user._id, usedAt: null, invalidatedAt: null }, { $set: { invalidatedAt: new Date() } });

        const token = crypto.randomBytes(32).toString('base64url');
        const record = await PasswordResetToken.create({
            userId: user._id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + ttlMinutes() * 60 * 1000),
        });

        const result = await sendEmail({
            to: String(user.email).trim(),
            type: 'password_reset',
            userId: user._id,
            idempotencyKey: `password_reset:${record._id}`,
            data: { name: user.name, resetUrl: appLink(`/reset-password?token=${token}`), expiresMinutes: ttlMinutes() },
        });
        await auditLog({
            action: 'PASSWORD_RESET_REQUESTED',
            targetUserId: user._id,
            entityType: 'User',
            entityId: user._id,
            metadata: { emailStatus: result.status, errorCode: result.errorCode },
        });
        return { sent: ['accepted', 'captured'].includes(result.status), status: result.status };
    } catch (err) {
        console.error('Password reset request failed:', err.message);
        return { sent: false, error: true };
    }
}

// POST /api/auth/forgot-password   { email }
const forgotPassword = async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email || !EMAIL_REGEX.test(email) || email.length > 254) {
        return res.status(400).json({ success: false, message: 'Please enter a valid email address', errors: { email: 'Please enter a valid email address' } });
    }
    // Respond first so response time does not depend on whether the account exists.
    res.json({ success: true, message: NEUTRAL_MESSAGE });
    setImmediate(() => { processResetRequest(email); });
};

async function findValidToken(token) {
    if (typeof token !== 'string' || !TOKEN_REGEX.test(token)) return null;
    return PasswordResetToken.findOne({
        tokenHash: hashToken(token),
        usedAt: null,
        invalidatedAt: null,
        expiresAt: { $gt: new Date() },
    });
}

// POST /api/auth/reset-password/verify   { token }  – lets the page show "expired" before the user types
const verifyResetToken = async (req, res) => {
    const record = await findValidToken(req.body.token);
    if (!record) return res.status(400).json({ success: false, valid: false, message: INVALID_MESSAGE });
    res.json({ success: true, valid: true, expiresAt: record.expiresAt });
};

// POST /api/auth/reset-password   { token, password, confirmPassword }
const resetPassword = async (req, res) => {
    const { token } = req.body;
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';

    const record = await findValidToken(token);
    if (!record) return res.status(400).json({ success: false, code: 'INVALID_TOKEN', message: INVALID_MESSAGE });

    const user = await User.findById(record.userId);
    if (!user) return res.status(400).json({ success: false, code: 'INVALID_TOKEN', message: INVALID_MESSAGE });

    // Validate the new password BEFORE consuming the token, so a typo does not burn the link
    const problems = passwordProblems(password, { username: user.username, email: user.email });
    const errors = {};
    if (!password) errors.password = 'Please enter a new password';
    else if (problems.length) errors.password = `Password must include ${problems.join(', ')}`;
    if (password && password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
    if (!errors.password && await bcrypt.compare(password, user.password)) errors.password = 'Please choose a password you have not used for this account';
    if (Object.keys(errors).length) return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });

    // Atomic single-use consumption: only one request can flip usedAt
    const consumed = await PasswordResetToken.findOneAndUpdate(
        { _id: record._id, usedAt: null, invalidatedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { usedAt: new Date() } },
        { new: true }
    );
    if (!consumed) return res.status(400).json({ success: false, code: 'INVALID_TOKEN', message: INVALID_MESSAGE });

    user.password = await bcrypt.hash(password, 12);
    user.passwordChangedAt = new Date();
    user.tokenVersion = (user.tokenVersion || 0) + 1; // signs out every existing session
    await user.save();
    await PasswordResetToken.updateMany({ userId: user._id, usedAt: null, invalidatedAt: null }, { $set: { invalidatedAt: new Date() } });

    await auditLog({ action: 'PASSWORD_RESET_COMPLETED', targetUserId: user._id, entityType: 'User', entityId: user._id });
    // Security notice (best effort; failure does not affect the reset)
    sendEmail({
        to: String(user.email).trim(),
        type: 'password_changed',
        userId: user._id,
        idempotencyKey: `password_changed:${consumed._id}`,
        data: { name: user.name, changedAt: new Date().toUTCString() },
    }).catch((err) => console.error('Password-changed email failed:', err.message));

    res.json({ success: true, message: 'Your password has been reset. Please sign in with your new password.' });
};

module.exports = { forgotPassword, verifyResetToken, resetPassword, processResetRequest, hashToken };
