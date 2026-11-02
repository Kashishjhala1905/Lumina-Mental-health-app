// Feedback & ratings. Feedback is ALWAYS stored first; the notification email is attempted afterwards and
// its outcome tracked separately (never claims delivery – only provider acceptance).
const crypto = require('crypto');
const mongoose = require('mongoose');
const Feedback = require('../models/Feedback');
const Counselor = require('../models/Counselor');
const Booking = require('../models/Booking');
const Meditation = require('../models/Meditation');
const Exercise = require('../models/Exercise');
const { sendEmail } = require('../services/email/emailService');
const { refreshCounselorRating } = require('../services/counselorDirectory');
const { dateRange } = require('../utils/dateRange');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const str = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

const serialize = (f) => ({
  _id: f._id, rating: f.rating, category: f.category, note: f.note, comments: f.comments || '',
  related: f.related?.type ? { type: f.related.type, id: f.related.id, label: f.related.label } : null,
  emailStatus: f.email?.status || 'pending', createdAt: f.createdAt,
});

async function resolveRelated(type, id, userId) {
  if (!type) return { related: { type: null } };
  if (!mongoose.isValidObjectId(id)) return { error: 'Please choose the item your feedback is about' };
  if (type === 'counselor') {
    const counselor = await Counselor.findById(id).select('name').lean();
    if (!counselor) return { error: 'Counsellor not found' };
    // Only people who booked this counsellor can rate them – keeps ratings genuine
    const booked = await Booking.exists({ user: userId, counselor: id, status: { $ne: 'cancelled' } });
    if (!booked) return { error: 'You can rate a counsellor after booking a session with them.', status: 403 };
    return { related: { type, id: counselor._id, label: counselor.name } };
  }
  const Model = type === 'meditation' ? Meditation : type === 'exercise' ? Exercise : null;
  if (!Model) return { error: 'Invalid related item type' };
  const doc = await Model.findById(id).select('title').lean();
  if (!doc) return { error: 'Resource not found' };
  return { related: { type, id: doc._id, label: doc.title } };
}

// POST /api/feedback   { rating, category, note, comments?, relatedType?, relatedId? }
const submitFeedback = async (req, res) => {
  const errors = {};
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = 'Please choose a rating from 1 to 5 stars';
  const category = req.body.category;
  if (!Feedback.CATEGORIES.includes(category)) errors.category = 'Please choose a feedback category';
  const note = str(req.body.note, 400);
  if (!note) errors.note = 'Please write a short note';
  else if (note.length > 280) errors.note = 'Please keep the note under 280 characters';
  const comments = typeof req.body.comments === 'string' ? req.body.comments.trim().slice(0, 1200) : '';
  if (comments.length > 1000) errors.comments = 'Comments must be 1000 characters or fewer';
  if (Object.keys(errors).length) return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });

  const relatedType = ['counselor', 'meditation', 'exercise'].includes(req.body.relatedType) ? req.body.relatedType : null;
  const resolved = await resolveRelated(relatedType, req.body.relatedId, req.user._id);
  if (resolved.error) return res.status(resolved.status || 400).json({ success: false, message: resolved.error, errors: { related: resolved.error } });

  // Duplicate protection: the same feedback from the same user within 24 hours
  const dedupeHash = crypto.createHash('sha256').update([rating, category, note.toLowerCase(), resolved.related.type, String(resolved.related.id || '')].join('|')).digest('hex');
  const duplicate = await Feedback.findOne({ user: req.user._id, dedupeHash, createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) } }).lean();
  if (duplicate) return res.status(409).json({ success: false, code: 'DUPLICATE', message: 'You have already sent this feedback. Thank you!', data: serialize(duplicate) });

  const feedback = await Feedback.create({ user: req.user._id, rating, category, note, comments: comments || undefined, related: resolved.related, dedupeHash, email: { status: 'pending' } });
  if (resolved.related.type === 'counselor') await refreshCounselorRating(resolved.related.id);

  // Notification email (failure never affects the stored feedback)
  const to = (process.env.FEEDBACK_NOTIFICATION_EMAIL || '').trim();
  let email;
  if (!EMAIL_RE.test(to)) {
    email = { status: 'skipped', errorCode: 'recipient_not_configured', attemptedAt: new Date() };
  } else {
    try {
      const result = await sendEmail({
        to,
        type: 'feedback',
        idempotencyKey: `feedback:${feedback._id}`,
        data: {
          feedbackId: String(feedback._id),
          rating,
          category,
          note,
          comments,
          related: resolved.related.type ? { type: resolved.related.type === 'counselor' ? 'counsellor' : resolved.related.type, label: resolved.related.label } : null,
          submittedAt: `${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST (${new Date().toISOString()})`,
        },
      });
      email = { status: result.status === 'duplicate' ? 'duplicate' : result.status, deliveryId: result.deliveryId, errorCode: result.errorCode, attemptedAt: new Date() };
    } catch (err) {
      console.error('Feedback email error:', err.message);
      email = { status: 'failed', errorCode: 'internal_error', attemptedAt: new Date() };
    }
  }
  feedback.email = email;
  await feedback.save();

  const messages = {
    accepted: 'Thank you! Your feedback was saved and the team has been notified.',
    captured: 'Thank you! Your feedback was saved.',
  };
  res.status(201).json({ success: true, message: messages[email.status] || 'Thank you! Your feedback was saved.', data: serialize(feedback) });
};

// GET /api/feedback/mine?page=
const listMyFeedback = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const filter = { user: req.user._id };
  const range = dateRange(req.query);
  if (range) filter.createdAt = range;
  const [total, rows] = await Promise.all([
    Feedback.countDocuments(filter),
    Feedback.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  res.json({ success: true, data: rows.map(serialize), pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
};

// GET /api/feedback/options – things a user can attach feedback to
const getOptions = async (req, res) => {
  const counselorIds = await Booking.distinct('counselor', { user: req.user._id, status: { $ne: 'cancelled' } });
  const [counselors, meditations, exercises] = await Promise.all([
    Counselor.find({ _id: { $in: counselorIds } }).select('name isDemo').lean(),
    Meditation.find({ active: true }).select('title').sort({ sortOrder: 1 }).lean(),
    Exercise.find({ active: true }).select('title').sort({ sortOrder: 1 }).lean(),
  ]);
  res.json({ success: true, data: { categories: Feedback.CATEGORIES, counselors, meditations, exercises } });
};

// GET /api/admin/feedback?rating=&category=&page=   (no user identities)
const adminListFeedback = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = 20;
  const filter = {};
  if (/^[1-5]$/.test(String(req.query.rating || ''))) filter.rating = Number(req.query.rating);
  if (Feedback.CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
  const [total, rows, stats] = await Promise.all([
    Feedback.countDocuments(filter),
    Feedback.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Feedback.aggregate([{ $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } }]),
  ]);
  res.json({
    success: true,
    data: rows.map(serialize),
    stats: stats[0] ? { count: stats[0].count, averageRating: Math.round(stats[0].avg * 10) / 10 } : { count: 0, averageRating: null },
    notificationRecipientConfigured: EMAIL_RE.test((process.env.FEEDBACK_NOTIFICATION_EMAIL || '').trim()),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
};

module.exports = { submitFeedback, listMyFeedback, getOptions, adminListFeedback };
