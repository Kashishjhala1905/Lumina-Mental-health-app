// VictimSupportConsent – consent + enrollment record for the Confidential Victim Support module.
// One document per user. It also acts as the pseudonymous "case" (caseRef) that counselors are assigned to.
const mongoose = require('mongoose');

const CONSENT_VERSION = '1.0';

const historySchema = new mongoose.Schema({
    action: {
        type: String,
        enum: ['granted', 'withdrawn', 'preferences_updated', 'data_deleted', 'counselor_assigned'],
        required: true,
    },
    at: { type: Date, default: Date.now },
    consentVersion: String,
}, { _id: false });

const victimSupportConsentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    // Pseudonymous case reference used in admin views, alerts and audit logs instead of names.
    caseRef: { type: String, required: true, unique: true },
    status: { type: String, enum: ['active', 'withdrawn'], required: true },
    consentVersion: { type: String, default: CONSENT_VERSION },
    acknowledgements: {
        dataCollection: { type: Boolean, default: false },
        dataUsage: { type: Boolean, default: false },
        authorizedAccess: { type: Boolean, default: false },
        notEmergencyService: { type: Boolean, default: false },
        prototypeNotice: { type: Boolean, default: false },
    },
    // Optional processing of free-text comments by the AI model.
    allowAiAnalysis: { type: Boolean, default: true },
    // Optional, self-reported; used only for aggregate (k-anonymised) statistics.
    district: { type: String, trim: true, maxlength: 80 },
    grantedAt: Date,
    withdrawnAt: Date,
    withdrawalDataChoice: { type: String, enum: ['retain', 'delete'] },
    dataDeletedAt: Date,
    assignedCounselor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt: Date,
    // Denormalised monitoring snapshot for dashboards
    latestCategory: String,
    latestScore: Number,
    lastCheckinAt: Date,
    checkinCount: { type: Number, default: 0 },
    isSynthetic: { type: Boolean, default: false },
    history: [historySchema],
}, { timestamps: true });

victimSupportConsentSchema.index({ status: 1, assignedCounselor: 1 });
victimSupportConsentSchema.index({ district: 1 });

victimSupportConsentSchema.statics.CONSENT_VERSION = CONSENT_VERSION;

module.exports = mongoose.model('VictimSupportConsent', victimSupportConsentSchema);
