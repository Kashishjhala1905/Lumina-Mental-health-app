// Counselor – admin-managed counsellor DIRECTORY profile (separate from counselor user accounts).
// Only `verificationStatus: 'verified'` profiles are presented as professionals. Demo profiles are fictional,
// always labelled, and never marked verified. Ratings come only from genuine user feedback.
const mongoose = require('mongoose');

const DAYS = [0, 1, 2, 3, 4, 5, 6]; // Sunday … Saturday
const SLOT_RE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

const counselorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  city: { type: String, required: true, trim: true, maxlength: 60 },
  cityNormalized: { type: String, index: true },
  specialization: [{ type: String, required: true, trim: true }],
  qualifications: { type: String, trim: true, maxlength: 300 },
  certifications: { type: String, trim: true, maxlength: 300 },
  experienceYears: { type: Number, min: 0, max: 70, default: 0 },
  languages: [{ type: String, trim: true }],
  consultationModes: [{ type: String, enum: ['online', 'offline'] }],
  feePerHour: { type: Number, min: 0 },
  profilePhoto: { type: String, trim: true },
  bio: { type: String, trim: true, maxlength: 1000 },
  // Weekly availability, e.g. { day: 1, slots: ['10:00-11:00'] }. Only "verified" once an admin confirms it.
  weeklySlots: [{ day: { type: Number, enum: DAYS }, slots: [{ type: String, match: SLOT_RE }], _id: false }],
  availabilityVerifiedAt: Date,
  availabilityVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verificationStatus: { type: String, enum: ['pending', 'verified', 'suspended'], default: 'pending' },
  verifiedAt: Date,
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isDemo: { type: Boolean, default: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // optional link to a counselor account
  // Genuine ratings only (aggregated from Feedback by users who booked this counsellor)
  ratingAverage: { type: Number, min: 0, max: 5, default: null },
  ratingCount: { type: Number, default: 0 },
  // ---- legacy fields (kept for existing records; never shown to users) ----
  rating: { type: Number, min: 0, max: 5, default: 0 },
  availability: [{ date: { type: Date }, slots: [{ type: String }] }],
  reviews: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

counselorSchema.pre('validate', function normaliseCity() {
  if (this.city) this.cityNormalized = this.city.trim().toLowerCase();
});

counselorSchema.index({ verificationStatus: 1, isDemo: 1, cityNormalized: 1 });
counselorSchema.index({ specialization: 1 });
counselorSchema.index({ languages: 1 });
counselorSchema.index({ consultationModes: 1 });
// Prevents duplicate demo profiles if two requests seed at the same time
counselorSchema.index({ name: 1 }, { unique: true, partialFilterExpression: { isDemo: true }, name: 'unique_demo_name' });

counselorSchema.statics.SLOT_RE = SLOT_RE;

module.exports = mongoose.model('Counselor', counselorSchema);
