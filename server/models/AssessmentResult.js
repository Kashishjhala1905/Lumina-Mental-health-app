// AssessmentResult – every completed self-assessment is stored as a new record (never overwritten).
const mongoose = require('mongoose');

const assessmentResultSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assessmentType: { type: String, default: 'wellness-check' },
  version: { type: String, required: true },
  answers: [{
    questionId: String,
    question: String,
    area: String,
    value: { type: Number, min: 1, max: 5 },
    wellbeingValue: { type: Number, min: 1, max: 5 },
    _id: false,
  }],
  score: { type: Number, min: 0, max: 100, required: true },
  result: { type: String, required: true },
  recommendations: [String],
  completedAt: { type: Date, default: Date.now },
}, { timestamps: true });

assessmentResultSchema.index({ user: 1, completedAt: -1 });

module.exports = mongoose.model('AssessmentResult', assessmentResultSchema);
