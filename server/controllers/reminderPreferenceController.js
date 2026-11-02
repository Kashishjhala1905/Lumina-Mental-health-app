// ReminderPreferenceController – CRUD for user reminder preferences
// All routes are protected by authMiddleware (assumed already applied in routes)
const { body, param, validationResult } = require('express-validator');
const ReminderPreference = require('../models/ReminderPreference');
const VictimSupportConsent = require('../models/VictimSupportConsent');
const auditService = require('../services/auditService');

// Helper to handle validation errors
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Get current user's reminder preference (create default if none)
exports.getPreference = async (req, res) => {
  try {
    const pref = await ReminderPreference.findOne({ userId: req.user.id });
    if (!pref) {
      // create default preference (enabled true, default cron from env)
      const defaultCron = process.env.ALERT_REMINDER_CRON || '0 9 * * *'; // 9 AM daily
      const newPref = await ReminderPreference.create({
        userId: req.user.id,
        enabled: true,
        cronExpression: defaultCron,
      });
      return res.json(newPref);
    }
    res.json(pref);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update preference (partial)
exports.updatePreference = [
  body('enabled').optional().isBoolean().withMessage('enabled must be boolean'),
  body('cronExpression').optional().isString().withMessage('cronExpression must be string'),
  handleValidation,
  async (req, res) => {
    try {
      const update = {};
      if (req.body.enabled !== undefined) update.enabled = req.body.enabled;
      if (req.body.cronExpression) update.cronExpression = req.body.cronExpression;
      const pref = await ReminderPreference.findOneAndUpdate(
        { userId: req.user.id },
        { $set: update },
        { new: true, upsert: true }
      );
      await auditService.log(req.user.id, 'reminder_preference_updated', { update });
      res.json(pref);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  },
];

// Delete (disable) preference – used when consent withdrawn
exports.disablePreference = async (req, res) => {
  try {
    const pref = await ReminderPreference.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { enabled: false } },
      { new: true }
    );
    if (!pref) return res.status(404).json({ message: 'Preference not found' });
    await auditService.log(req.user.id, 'reminder_preference_disabled', {});
    res.json({ message: 'Reminders disabled' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

