// Conversation – a signed-in user's AI chat history. Visible ONLY to its owner (never shared with
// counselors or administrators). Message text is encrypted at rest when DATA_ENCRYPTION_KEY is set.
const mongoose = require('mongoose');

const MAX_MESSAGES = 400;

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const conversationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, trim: true, maxlength: 80, default: 'New conversation' },
  messages: [messageSchema],
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });

conversationSchema.index({ user: 1, lastMessageAt: -1 });

conversationSchema.statics.MAX_MESSAGES = MAX_MESSAGES;

module.exports = mongoose.model('Conversation', conversationSchema);
