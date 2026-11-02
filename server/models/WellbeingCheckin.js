// WellbeingCheckin – a single periodic self-report in the Victim Support module.
// Scales are 1-5. For emotionalState, sleepQuality and dailyFunctioning 5 is best;
// for stressLevel and anxietyLevel 5 is the most intense. Optional questions may be skipped (null).
const mongoose = require('mongoose');

const scale = (required = false) => ({ type: Number, min: 1, max: 5, required, default: required ? undefined : null });

const wellbeingCheckinSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    caseRef: { type: String, required: true },
    emotionalState: scale(true),
    stressLevel: scale(true),
    anxietyLevel: scale(true),
    safetyConcern: {
        type: String,
        enum: ['safe', 'somewhat_unsafe', 'unsafe', 'prefer_not_to_say', null],
        default: null,
    },
    sleepQuality: scale(),
    dailyFunctioning: scale(),
    socialSupport: {
        type: String,
        enum: ['strong', 'some', 'none', 'prefer_not_to_say', null],
        default: null,
    },
    needsProfessionalHelp: {
        type: String,
        enum: ['yes', 'no', 'unsure', null],
        default: null,
    },
    requestCounselorContact: { type: Boolean, default: false },
    // Optional free text, encrypted at rest when DATA_ENCRYPTION_KEY is configured.
    comments: { type: String },
    hasComment: { type: Boolean, default: false },
    isSynthetic: { type: Boolean, default: false },
}, { timestamps: true });

wellbeingCheckinSchema.index({ userId: 1, createdAt: -1 });
wellbeingCheckinSchema.index({ createdAt: -1 });

module.exports = mongoose.model('WellbeingCheckin', wellbeingCheckinSchema);
