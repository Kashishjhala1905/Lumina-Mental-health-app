const mongoose = require('mongoose');

const meditationHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  meditation: { type: mongoose.Schema.Types.ObjectId, ref: 'Meditation', required: true },
  completedAt: { type: Date, default: Date.now },
  secondsListened: { type: Number, default: 0 },
}, { timestamps: true });

meditationHistorySchema.index({ user: 1, completedAt: -1 });

module.exports = mongoose.model('MeditationHistory', meditationHistorySchema);
