// EmailDelivery – one record per logical email (idempotent). Tracks provider ACCEPTANCE separately
// from CONFIRMED delivery: "accepted" only means the provider took the message; "delivered" is set
// exclusively by a verified provider webhook. Never stores message bodies, links or tokens.
const mongoose = require('mongoose');

const EMAIL_TYPES = ['password_reset', 'password_changed', 'checkin_reminder', 'notification', 'test', 'feedback'];
const EMAIL_STATUSES = [
    'sending',    // attempt in progress
    'accepted',   // provider accepted the message (NOT proof of delivery)
    'captured',   // development outbox only – written to disk, never sent
    'delivered',  // provider webhook confirmed delivery
    'failed',     // provider/network error after all attempts
    'bounced',    // provider webhook reported a bounce
    'complained', // recipient marked as spam (webhook)
    'skipped',    // not sent (e.g. no email provider configured)
];

const emailDeliverySchema = new mongoose.Schema({
    type: { type: String, enum: EMAIL_TYPES, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    toMasked: String,   // e.g. "d***@example.com"
    toHash: String,     // sha256 of the lowercased address (troubleshooting without storing it)
    subject: String,
    provider: String,
    providerMessageId: String,
    status: { type: String, enum: EMAIL_STATUSES, required: true },
    attempts: { type: Number, default: 0 },
    lastErrorCode: String,
    lastErrorMessage: String,
    retryable: Boolean,
    uncertain: Boolean, // the provider may have accepted the message before the error (no auto-retry)
    skipReason: String,
    idempotencyKey: String,
    acceptedAt: Date,
    deliveredAt: Date,
    failedAt: Date,
    events: [{ type: { type: String }, at: Date, _id: false }],
    isTest: { type: Boolean, default: false },
}, { timestamps: true });

emailDeliverySchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
emailDeliverySchema.index({ providerMessageId: 1 });
emailDeliverySchema.index({ status: 1, createdAt: -1 });
emailDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

emailDeliverySchema.statics.TYPES = EMAIL_TYPES;
emailDeliverySchema.statics.STATUSES = EMAIL_STATUSES;

module.exports = mongoose.model('EmailDelivery', emailDeliverySchema);
