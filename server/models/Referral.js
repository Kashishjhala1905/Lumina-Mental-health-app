// Referral – internal referral to a support service, tracked by the assigned counselor.
// Users see non-sensitive status information only; private counselor notes and internal reasons stay hidden.
// External transmission is never automatic (see services/integrations/externalReferralService.js).
const mongoose = require('mongoose');
const { SUPPORT_CATEGORIES } = require('./SupportPlan');

const REFERRAL_STATUSES = ['Suggested', 'Accepted', 'Referred', 'Follow-up Pending', 'Completed', 'Unable to Connect'];
const CLOSED_STATUSES = ['Completed', 'Unable to Connect'];

const noteSchema = new mongoose.Schema({
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: String,
    note: String, // encrypted at rest
}, { timestamps: true });

const statusChangeSchema = new mongoose.Schema({
    from: String,
    to: String,
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
}, { _id: false });

const referralSchema = new mongoose.Schema({
    referralRef: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    caseRef: { type: String, required: true },
    counselorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // assigned counselor
    supportPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportPlan' },
    supportPlanItemId: mongoose.Schema.Types.ObjectId,
    category: { type: String, enum: SUPPORT_CATEGORIES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 1000 }, // visible to the user
    organization: {
        directoryId: String, // entry in config/supportDirectory.js, if any
        name: { type: String, trim: true, maxlength: 140 },
        contact: { type: String, trim: true, maxlength: 200 },
        website: { type: String, trim: true, maxlength: 300 },
    },
    status: { type: String, enum: REFERRAL_STATUSES, default: 'Suggested' },
    statusHistory: [statusChangeSchema],
    followUpDate: Date,
    userVisibleUpdate: { type: String, trim: true, maxlength: 300 }, // short, non-sensitive message for the user
    counselorNotes: [noteSchema], // private
    outcome: {
        confirmed: { type: Boolean, default: false },
        note: String, // private: how completion was confirmed (encrypted)
        confirmedAt: Date,
    },
    unableReason: String, // private (encrypted)
    userConsentToShare: { type: Boolean, default: false }, // required before ANY external transmission
    userConsentChangedAt: Date,
    integration: {
        status: { type: String, enum: ['not_connected', 'submitted', 'failed'], default: 'not_connected' },
        provider: String,
        externalReference: String,
        lastAttemptAt: Date,
        lastResult: String,
    },
    closedAt: Date,
    isSynthetic: { type: Boolean, default: false },
}, { timestamps: true });

referralSchema.index({ counselorId: 1, status: 1, updatedAt: -1 });
referralSchema.index({ userId: 1, createdAt: -1 });
referralSchema.index({ caseRef: 1, createdAt: -1 });

referralSchema.statics.STATUSES = REFERRAL_STATUSES;
referralSchema.statics.CLOSED_STATUSES = CLOSED_STATUSES;

module.exports = mongoose.model('Referral', referralSchema);
