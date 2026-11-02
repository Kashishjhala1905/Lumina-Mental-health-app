// SupportPlan – personalised support / rehabilitation plan created by the assigned counselor.
// Users can see the plan (title, summary, items, statuses) but never the counselor's private notes.
const mongoose = require('mongoose');

const SUPPORT_CATEGORIES = [
    'Mental health counseling',
    'Medical/professional assistance',
    'Legal aid information',
    'Safety and protection resources',
    'Relocation assistance information',
    'Financial assistance information',
    'Rehabilitation support',
    'Social and community support',
];
const ITEM_STATUSES = ['Suggested', 'Accepted', 'Referred', 'Follow-up Pending', 'Completed', 'Unable to Connect'];
// Categories that depend on an external service; marking them Completed requires explicit confirmation.
const EXTERNAL_CATEGORIES = [
    'Medical/professional assistance',
    'Legal aid information',
    'Safety and protection resources',
    'Relocation assistance information',
    'Financial assistance information',
    'Rehabilitation support',
];

const itemSchema = new mongoose.Schema({
    category: { type: String, enum: SUPPORT_CATEGORIES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 1000 }, // visible to the user
    status: { type: String, enum: ITEM_STATUSES, default: 'Suggested' },
    referral: {
        organization: { type: String, trim: true, maxlength: 140 },
        contactInfo: { type: String, trim: true, maxlength: 200 },
        referredAt: Date,
    },
    externalConfirmation: {
        confirmed: { type: Boolean, default: false },
        confirmedAt: Date,
        confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: { type: String, trim: true, maxlength: 500 },
    },
    followUpDate: Date,
    privateNote: String, // counselor-only, encrypted at rest
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const supportPlanSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    caseRef: { type: String, required: true },
    counselorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    summary: { type: String, trim: true, maxlength: 2000 }, // visible to the user
    status: { type: String, enum: ['active', 'completed', 'archived'], default: 'active' },
    items: [itemSchema],
    isSynthetic: { type: Boolean, default: false },
}, { timestamps: true });

supportPlanSchema.index({ userId: 1, status: 1 });
supportPlanSchema.index({ counselorId: 1, updatedAt: -1 });

supportPlanSchema.statics.SUPPORT_CATEGORIES = SUPPORT_CATEGORIES;
supportPlanSchema.statics.ITEM_STATUSES = ITEM_STATUSES;
supportPlanSchema.statics.EXTERNAL_CATEGORIES = EXTERNAL_CATEGORIES;

module.exports = mongoose.model('SupportPlan', supportPlanSchema);
