// MoodEntry – the user's DAILY CHECK-IN (collection kept for backwards compatibility with the mood tracker).
// One check-in per user per LOCAL calendar day; re-submitting the same day edits it.
//   date       = UTC midnight of the user's local date (used for the uniqueness rule and calendars)
//   localDate  = 'YYYY-MM-DD' in the user's timezone
//   checkinAt  = exact time of the (latest) submission, stored in UTC
const mongoose = require('mongoose');

const scale = { type: Number, min: 1, max: 5, default: null };

const moodEntrySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mood: { type: String, enum: ['happy', 'sad', 'angry', 'anxious', 'neutral'], required: true },
  emotionalState: scale, // 1 very low … 5 very good
  stressLevel: scale,    // 1 none … 5 extreme
  energyLevel: scale,    // 1 exhausted … 5 energised
  sleepQuality: scale,   // 1 very poor … 5 very good
  notes: { type: String, maxlength: 1000 }, // optional journal note (private to the user)
  tags: [{ type: String }],
  date: { type: Date, default: Date.now, required: true },
  localDate: { type: String },
  timezone: { type: String },
  checkinAt: { type: Date },
  editedAt: { type: Date },
}, { timestamps: true });

// Ensure one entry per user per day
moodEntrySchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('MoodEntry', moodEntrySchema);
