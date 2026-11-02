// Internal endpoints for serverless deployments (e.g. Vercel), where the in-process node-cron
// scheduler cannot run. An external scheduler calls these with `Authorization: Bearer <CRON_SECRET>`
// (Vercel Cron sends this header automatically when CRON_SECRET is set).
const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { processDueReminders } = require('../services/reminderService');
const { purgeExpiredRetainedData } = require('../services/victimDataService');

function requireCronSecret(req, res, next) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(404).json({ success: false, message: 'Not found' });
    const provided = Buffer.from(String(req.headers.authorization || ''));
    const expected = Buffer.from(`Bearer ${secret}`);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
}

router.get('/cron/reminders', requireCronSecret, async (req, res) => {
    res.json({ success: true, data: await processDueReminders() });
});

router.get('/cron/retention', requireCronSecret, async (req, res) => {
    res.json({ success: true, data: { purgedCases: await purgeExpiredRetainedData() } });
});

module.exports = router;
