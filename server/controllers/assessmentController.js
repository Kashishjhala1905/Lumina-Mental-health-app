const mongoose = require('mongoose');
const AssessmentResult = require('../models/AssessmentResult');
const { VERSION, QUESTIONS, scoreAssessment } = require('../services/assessmentService');

const serialize = (r) => ({
  _id: r._id, assessmentType: r.assessmentType, version: r.version, score: r.score, result: r.result,
  recommendations: r.recommendations, answers: r.answers, completedAt: r.completedAt,
});

// GET /api/assessments/definition
const getDefinition = (req, res) => {
  res.json({ success: true, data: { version: VERSION, scale: { min: 1, max: 5, minLabel: 'Not at all', maxLabel: 'Very much' }, questions: QUESTIONS.map(({ id, text }) => ({ id, text })) } });
};

// POST /api/assessments   { answers: { questionId: 1..5 } }
// Signed-in users: result saved to their history. Guests: scored only, nothing stored.
const submitAssessment = async (req, res) => {
  const scored = scoreAssessment(req.body.answers);
  if (scored.errors) return res.status(400).json({ success: false, message: 'Please answer every question with a value from 1 to 5', errors: { answers: scored.errors } });

  const payload = { score: scored.score, result: scored.result, recommendations: scored.recommendations, version: scored.version, answers: scored.items, completedAt: new Date() };
  if (!req.user) return res.json({ success: true, saved: false, data: payload });

  const previous = await AssessmentResult.findOne({ user: req.user._id }).sort({ completedAt: -1 }).lean();
  const saved = await AssessmentResult.create({ user: req.user._id, assessmentType: 'wellness-check', ...payload });
  res.status(201).json({
    success: true,
    saved: true,
    data: serialize(saved),
    comparison: previous ? { previousScore: previous.score, previousResult: previous.result, previousCompletedAt: previous.completedAt, change: saved.score - previous.score } : null,
  });
};

// GET /api/assessments/history?page=&limit=&from=&to=
const listHistory = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const filter = { user: req.user._id };
  const range = {};
  if (req.query.from && !Number.isNaN(Date.parse(req.query.from))) range.$gte = new Date(req.query.from);
  if (req.query.to && !Number.isNaN(Date.parse(req.query.to))) { const to = new Date(req.query.to); if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) to.setUTCHours(23, 59, 59, 999); range.$lte = to; }
  if (Object.keys(range).length) filter.completedAt = range;
  const [total, rows, trend] = await Promise.all([
    AssessmentResult.countDocuments(filter),
    AssessmentResult.find(filter).sort({ completedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AssessmentResult.find({ user: req.user._id }).sort({ completedAt: 1 }).limit(100).select('score result completedAt').lean(),
  ]);
  res.json({ success: true, data: rows.map(serialize), trend: trend.map((t) => ({ date: t.completedAt, score: t.score, result: t.result })), pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
};

// GET /api/assessments/history/:id   (own result only)
const getResult = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
  const result = await AssessmentResult.findOne({ _id: req.params.id, user: req.user._id }).lean();
  if (!result) return res.status(404).json({ success: false, message: 'Assessment not found' });
  const previous = await AssessmentResult.findOne({ user: req.user._id, completedAt: { $lt: result.completedAt } }).sort({ completedAt: -1 }).select('score result completedAt').lean();
  res.json({ success: true, data: serialize(result), previous });
};

module.exports = { getDefinition, submitAssessment, listHistory, getResult };
