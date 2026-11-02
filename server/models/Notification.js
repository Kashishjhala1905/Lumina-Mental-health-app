// Notification – in-app notifications (reminders, alert assignments, plan updates).
// Messages never contain check-in content; they link to the relevant page instead.
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
        type: String,
        enum: ['checkin_reminder', 'alert_created', 'alert_updated', 'case_assigned', 'support_plan_updated', 'consent', 'system'],
        required: true,
    },
    title: { type: String, required: true, maxlength: 140 },
    message: { type: String, maxlength: 500 },
    link: String,
    read: { type: Boolean, default: false },
    readAt: Date,
    // Prevents duplicate notifications for the same event (e.g. one reminder per user per period)
    dedupeKey: String,
}, { timestamps: true });

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
// Housekeeping: notifications expire after 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('Notification', notificationSchema);
