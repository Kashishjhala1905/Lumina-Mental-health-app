const mongoose = require('mongoose');

const POST_CATEGORIES = ['General', 'Stress & Anxiety', 'Studies & Work', 'Relationships', 'Self-care', 'Motivation', 'Gratitude', 'Other'];
const REPORT_REASONS = ['Harassment or bullying', 'Harmful or unsafe content', 'Shares personal information', 'Spam', 'Other'];

const postSchema = new mongoose.Schema({
  // Real author – stored privately for ownership and moderation. NEVER returned for anonymous posts.
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, trim: true, maxlength: 120 },
  content: { type: String, required: true },
  category: { type: String, enum: POST_CATEGORIES, default: 'General' },
  identity: { type: String, enum: ['public', 'anonymous'], default: 'public' },
  status: { type: String, enum: ['published', 'hidden', 'removed'], default: 'published' },
  flaggedForReview: { type: Boolean, default: false },
  moderationNote: { type: String, maxlength: 300 },
  moderatedAt: Date,
  editedAt: Date,
  media: { type: String }, // optional image/video URL (legacy field)
  reports: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: String,
    createdAt: { type: Date, default: Date.now }
  }],
  likesCount: { type: Number, default: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  commentsCount: { type: Number, default: 0 },
}, { timestamps: true });

postSchema.index({ createdAt: -1 });
postSchema.index({ likesCount: -1, createdAt: -1 });
postSchema.index({ status: 1, category: 1, createdAt: -1 });
postSchema.index({ user: 1, createdAt: -1 });

postSchema.statics.CATEGORIES = POST_CATEGORIES;
postSchema.statics.REPORT_REASONS = REPORT_REASONS;

module.exports = mongoose.model('Post', postSchema);
