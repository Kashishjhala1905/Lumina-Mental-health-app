const mongoose = require('mongoose');

const MEDITATION_CATEGORIES = [
  'Guided Meditation',
  'Deep Relaxation',
  'Sleep Music',
  'Stress Relief',
  'Breathing Meditation',
  'Mindfulness',
  'Focus and Concentration',
  'Nature Sounds',
];

const meditationSchema = new mongoose.Schema({
  // Stable identifier used for seeding/upserts (unique among records that have one)
  slug: { type: String, trim: true },
  title: { type: String, required: true },
  description: { type: String },
  url: { type: String, required: true }, // audio file URL (served by the client app)
  category: { type: String, required: true },
  duration: { type: Number, required: true }, // seconds
  // On-screen guidance synchronised with playback (guided / breathing tracks)
  guide: [{ at: Number, text: String, _id: false }],
  breathing: { inhale: Number, exhale: Number },
  source: String,
  license: String,
  isShortLoop: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 100 },
  // Inactive records are hidden (e.g. duplicates created by an old seeding race) – never deleted
  active: { type: Boolean, default: true },
}, { timestamps: true });

meditationSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: 'string' } } });
meditationSchema.index({ active: 1, category: 1, sortOrder: 1 });

meditationSchema.statics.CATEGORIES = MEDITATION_CATEGORIES;

module.exports = mongoose.model('Meditation', meditationSchema);
