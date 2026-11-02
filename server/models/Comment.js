const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  isAnonymous: { type: Boolean, default: false }, // author hidden in public responses
  replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Reply' }],
}, { timestamps: true });

commentSchema.index({ post: 1, createdAt: 1 });

module.exports = mongoose.model('Comment', commentSchema);
