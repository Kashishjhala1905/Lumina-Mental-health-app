const mongoose = require('mongoose');
const Meditation = require('../models/Meditation');
const Exercise = require('../models/Exercise');
const ResourceActivity = require('../models/ResourceActivity');
const { ensureCatalogue } = require('../services/resourceCatalog');

const isId = (v) => mongoose.isValidObjectId(v);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const MAX_SESSION_SECONDS = 6 * 60 * 60;

const publicMeditation = (m) => ({
  _id: m._id, slug: m.slug, title: m.title, description: m.description, category: m.category, url: m.url,
  duration: m.duration, guide: m.guide || [], breathing: m.breathing?.inhale ? m.breathing : null,
  isShortLoop: !!m.isShortLoop, source: m.source, license: m.license,
});

const publicExercise = (e) => ({
  _id: e._id, slug: e.slug, title: e.title, description: e.description, category: e.category,
  instructions: e.instructions || [], duration: e.duration, difficulty: e.difficulty, icon: e.icon,
});

// GET /api/resources/meditations?category=
const getMeditations = async (req, res) => {
  await ensureCatalogue();
  const filter = { active: true };
  if (Meditation.CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
  const tracks = await Meditation.find(filter).sort({ sortOrder: 1, title: 1 }).lean();
  res.json({ success: true, count: tracks.length, categories: Meditation.CATEGORIES, data: tracks.map(publicMeditation) });
};

// GET /api/resources/exercises?category=
const getExercises = async (req, res) => {
  await ensureCatalogue();
  const filter = { active: true };
  if (Exercise.CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
  const exercises = await Exercise.find(filter).sort({ sortOrder: 1, category: 1, title: 1 }).lean();
  res.json({ success: true, count: exercises.length, categories: Exercise.CATEGORIES, data: exercises.map(publicExercise) });
};

/** Resolves the resource a client is reporting on. Strategies are static guides identified by slug. */
async function resolveResource(type, idOrSlug, body) {
  if (type === 'meditation' || type === 'exercise') {
    const Model = type === 'meditation' ? Meditation : Exercise;
    const doc = await Model.findOne(isId(idOrSlug) ? { _id: idOrSlug } : { slug: String(idOrSlug || '') }).lean();
    if (!doc) return null;
    return { resourceId: doc._id, resourceKey: doc.slug || String(doc._id), title: doc.title, category: doc.category, targetSeconds: doc.duration };
  }
  if (type === 'strategy') {
    const key = str(idOrSlug, 80).toLowerCase();
    const title = str(body.title, 120);
    if (!/^[a-z0-9-]{3,80}$/.test(key) || !title) return null;
    return { resourceKey: key, title, category: 'Strategies' };
  }
  return null;
}

const ACTIVITY_FOR = { meditation: 'audio_played', exercise: 'exercise_session', strategy: 'strategy_viewed' };

// POST /api/resources/activity   { resourceType, resourceId | resourceKey, title? }
const startActivity = async (req, res) => {
  const type = req.body.resourceType;
  if (!ResourceActivity.RESOURCE_TYPES.includes(type)) return res.status(400).json({ success: false, message: 'Invalid resource type' });
  const resource = await resolveResource(type, req.body.resourceId || req.body.resourceKey, req.body);
  if (!resource) return res.status(404).json({ success: false, message: 'Resource not found' });

  // Strategy guides: one "viewed" record per guide per day is enough
  if (type === 'strategy') {
    const since = new Date(); since.setUTCHours(0, 0, 0, 0);
    const existing = await ResourceActivity.findOne({ user: req.user._id, resourceType: 'strategy', resourceKey: resource.resourceKey, startedAt: { $gte: since } });
    if (existing) return res.json({ success: true, data: { activityId: existing._id, status: existing.status, deduplicated: true } });
  }

  const activity = await ResourceActivity.create({
    user: req.user._id,
    resourceType: type,
    ...resource,
    activityType: ACTIVITY_FOR[type],
    status: type === 'strategy' ? 'viewed' : 'started',
    startedAt: new Date(),
  });
  res.status(201).json({ success: true, data: { activityId: activity._id, status: activity.status } });
};

// PATCH /api/resources/activity/:id   { status: 'completed' | 'abandoned', durationSeconds }
// Completion is recorded exactly once: only a "started" activity can be finished (atomic update).
const finishActivity = async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid activity id' });
  const status = req.body.status;
  if (!['completed', 'abandoned'].includes(status)) return res.status(400).json({ success: false, message: 'Status must be completed or abandoned' });
  const seconds = Math.round(Number(req.body.durationSeconds));
  if (!Number.isFinite(seconds) || seconds < 0) return res.status(400).json({ success: false, message: 'durationSeconds must be a positive number' });

  const updated = await ResourceActivity.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id, status: 'started' },
    { $set: { status, durationSeconds: Math.min(seconds, MAX_SESSION_SECONDS), ...(status === 'completed' ? { completedAt: new Date() } : {}) } },
    { new: true }
  );
  if (updated) return res.json({ success: true, data: updated });

  const existing = await ResourceActivity.findOne({ _id: req.params.id, user: req.user._id }).lean();
  if (!existing) return res.status(404).json({ success: false, message: 'Activity not found' });
  return res.status(409).json({ success: false, code: 'ALREADY_RECORDED', message: `This session was already recorded as ${existing.status}`, data: existing });
};

// GET /api/resources/activity?type=&status=&from=&to=&page=&limit=
const listMyActivity = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const filter = { user: req.user._id };
  if (ResourceActivity.RESOURCE_TYPES.includes(req.query.type)) filter.resourceType = req.query.type;
  if (['started', 'completed', 'abandoned', 'viewed'].includes(req.query.status)) filter.status = req.query.status;
  const range = {};
  if (req.query.from && !Number.isNaN(Date.parse(req.query.from))) range.$gte = new Date(req.query.from);
  if (req.query.to && !Number.isNaN(Date.parse(req.query.to))) { const to = new Date(req.query.to); if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) to.setUTCHours(23, 59, 59, 999); range.$lte = to; }
  if (Object.keys(range).length) filter.startedAt = range;
  const [total, rows, totals] = await Promise.all([
    ResourceActivity.countDocuments(filter),
    ResourceActivity.find(filter).sort({ startedAt: -1 }).skip((page - 1) * limit).limit(limit).select('-user -__v').lean(),
    ResourceActivity.aggregate([
      { $match: { user: req.user._id } },
      { $group: { _id: '$resourceType', sessions: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, seconds: { $sum: '$durationSeconds' } } },
    ]),
  ]);
  res.json({ success: true, data: rows, totals: Object.fromEntries(totals.map((t) => [t._id, { sessions: t.sessions, completed: t.completed, seconds: t.seconds }])), pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
};

// Legacy endpoints kept for older clients: record a completed session in one call
const completeExercise = async (req, res) => {
  const resource = await resolveResource('exercise', req.params.id, req.body);
  if (!resource) return res.status(404).json({ success: false, message: 'Exercise not found' });
  const history = await ResourceActivity.create({ user: req.user._id, resourceType: 'exercise', ...resource, activityType: 'exercise_session', status: 'completed', startedAt: new Date(Date.now() - resource.targetSeconds * 1000), completedAt: new Date(), durationSeconds: resource.targetSeconds });
  res.status(201).json({ success: true, data: history });
};

const completeMeditation = async (req, res) => {
  const resource = await resolveResource('meditation', req.params.id, req.body);
  if (!resource) return res.status(404).json({ success: false, message: 'Meditation not found' });
  const seconds = Math.min(Math.max(parseInt(req.body.secondsListened, 10) || 0, 0), MAX_SESSION_SECONDS);
  const history = await ResourceActivity.create({ user: req.user._id, resourceType: 'meditation', ...resource, activityType: 'audio_played', status: 'completed', startedAt: new Date(Date.now() - seconds * 1000), completedAt: new Date(), durationSeconds: seconds });
  res.status(201).json({ success: true, data: history });
};

module.exports = {
  getMeditations,
  getExercises,
  startActivity,
  finishActivity,
  listMyActivity,
  completeExercise,
  completeMeditation,
};
