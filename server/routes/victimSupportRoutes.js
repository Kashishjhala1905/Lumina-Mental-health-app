const express = require('express');
const router = express.Router();
const vs = require('../controllers/victimSupportController');
const referrals = require('../controllers/referralController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { checkinLimiter } = require('../middleware/security');

// Only regular users enroll in Victim Support (counselors/admins use their own dashboards)
router.use(protect, restrictTo('user'));

router.get('/consent', vs.getConsent);
router.post('/consent', vs.grantConsent);
router.patch('/consent/preferences', vs.requireActiveConsent, vs.updateConsentPreferences);
router.post('/consent/withdraw', vs.withdrawConsent);

router.get('/dashboard', vs.getDashboard);
router.get('/checkins', vs.listCheckins);
router.get('/checkins/:id', vs.getCheckin);
router.post('/checkins', vs.requireActiveConsent, checkinLimiter, vs.createCheckin);

router.get('/reminders', vs.getReminderPreference);
router.put('/reminders', vs.updateReminderPreference);

router.get('/referrals', referrals.listMyReferrals);
router.patch('/referrals/:ref/consent', referrals.setShareConsent);

router.get('/export', vs.exportMyData);
router.delete('/data', vs.deleteMyData);

module.exports = router;
