const express = require('express');
const router = express.Router();
const c = require('../controllers/counselorController');
const r = require('../controllers/referralController');
const { protect, restrictTo, requireApprovedCounselor } = require('../middleware/authMiddleware');

// All counselor routes: authenticated, counselor role, approved by an admin.
// Per-case authorisation (assignment checks) is enforced inside the controller.
router.use(protect, restrictTo('counselor'), requireApprovedCounselor);

router.get('/dashboard', c.getDashboard);

router.get('/cases', c.listCases);
router.get('/cases/:caseRef', c.getCaseDetails);
router.post('/cases/:caseRef/notes', c.addCaseNote);
router.patch('/cases/:caseRef/notes/:noteId', c.updateCaseNote);
router.post('/cases/:caseRef/support-plans', c.createSupportPlan);

router.get('/alerts', c.listAlerts);
router.patch('/alerts/:id/status', c.updateAlertStatus);
router.post('/alerts/:id/notes', c.addAlertNote);

router.get('/support-plans', c.listSupportPlans);
router.patch('/support-plans/:id', c.updateSupportPlan);
router.post('/support-plans/:id/items', c.addPlanItem);
router.patch('/support-plans/:id/items/:itemId', c.updatePlanItem);

// Referrals (assigned cases only)
router.get('/referral-directory', r.getDirectory);
router.get('/referrals', r.listCounselorReferrals);
router.post('/cases/:caseRef/referrals', r.createReferral);
router.patch('/referrals/:id', r.updateReferral);
router.post('/referrals/:id/notes', r.addReferralNote);
router.post('/referrals/:id/external-submit', r.externalSubmit);

module.exports = router;
