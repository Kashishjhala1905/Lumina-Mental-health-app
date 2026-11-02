const express = require('express');
const router = express.Router();
const {
  getMoods,
  getToday,
  createMood,
  updateMood,
  deleteMood
} = require('../controllers/moodController');
const { protect } = require('../middleware/authMiddleware');

// Daily check-ins (owner-only)
router.get('/', protect, getMoods);
router.get('/today', protect, getToday);
router.post('/', protect, createMood);
router.put('/:id', protect, updateMood);
router.delete('/:id', protect, deleteMood);

module.exports = router;
