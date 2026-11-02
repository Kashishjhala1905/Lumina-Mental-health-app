// PasswordResetToken – single-use, short-lived reset tokens. Only a SHA-256 hash of the token is stored;
// the raw token exists only in the email link.
const mongoose = require('mongoose');

const passwordResetTokenSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    invalidatedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

passwordResetTokenSchema.index({ userId: 1, createdAt: -1 });
// Housekeeping: remove token records one day after they expire
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model('PasswordResetToken', passwordResetTokenSchema);
