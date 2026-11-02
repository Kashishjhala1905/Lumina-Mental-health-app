const mongoose = require('mongoose');

const EXERCISE_CATEGORIES = [
  'Breathing Exercises',
  'Grounding Techniques',
  'Mindfulness Exercises',
  'Physical Relaxation',
  'Focus Exercises',
  'Emotional Wellness Activities',
  'Stress Management Exercises',
];

const exerciseSchema = new mongoose.Schema({
  // Stable identifier used for seeding/upserts (unique among records that have one)
  slug: { type: String, trim: true },
  title: { type: String, required: true },
  description: { type: String },
  category: { type: String, required: true },
  instructions: [{ type: String }],
  duration: { type: Number, required: true }, // seconds
  difficulty: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' },
  icon: { type: String, default: 'Sparkles' }, // lucide-react icon name used by the client
  sortOrder: { type: Number, default: 100 },
  // Inactive records are hidden (e.g. duplicates created by an old seeding race) – never deleted
  active: { type: Boolean, default: true },
}, { timestamps: true });

exerciseSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: 'string' } } });
exerciseSchema.index({ active: 1, category: 1, sortOrder: 1 });

exerciseSchema.statics.CATEGORIES = EXERCISE_CATEGORIES;

module.exports = mongoose.model('Exercise', exerciseSchema);
