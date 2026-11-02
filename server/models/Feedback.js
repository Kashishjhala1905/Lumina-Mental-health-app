// Feedback – ratings and comments from signed-in users. Stored even if the notification email fails;
// email delivery is tracked separately in `email` (and in EmailDelivery).
const mongoose = require('mongoose');

const FEEDBACK_CATEGORIES = ['Overall Experience', 'Counselling', 'Meditation', 'Exercises', 'Chatbot', 'Community', 'Other'];

const feedbackSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  category: { type: String, enum: FEEDBACK_CATEGORIES, required: true },
  note: { type: String, required: true, trim: true, maxlength: 280 },
  comments: { type: String, trim: true, maxlength: 1000 },
  related: {
    type: { type: String, enum: ['counselor', 'meditation', 'exercise', null], default: null },
    id: { type: mongoose.Schema.Types.ObjectId },
    label: String,
  },
  dedupeHash: { type: String, required: true },
  email: {
    status: { type: String, enum: ['pending', 'accepted', 'captured', 'failed', 'skipped', 'duplicate'], default: 'pending' },
    deliveryId: mongoose.Schema.Types.ObjectId,
    errorCode: String,
    attemptedAt: Date,
  },
}, { timestamps: true });

feedbackSchema.index({ user: 1, createdAt: -1 });
feedbackSchema.index({ user: 1, dedupeHash: 1, createdAt: -1 });
feedbackSchema.index({ 'related.type': 1, 'related.id': 1 });
feedbackSchema.index({ createdAt: -1 });

feedbackSchema.statics.CATEGORIES = FEEDBACK_CATEGORIES;

module.exports = mongoose.model('Feedback', feedbackSchema);
