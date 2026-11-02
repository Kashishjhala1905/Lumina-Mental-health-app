const express = require('express');
const router = express.Router();
const r = require('../controllers/resourceController');
const { protect } = require('../middleware/authMiddleware');

// Public catalogue
router.get('/meditations', r.getMeditations);
router.get('/exercises', r.getExercises);

// Personal activity history (authenticated, own records only)
router.post('/activity', protect, r.startActivity);
router.patch('/activity/:id', protect, r.finishActivity);
router.get('/activity', protect, r.listMyActivity);

// Legacy one-shot completion endpoints
router.post('/exercises/:id/complete', protect, r.completeExercise);
router.post('/meditations/:id/complete', protect, r.completeMeditation);

module.exports = router;
