// Admin tools for email & reminders: provider status, connection check, test email,
// manual reminder run, delivery history (masked recipients) and integration status.
const crypto = require('crypto');
const EmailDelivery = require('../models/EmailDelivery');
const { sendEmail, verifyProvider, getEmailStatus } = require('../services/email/emailService');
const { processDueReminders, reminderStats } = require('../services/reminderService');
const { listDirectory } = require('../services/integrations/externalReferralService');
const { auditLog } = require('../services/auditService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// GET /api/admin/email/status
const getStatus = async (req, res) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [byStatus, recent, reminders] = await Promise.all([
        EmailDelivery.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { type: '$type', status: '$status' }, n: { $sum: 1 } } }]),
        EmailDelivery.find().sort({ createdAt: -1 }).limit(25)
            .select('type toMasked provider status attempts lastErrorCode lastErrorMessage uncertain skipReason acceptedAt deliveredAt failedAt createdAt isTest').lean(),
        reminderStats(30),
    ]);
    const totals = {};
    for (const row of byStatus) totals[row._id.status] = (totals[row._id.status] || 0) + row.n;
    res.json({
        success: true,
        data: {
            provider: getEmailStatus(),
            last30Days: { totals, byTypeAndStatus: byStatus.map((r) => ({ type: r._id.type, status: r._id.status, count: r.n })) },
            recentDeliveries: recent,
            reminders,
            note: 'Status "accepted" means the provider accepted the message. "delivered" is only recorded when a verified provider webhook confirms delivery.',
        },
    });
};

// POST /api/admin/email/verify
const verify = async (req, res) => {
    const result = await verifyProvider();
    await auditLog({ action: 'EMAIL_PROVIDER_VERIFIED', actor: req.user, metadata: { ok: result.ok, provider: getEmailStatus().provider } });
    res.status(result.ok ? 200 : 502).json({ success: result.ok, ...result, provider: getEmailStatus() });
};

// POST /api/admin/email/test   { to? }  – defaults to the admin's own address
const sendTest = async (req, res) => {
    const to = String(req.body.to || req.user.email || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(to)) return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
    const status = getEmailStatus();
    const result = await sendEmail({
        to,
        type: 'test',
        userId: req.user._id,
        isTest: true,
        idempotencyKey: `test:${crypto.randomUUID()}`,
        data: { sentAt: new Date().toUTCString(), provider: status.provider },
    });
    await auditLog({ action: 'EMAIL_TEST_SENT', actor: req.user, metadata: { result: result.status, provider: status.provider, errorCode: result.errorCode } });
    const ok = ['accepted', 'captured'].includes(result.status);
    const messages = {
        accepted: `The ${status.provider} provider ACCEPTED the message (id ${result.providerMessageId}). Acceptance is not proof of delivery – check the inbox${status.deliveryConfirmation === 'webhook' ? ' or wait for the delivery webhook' : ''}.`,
        captured: 'Development outbox: the email was written to server/.dev-outbox and NOT sent.',
        skipped: `Not sent: ${result.message}`,
        failed: `Sending failed (${result.errorCode}): ${result.message}`,
    };
    res.status(ok ? 200 : result.status === 'skipped' ? 409 : 502).json({ success: ok, result, message: messages[result.status] || result.message });
};

// POST /api/admin/reminders/run  – process due reminders now instead of waiting for the scheduler
const runReminders = async (req, res) => {
    const summary = await processDueReminders();
    await auditLog({ action: 'REMINDERS_RUN_MANUALLY', actor: req.user, metadata: summary });
    res.json({ success: true, data: summary, message: `Processed ${summary.due} due reminder(s): ${summary.sent} sent, ${summary.failed} failed, ${summary.skipped} skipped, ${summary.paused} paused.` });
};

// GET /api/admin/integrations
const getIntegrations = async (req, res) => {
    res.json({
        success: true,
        data: {
            directory: listDirectory(),
            summary: 'No official government or helpline APIs are connected. Referrals are tracked internally and made manually by counselors; no victim data is transmitted externally.',
        },
    });
};

module.exports = { getStatus, verify, sendTest, runReminders, getIntegrations };
