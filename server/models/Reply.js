const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  comment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  isAnonymous: { type: Boolean, default: false }, // author hidden in public responses
}, { timestamps: true });

replySchema.index({ comment: 1, createdAt: 1 });

module.exports = mongoose.model('Reply', replySchema);
