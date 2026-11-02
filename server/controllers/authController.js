const bcrypt = require('bcryptjs');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const { signToken, setAuthCookie, clearAuthCookie } = require('../utils/authTokens');
const { normalizeRole } = require('../utils/roles');
const { auditLog } = require('../services/auditService');

const BCRYPT_ROUNDS = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESERVED_USERNAMES = new Set([
    'admin', 'administrator', 'root', 'system', 'lumina', 'support', 'help', 'counselor',
    'moderator', 'staff', 'security', 'api', 'null', 'undefined', 'me',
]);
// Used to keep response timing similar whether or not an account exists.
const DUMMY_HASH = bcrypt.hashSync('lumina-timing-equalizer', 10);

/** Returns a list of unmet password requirements (empty when the password is acceptable). */
const passwordProblems = (password = '', { username, email } = {}) => {
    const problems = [];
    if (password.length < 8) problems.push('at least 8 characters');
    if (password.length > 128) problems.push('no more than 128 characters');
    if (!/[a-z]/.test(password)) problems.push('a lowercase letter');
    if (!/[A-Z]/.test(password)) problems.push('an uppercase letter');
    if (!/\d/.test(password)) problems.push('a number');
    const lower = password.toLowerCase();
    if (username && username.length >= 3 && lower.includes(username.toLowerCase())) problems.push('not contain your username');
    const emailLocal = (email || '').split('@')[0];
    if (emailLocal && emailLocal.length >= 4 && lower.includes(emailLocal.toLowerCase())) problems.push('not contain your email name');
    return problems;
};

const passwordMessage = (problems) => `Password must include ${problems.join(', ')}`;

/** Safe, client-facing view of a user. Never includes password hashes or token versions. */
const toSafeUser = (user) => ({
    _id: user._id,
    id: String(user._id),
    name: user.name,
    username: user.username || null,
    email: user.email,
    role: normalizeRole(user.role),
    isApproved: user.isApproved,
    speciality: user.role === 'counselor' ? user.speciality : undefined,
    counselorApplication: { status: user.counselorApplication?.status || 'none' },
    isDemoAccount: !!user.isDemoAccount,
    emailNotifications: !!user.emailNotifications,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
});

const issueSession = (res, user, rememberMe) => {
    const token = signToken(user, rememberMe);
    setAuthCookie(res, token, rememberMe);
};

const fieldError = (res, status, field, message) =>
    res.status(status).json({ success: false, message, errors: { [field]: message } });

// @desc    Register a new user (always the `user` role)
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
    const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
    const username = String(req.body.username || '').trim().toLowerCase();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';
    const applyAsCounselor = req.body.applyAsCounselor === true || req.body.applyAsCounselor === 'true';
    const speciality = String(req.body.speciality || '').trim().slice(0, 200);
    const credentials = String(req.body.credentials || '').trim().slice(0, 500);

    const errors = {};
    if (!name) errors.name = 'Full name is required';
    else if (name.length < 2 || name.length > 80) errors.name = 'Full name must be between 2 and 80 characters';

    if (!username) errors.username = 'Username is required';
    else if (!User.USERNAME_REGEX.test(username)) errors.username = 'Username must be 3-30 characters using letters, numbers, dots, dashes or underscores, starting and ending with a letter or number';
    else if (RESERVED_USERNAMES.has(username)) errors.username = 'This username is reserved. Please choose another';

    if (!email) errors.email = 'Email address is required';
    else if (!EMAIL_REGEX.test(email) || email.length > 254) errors.email = 'Please enter a valid email address';

    const problems = passwordProblems(password, { username, email });
    if (!password) errors.password = 'Password is required';
    else if (problems.length) errors.password = passwordMessage(problems);

    if (!confirmPassword) errors.confirmPassword = 'Please confirm your password';
    else if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';

    if (applyAsCounselor) {
        if (!speciality) errors.speciality = 'Speciality is required for counselor applications';
        if (!credentials) errors.credentials = 'Proof of credentials is required for counselor applications';
    }

    if (Object.keys(errors).length) {
        return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });
    }

    const [emailTaken, usernameTaken] = await Promise.all([
        // Case-insensitive, so an older account stored as "Name@Example.com" is not duplicated
        User.findByEmail(email, { projection: '_id' }),
        User.exists({ username }),
    ]);
    if (emailTaken) return fieldError(res, 409, 'email', 'An account with this email already exists');
    if (usernameTaken) return fieldError(res, 409, 'username', 'This username is already taken');

    let user;
    try {
        user = await User.create({
            name,
            username,
            email,
            password: await bcrypt.hash(password, BCRYPT_ROUNDS),
            role: 'user', // Self-registration can never grant counselor/admin roles
            isApproved: true,
            counselorApplication: applyAsCounselor
                ? { status: 'pending', speciality, credentials, appliedAt: new Date() }
                : { status: 'none' },
            lastLoginAt: new Date(),
        });
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern || {})[0] === 'username' ? 'username' : 'email';
            return fieldError(res, 409, field, field === 'username' ? 'This username is already taken' : 'An account with this email already exists');
        }
        throw error;
    }

    await auditLog({
        action: 'USER_REGISTERED',
        actor: user,
        targetUserId: user._id,
        entityType: 'User',
        entityId: user._id,
        metadata: { counselorApplication: applyAsCounselor },
    });
    if (applyAsCounselor) {
        await auditLog({ action: 'COUNSELOR_APPLICATION_SUBMITTED', actor: user, targetUserId: user._id, entityType: 'User', entityId: user._id });
    }

    issueSession(res, user, true);
    res.status(201).json({
        success: true,
        message: applyAsCounselor
            ? 'Account created. Your counselor application is pending administrator review.'
            : 'Account created successfully',
        user: toSafeUser(user),
    });
};

// @desc    Authenticate with username OR email + password
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    // `email` is still accepted for backwards compatibility with older clients.
    const identifier = String(req.body.identifier ?? req.body.email ?? '').trim().toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const rememberMe = req.body.rememberMe === true || req.body.rememberMe === 'true';

    if (!identifier || !password) {
        return res.status(400).json({ success: false, message: 'Please enter your username or email and your password' });
    }
    if (identifier.length > 254 || password.length > 128) {
        return res.status(401).json({ success: false, message: 'Invalid username/email or password' });
    }

    const method = identifier.includes('@') ? 'email' : 'username';
    // Email lookups are case/whitespace-insensitive: accounts created by the original registration
    // code kept the address exactly as typed (e.g. "Name@Example.com"), so an exact match on the
    // lowercased input could never find them and a correct password was reported as invalid.
    const candidates = method === 'email'
        ? await User.findByEmailCandidates(identifier)
        : [await User.findOne({ username: identifier })].filter(Boolean);

    let user = null;
    for (const candidate of candidates) {
        if (await bcrypt.compare(password, candidate.password)) { user = candidate; break; }
    }
    if (!candidates.length) await bcrypt.compare(password, DUMMY_HASH); // keep timing similar for unknown accounts

    if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid username/email or password' });
    }

    // Legacy counselor accounts created before the application flow still need approval.
    if (user.role === 'counselor' && !user.isApproved) {
        return res.status(403).json({ success: false, message: 'Your counselor account is pending approval by an administrator.' });
    }

    // Record the sign-in without re-saving (and re-validating) the whole document: older records
    // that predate today's schema rules must still be able to sign in, and nothing else is touched.
    user.lastLoginAt = new Date();
    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: user.lastLoginAt } });
    await auditLog({ action: 'USER_LOGIN', actor: user, targetUserId: user._id, entityType: 'User', entityId: user._id, metadata: { method } });

    issueSession(res, user, rememberMe);
    res.json({ success: true, message: 'Signed in successfully', user: toSafeUser(user) });
};

// @desc    Sign out: ends this session only. The account, password and all user data are untouched.
//          `everywhere` also revokes every other session of the account.
// @route   POST /api/auth/logout
// @access  Public (works with or without a valid session)
const logoutUser = async (req, res) => {
    const session = req.authSession;
    if (req.user && session?.jti && session.exp) {
        // Revoke this token so it cannot be replayed, until it would have expired anyway
        await RevokedToken.updateOne(
            { jti: session.jti },
            { $setOnInsert: { jti: session.jti, userId: req.user._id, expiresAt: new Date(session.exp * 1000) } },
            { upsert: true }
        );
    }
    if (req.user && req.body?.everywhere) {
        await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    }
    if (req.user) {
        await auditLog({ action: 'USER_LOGOUT', actor: req.user, targetUserId: req.user._id, entityType: 'User', entityId: req.user._id, metadata: { everywhere: !!req.body?.everywhere } });
    }
    clearAuthCookie(res);
    res.json({ success: true, message: 'Signed out' });
};

// @desc    Get all approved counselors registered as users
// @route   GET /api/auth/counselors
// @access  Public
const getCounselors = async (req, res) => {
    const counselors = await User.find({ role: 'counselor', isApproved: true }).select('name speciality').lean();
    res.status(200).json({ success: true, count: counselors.length, data: counselors });
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
    const safe = toSafeUser(req.user);
    res.status(200).json({ success: true, data: safe, user: safe });
};

// @desc    Update profile (name, username)
// @route   PATCH /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
    const user = await User.findById(req.user._id);
    const errors = {};

    if (req.body.name !== undefined) {
        const name = String(req.body.name).trim().replace(/\s+/g, ' ');
        if (name.length < 2 || name.length > 80) errors.name = 'Full name must be between 2 and 80 characters';
        else user.name = name;
    }
    if (req.body.username !== undefined) {
        const username = String(req.body.username).trim().toLowerCase();
        if (!User.USERNAME_REGEX.test(username)) errors.username = 'Username must be 3-30 characters using letters, numbers, dots, dashes or underscores';
        else if (RESERVED_USERNAMES.has(username)) errors.username = 'This username is reserved. Please choose another';
        else if (username !== user.username && await User.exists({ username, _id: { $ne: user._id } })) errors.username = 'This username is already taken';
        else user.username = username;
    }

    if (req.body.emailNotifications !== undefined) {
        if (typeof req.body.emailNotifications !== 'boolean') errors.emailNotifications = 'emailNotifications must be true or false';
        else user.emailNotifications = req.body.emailNotifications;
    }

    if (Object.keys(errors).length) {
        return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });
    }

    await user.save();
    await auditLog({ action: 'PROFILE_UPDATED', actor: req.user, targetUserId: user._id, entityType: 'User', entityId: user._id, metadata: { fields: Object.keys(req.body).filter((k) => ['name', 'username', 'emailNotifications'].includes(k)) } });
    res.json({ success: true, message: 'Profile updated', user: toSafeUser(user) });
};

// @desc    Change password (revokes all other sessions)
// @route   PATCH /api/auth/password
// @access  Private
const changePassword = async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.password))) {
        return fieldError(res, 400, 'currentPassword', 'Current password is incorrect');
    }
    const problems = passwordProblems(typeof newPassword === 'string' ? newPassword : '', { username: user.username, email: user.email });
    if (problems.length) return fieldError(res, 400, 'newPassword', passwordMessage(problems));
    if (newPassword !== confirmPassword) return fieldError(res, 400, 'confirmPassword', 'Passwords do not match');
    if (await bcrypt.compare(newPassword, user.password)) {
        return fieldError(res, 400, 'newPassword', 'New password must be different from your current password');
    }

    user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    user.passwordChangedAt = new Date();
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await auditLog({ action: 'PASSWORD_CHANGED', actor: req.user, targetUserId: user._id, entityType: 'User', entityId: user._id });
    // Outstanding reset links become useless, and the owner gets a security notice
    await require('../models/PasswordResetToken').updateMany({ userId: user._id, usedAt: null, invalidatedAt: null }, { $set: { invalidatedAt: new Date() } });
    require('../services/email/emailService').sendEmail({
        to: String(user.email).trim(),
        type: 'password_changed',
        userId: user._id,
        idempotencyKey: `password_changed:${user._id}:${user.tokenVersion}`,
        data: { name: user.name, changedAt: new Date().toUTCString() },
    }).catch((err) => console.error('Password-changed email failed:', err.message));

    issueSession(res, user, true);
    res.json({ success: true, message: 'Password updated. Other sessions have been signed out.' });
};

module.exports = {
    registerUser,
    loginUser,
    logoutUser,
    getCounselors,
    getMe,
    updateProfile,
    changePassword,
    toSafeUser,
    passwordProblems,
};
