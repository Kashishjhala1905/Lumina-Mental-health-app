const mongoose = require('mongoose');

const exerciseHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  exercise: { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise', required: true },
  completedAt: { type: Date, default: Date.now },
  duration: { type: Number },
}, { timestamps: true });

exerciseHistorySchema.index({ user: 1, completedAt: -1 });

module.exports = mongoose.model('ExerciseHistory', exerciseHistorySchema);
