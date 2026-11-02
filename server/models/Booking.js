const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  counselor: { type: mongoose.Schema.Types.ObjectId, ref: 'Counselor', required: true },
  date: { type: Date, required: true },
  timeSlot: { type: String, required: true }, // e.g., "09:00-09:30"
  concern: { type: String },
  status: { type: String, enum: ['pending', 'confirmed', 'completed', 'cancelled'], default: 'pending' },
}, { timestamps: true });

bookingSchema.index({ user: 1, status: 1, date: 1 });
bookingSchema.index({ counselor: 1, date: 1, timeSlot: 1 }, { unique: true });

module.exports = mongoose.model('Booking', bookingSchema);
