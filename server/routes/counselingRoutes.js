const express = require('express');
const router = express.Router();
const { getCounselors, getMeta, getCounselor, createBooking, getMyBookings } = require('../controllers/counselingController');
const { protect } = require('../middleware/authMiddleware');

router.get('/meta', getMeta);
router.get('/counselors', getCounselors);
router.get('/counselors/:id', getCounselor);
router.post('/bookings', protect, createBooking);
router.get('/bookings/my', protect, getMyBookings);

module.exports = router;
