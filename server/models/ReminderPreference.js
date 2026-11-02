// ReminderPreference – user-controlled check-in reminder settings.
// A single centralised scheduler (services/reminderScheduler.js) processes all due reminders.
const mongoose = require('mongoose');

const FREQUENCIES = { daily: 1, every_3_days: 3, weekly: 7 };

const reminderPreferenceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    enabled: { type: Boolean, default: false },
    frequency: { type: String, enum: Object.keys(FREQUENCIES), default: 'every_3_days' },
    preferredHour: { type: Number, min: 0, max: 23, default: 10 },
    timezone: { type: String, default: 'Asia/Kolkata' },
    channels: {
        inApp: { type: Boolean, default: true },
        email: { type: Boolean, default: false },
    },
    nextReminderAt: Date,
    lastReminderAt: Date,
    pausedReason: { type: String, enum: ['consent_withdrawn', null], default: null },
}, { timestamps: true });

reminderPreferenceSchema.index({ enabled: 1, nextReminderAt: 1 });

reminderPreferenceSchema.statics.FREQUENCIES = FREQUENCIES;

module.exports = mongoose.model('ReminderPreference', reminderPreferenceSchema);
