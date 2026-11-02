// Daily check-ins (stored in the MoodEntry collection, which the original mood tracker already used).
// Rule: one check-in per user per LOCAL calendar day. A second submission the same day is rejected
// (prevents accidental duplicates); the user edits the existing check-in instead.
const mongoose = require('mongoose');
const MoodEntry = require('../models/MoodEntry');
const { isValidTimeZone, localDateKey } = require('../utils/timezone');

const MOODS = ['happy', 'sad', 'angry', 'anxious', 'neutral'];
const SCALES = ['emotionalState', 'stressLevel', 'energyLevel', 'sleepQuality'];

const tzOf = (tz) => (isValidTimeZone(tz) ? tz : 'UTC');
const dateForKey = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };

/** Validates editable fields; returns { fields, errors }. */
function pickCheckinFields(body = {}, { requireMood = false } = {}) {
  const fields = {};
  const errors = {};
  if (body.mood !== undefined || requireMood) {
    if (!MOODS.includes(body.mood)) errors.mood = `Mood must be one of: ${MOODS.join(', ')}`;
    else fields.mood = body.mood;
  }
  for (const key of SCALES) {
    if (body[key] === undefined) continue;
    if (body[key] === null || body[key] === '') { fields[key] = null; continue; }
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < 1 || n > 5) errors[key] = 'Must be a whole number from 1 to 5';
    else fields[key] = n;
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string') errors.notes = 'Journal note must be text';
    else if (body.notes.length > 1000) errors.notes = 'Journal note must be 1000 characters or fewer';
    else fields.notes = body.notes.trim();
  }
  if (Array.isArray(body.tags)) fields.tags = body.tags.filter((t) => typeof t === 'string').map((t) => t.trim().slice(0, 30)).filter(Boolean).slice(0, 10);
  return { fields, errors };
}

const serialize = (e) => ({
  _id: e._id, mood: e.mood, emotionalState: e.emotionalState ?? null, stressLevel: e.stressLevel ?? null,
  energyLevel: e.energyLevel ?? null, sleepQuality: e.sleepQuality ?? null, notes: e.notes || '', tags: e.tags || [],
  localDate: e.localDate || new Date(e.date).toISOString().slice(0, 10), timezone: e.timezone || 'UTC',
  checkinAt: e.checkinAt || e.createdAt, editedAt: e.editedAt || null, date: e.date, createdAt: e.createdAt,
});

// GET /api/mood?from=YYYY-MM-DD&to=YYYY-MM-DD&page=&limit=
exports.getMoods = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 90, 1), 366);
  const filter = { user: req.user._id };
  const range = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '')) range.$gte = dateForKey(req.query.from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) range.$lte = dateForKey(req.query.to);
  if (Object.keys(range).length) filter.date = range;
  const [total, entries] = await Promise.all([
    MoodEntry.countDocuments(filter),
    MoodEntry.find(filter).sort({ date: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  res.json({ success: true, data: entries.map(serialize), pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
};

// GET /api/mood/today?timezone=Asia/Kolkata
exports.getToday = async (req, res) => {
  const tz = tzOf(req.query.timezone);
  const key = localDateKey(new Date(), tz);
  const entry = await MoodEntry.findOne({ user: req.user._id, date: dateForKey(key) }).lean();
  res.json({ success: true, localDate: key, timezone: tz, data: entry ? serialize(entry) : null });
};

// POST /api/mood   { mood, emotionalState?, stressLevel?, energyLevel?, sleepQuality?, notes?, timezone }
exports.createMood = async (req, res) => {
  const { fields, errors } = pickCheckinFields(req.body, { requireMood: true });
  if (Object.keys(errors).length) return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });
  const tz = tzOf(req.body.timezone);
  const now = new Date();
  const key = localDateKey(now, tz);
  try {
    const entry = await MoodEntry.create({ ...fields, user: req.user._id, date: dateForKey(key), localDate: key, timezone: tz, checkinAt: now });
    res.status(201).json({ success: true, message: 'Daily check-in saved', data: serialize(entry) });
  } catch (err) {
    if (err.code === 11000) {
      const existing = await MoodEntry.findOne({ user: req.user._id, date: dateForKey(key) }).lean();
      return res.status(409).json({ success: false, code: 'ALREADY_CHECKED_IN', message: 'You have already checked in today. You can edit today’s check-in instead.', data: existing ? serialize(existing) : null });
    }
    throw err;
  }
};

// PUT /api/mood/:id  – edit an existing check-in (owner only)
exports.updateMood = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
  const { fields, errors } = pickCheckinFields(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });
  const entry = await MoodEntry.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { ...fields, editedAt: new Date() } },
    { new: true, runValidators: true }
  );
  if (!entry) return res.status(404).json({ success: false, message: 'Check-in not found' });
  res.json({ success: true, message: 'Check-in updated', data: serialize(entry) });
};

// DELETE /api/mood/:id (owner only)
exports.deleteMood = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
  const entry = await MoodEntry.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!entry) return res.status(404).json({ success: false, message: 'Check-in not found' });
  res.json({ success: true, data: {} });
};
