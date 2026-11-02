const express = require('express');
const router = express.Router();
const a = require('../controllers/assessmentController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');

router.get('/definition', a.getDefinition);
router.post('/', optionalAuth, a.submitAssessment); // guests get a score; signed-in users also get history
router.get('/history', protect, a.listHistory);
router.get('/history/:id', protect, a.getResult);

module.exports = router;
