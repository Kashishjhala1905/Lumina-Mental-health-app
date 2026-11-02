// ReminderEvent – lifecycle of each check-in reminder: scheduled → sent | failed | skipped.
// At most one "scheduled" event exists per user; processed events keep per-channel results.
const mongoose = require('mongoose');

const REMINDER_STATUSES = ['scheduled', 'sent', 'failed', 'skipped'];

const reminderEventSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    caseRef: String,
    scheduledFor: { type: Date, required: true },
    status: { type: String, enum: REMINDER_STATUSES, default: 'scheduled' },
    skipReason: {
        type: String,
        enum: [null, 'recent_checkin', 'consent_withdrawn', 'disabled_by_user', 'duplicate', 'no_channel_available', 'rescheduled', 'data_deleted'],
        default: null,
    },
    localDate: String, // YYYY-MM-DD in the user's timezone
    dedupeKey: String,
    channels: {
        inApp: { status: { type: String, enum: [null, 'sent', 'duplicate', 'disabled', 'failed'], default: null }, notificationId: mongoose.Schema.Types.ObjectId },
        email: { status: { type: String, enum: [null, 'accepted', 'captured', 'delivered', 'failed', 'duplicate', 'disabled', 'not_configured', 'skipped'], default: null }, deliveryId: mongoose.Schema.Types.ObjectId, errorCode: String },
    },
    processedAt: Date,
}, { timestamps: true });

reminderEventSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: 'scheduled' }, name: 'one_scheduled_reminder_per_user' });
reminderEventSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
reminderEventSchema.index({ userId: 1, scheduledFor: -1 });
reminderEventSchema.index({ status: 1, createdAt: -1 });

reminderEventSchema.statics.STATUSES = REMINDER_STATUSES;

module.exports = mongoose.model('ReminderEvent', reminderEventSchema);
