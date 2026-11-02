const mongoose = require('mongoose');

// Sessions ended with "Sign out". The token id (jti) is kept only until the token would have
// expired anyway; MongoDB's TTL monitor then deletes the record automatically.
const revokedTokenSchema = new mongoose.Schema({
    jti: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RevokedToken', revokedTokenSchema);
