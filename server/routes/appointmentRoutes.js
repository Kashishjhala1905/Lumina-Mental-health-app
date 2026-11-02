const express = require('express');
const router = express.Router();
const {
    bookAppointment,
    getMyAppointments,
    getCounselorAppointments,
    updateAppointmentStatus
} = require('../controllers/appointmentController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// User routes (`user` also matches legacy `student` accounts)
router.post('/book', protect, restrictTo('user'), bookAppointment);
router.get('/my', protect, restrictTo('user'), getMyAppointments);

// Counselor routes
router.get('/counselor', protect, restrictTo('counselor'), getCounselorAppointments);
router.patch('/:id/status', protect, restrictTo('counselor'), updateAppointmentStatus);

module.exports = router;
