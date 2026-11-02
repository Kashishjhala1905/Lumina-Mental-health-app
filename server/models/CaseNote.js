// CaseNote – private counselor notes and follow-up actions for a victim-support case. Never visible to users.
const mongoose = require('mongoose');

const caseNoteSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    caseRef: { type: String, required: true },
    counselorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    alertId: { type: mongoose.Schema.Types.ObjectId, ref: 'RiskAlert' },
    type: { type: String, enum: ['note', 'follow_up'], required: true },
    content: { type: String, required: true }, // encrypted at rest
    followUpDate: Date,
    followUpStatus: { type: String, enum: ['pending', 'completed', null], default: null },
    completedAt: Date,
    isSynthetic: { type: Boolean, default: false },
}, { timestamps: true });

caseNoteSchema.index({ caseRef: 1, createdAt: -1 });
caseNoteSchema.index({ counselorId: 1, type: 1, followUpStatus: 1 });

module.exports = mongoose.model('CaseNote', caseNoteSchema);
