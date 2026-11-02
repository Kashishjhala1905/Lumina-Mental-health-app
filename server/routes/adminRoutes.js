const express = require('express');
const router = express.Router();
const {
    getAllUsers,
    getAllAppointments,
    deleteUser,
    getStats,
    getPendingCounselors,
    approveCounselor,
    rejectCounselor,
    updateUserRole,
    getAnalytics,
    getVictimCases,
    assignVictimCase,
    getAuditEvents,
} = require('../controllers/adminController');
const emailAdmin = require('../controllers/adminEmailController');
const counsellors = require('../controllers/adminCounselorController');
const community = require('../controllers/communityController');
const feedback = require('../controllers/feedbackController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// All routes are protected and restricted to admin
router.use(protect);
router.use(restrictTo('admin'));

router.get('/users', getAllUsers);
router.get('/appointments', getAllAppointments);
router.delete('/user/:id', deleteUser);
router.patch('/users/:id/role', updateUserRole);
router.get('/stats', getStats);
router.get('/pending-counselors', getPendingCounselors);
router.patch('/approve-counselor/:id', approveCounselor);
router.delete('/reject-counselor/:id', rejectCounselor);

// Victim Support oversight – aggregate / pseudonymous only
router.get('/analytics', getAnalytics);
router.get('/vs/cases', getVictimCases);
router.patch('/vs/cases/:caseRef/assign', assignVictimCase);
router.get('/audit', getAuditEvents);

// Email, reminders & integrations
router.get('/email/status', emailAdmin.getStatus);
router.post('/email/verify', emailAdmin.verify);
router.post('/email/test', emailAdmin.sendTest);
router.post('/reminders/run', emailAdmin.runReminders);
router.get('/integrations', emailAdmin.getIntegrations);

// Counsellor directory (admin-managed; only admins can create or modify profiles)
router.get('/counsellors', counsellors.listProfiles);
router.post('/counsellors', counsellors.createProfile);
router.patch('/counsellors/:id', counsellors.updateProfile);

// Community moderation
router.get('/community/posts', community.listForModeration);
router.patch('/community/posts/:id', community.moderatePost);

// Feedback (no user identities)
router.get('/feedback', feedback.adminListFeedback);

module.exports = router;
