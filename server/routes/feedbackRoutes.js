const express = require('express');
const router = express.Router();
const f = require('../controllers/feedbackController');
const { protect } = require('../middleware/authMiddleware');
const { feedbackLimiter } = require('../middleware/security');

router.get('/options', protect, f.getOptions);
router.get('/mine', protect, f.listMyFeedback);
router.post('/', protect, feedbackLimiter, f.submitFeedback);

module.exports = router;
