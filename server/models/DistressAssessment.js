// DistressAssessment – explainable, rule-based monitoring score for one check-in, plus optional AI text analysis.
// PROTOTYPE monitoring indicator – not a clinically validated diagnostic tool.
const mongoose = require('mongoose');

const CATEGORIES = ['Low Concern', 'Moderate Concern', 'High Concern', 'Urgent Support Needed'];

const factorSchema = new mongoose.Schema({
    key: String,
    label: String,
    points: Number,
    detail: String,
}, { _id: false });

const aiSchema = new mongoose.Schema({
    status: { type: String, enum: ['completed', 'skipped', 'disabled', 'unavailable'], default: 'skipped' },
    emotionalIndicators: [String],
    distressSignals: [String],
    supportNeeds: [String],
    evidence: [String], // verbatim excerpts – encrypted at rest
    confidence: { type: String, enum: ['low', 'medium', 'high', null], default: null },
    uncertaintyNotes: [String],
    humanReviewRecommended: { type: Boolean, default: false },
    summary: String, // encrypted at rest
    model: String,
    analyzedAt: Date,
    reason: String, // why skipped/unavailable
}, { _id: false });

const distressAssessmentSchema = new mongoose.Schema({
    checkinId: { type: mongoose.Schema.Types.ObjectId, ref: 'WellbeingCheckin', required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    caseRef: { type: String, required: true },
    score: { type: Number, min: 0, max: 100, required: true },
    // Score from this check-in's answers alone (before longitudinal factors); used for trend comparison.
    baseScore: { type: Number, min: 0, max: 100 },
    category: { type: String, enum: CATEGORIES, required: true },
    previousCategory: { type: String, enum: [...CATEGORIES, null], default: null },
    factors: [factorSchema],
    overridesApplied: [String],
    trend: {
        direction: { type: String, enum: ['baseline', 'improving', 'stable', 'worsening'], default: 'baseline' },
        delta: Number,
        comparedToAverage: Number,
        basedOnCheckins: Number,
    },
    explanation: String,
    recommendedAction: String,
    crisisLanguageDetected: { type: Boolean, default: false },
    ruleVersion: { type: String, required: true },
    ai: { type: aiSchema, default: () => ({}) },
    isSynthetic: { type: Boolean, default: false },
}, { timestamps: true });

distressAssessmentSchema.index({ userId: 1, createdAt: -1 });
distressAssessmentSchema.index({ category: 1, createdAt: -1 });

distressAssessmentSchema.statics.CATEGORIES = CATEGORIES;

module.exports = mongoose.model('DistressAssessment', distressAssessmentSchema);
