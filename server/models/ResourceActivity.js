// ResourceActivity – a user's own wellness-resource usage (meditation audio, exercises, strategies).
// Records only what is needed for "My History": no device data, no location, no free text.
const mongoose = require('mongoose');

const RESOURCE_TYPES = ['meditation', 'exercise', 'strategy'];
const ACTIVITY_TYPES = ['audio_played', 'exercise_session', 'strategy_viewed'];
const STATUSES = ['started', 'completed', 'abandoned', 'viewed'];

const resourceActivitySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  resourceType: { type: String, enum: RESOURCE_TYPES, required: true },
  resourceId: { type: mongoose.Schema.Types.ObjectId }, // Meditation / Exercise document (strategies are static content)
  resourceKey: { type: String, required: true },        // stable slug, survives re-seeding
  title: { type: String, required: true },
  category: String,
  activityType: { type: String, enum: ACTIVITY_TYPES, required: true },
  status: { type: String, enum: STATUSES, default: 'started' },
  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
  durationSeconds: { type: Number, default: 0, min: 0 },  // time actually spent / listened
  targetSeconds: Number,                                   // planned duration of the exercise / track
}, { timestamps: true });

resourceActivitySchema.index({ user: 1, startedAt: -1 });
resourceActivitySchema.index({ user: 1, resourceType: 1, startedAt: -1 });

resourceActivitySchema.statics.RESOURCE_TYPES = RESOURCE_TYPES;

module.exports = mongoose.model('ResourceActivity', resourceActivitySchema);
