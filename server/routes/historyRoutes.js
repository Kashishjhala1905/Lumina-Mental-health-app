// GET /api/history/summary – counts for the "My History" overview (the signed-in user's own records only)
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const AssessmentResult = require('../models/AssessmentResult');
const Conversation = require('../models/Conversation');
const ResourceActivity = require('../models/ResourceActivity');
const MoodEntry = require('../models/MoodEntry');
const Post = require('../models/Post');
const Feedback = require('../models/Feedback');

router.get('/summary', protect, async (req, res) => {
  const user = req.user._id;
  const [assessments, conversations, meditation, exercise, strategy, checkins, posts, feedback, lastAssessment, lastCheckin] = await Promise.all([
    AssessmentResult.countDocuments({ user }),
    Conversation.countDocuments({ user }),
    ResourceActivity.countDocuments({ user, resourceType: 'meditation' }),
    ResourceActivity.countDocuments({ user, resourceType: 'exercise' }),
    ResourceActivity.countDocuments({ user, resourceType: 'strategy' }),
    MoodEntry.countDocuments({ user }),
    Post.countDocuments({ user }),
    Feedback.countDocuments({ user }),
    AssessmentResult.findOne({ user }).sort({ completedAt: -1 }).select('score result completedAt').lean(),
    MoodEntry.findOne({ user }).sort({ date: -1 }).select('mood localDate checkinAt').lean(),
  ]);
  res.json({
    success: true,
    data: {
      counts: { assessments, conversations, meditation, exercise, resources: strategy, checkins, posts, feedback },
      lastAssessment,
      lastCheckin,
    },
  });
});

module.exports = router;
