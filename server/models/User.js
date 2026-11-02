const mongoose = require('mongoose');

const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$/;

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80
    },
    // Unique login ID chosen at registration. Optional for legacy accounts created before usernames existed.
    username: {
        type: String,
        lowercase: true,
        trim: true,
        match: [USERNAME_REGEX, 'Username must be 3-30 characters: letters, numbers, dots, dashes or underscores'],
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    // `user` is the default role. `student` is the legacy name of the same role and is still accepted.
    role: {
        type: String,
        enum: ['user', 'student', 'counselor', 'admin'],
        default: 'user'
    },
    speciality: {
        type: String,
        required: false // Only for counselors
    },
    credentials: {
        type: String,
        required: false // Link or text proof for counselors
    },
    isApproved: {
        type: Boolean,
        default: true // Users/Admins are approved by default; counselors are approved by an admin
    },
    // Counselor applications: a registered user can apply; only an admin can grant the counselor role.
    counselorApplication: {
        status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
        speciality: { type: String, maxlength: 200 },
        credentials: { type: String, maxlength: 500 },
        appliedAt: Date,
        reviewedAt: Date,
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    // Incremented to revoke every issued token (password change, role change, "sign out everywhere").
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
    passwordChangedAt: Date,
    isDemoAccount: { type: Boolean, default: false },
    // Opt-in: discreet emails for important in-app notifications (never include sensitive content)
    emailNotifications: { type: Boolean, default: false },
}, { timestamps: true });

userSchema.index({ role: 1, isApproved: 1 });
// Unique only when a username exists, so legacy accounts without one do not collide.
userSchema.index({ username: 1 }, { unique: true, partialFilterExpression: { username: { $type: 'string' } } });
userSchema.index({ 'counselorApplication.status': 1 });

// Never serialize secrets
userSchema.set('toJSON', {
    transform(doc, ret) {
        delete ret.password;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
    },
});

userSchema.statics.USERNAME_REGEX = USERNAME_REGEX;

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

userSchema.statics.normalizeEmail = normalizeEmail;

/**
 * Accounts created by the original registration code stored the email exactly as typed
 * (capital letters, surrounding spaces). New accounts are stored trimmed + lowercase.
 * Returns every account whose email matches case- and whitespace-insensitively,
 * the exact (normalised) match first. The common case is a single indexed lookup.
 */
userSchema.statics.findByEmailCandidates = async function findByEmailCandidates(email, { projection, limit = 5 } = {}) {
    const normalized = normalizeEmail(email);
    if (!normalized) return [];
    const exact = await this.findOne({ email: normalized }, projection);
    const legacy = await this.find(
        {
            email: { $regex: `^\\s*${escapeRegex(normalized)}\\s*$`, $options: 'i' },
            ...(exact ? { _id: { $ne: exact._id } } : {}),
        },
        projection,
    ).limit(limit);
    return exact ? [exact, ...legacy] : legacy;
};

/** The account for an email address (case/whitespace-insensitive), preferring the normalised match. */
userSchema.statics.findByEmail = async function findByEmail(email, options) {
    const [first] = await this.findByEmailCandidates(email, { ...options, limit: 1 });
    return first || null;
};

module.exports = mongoose.model('User', userSchema);
