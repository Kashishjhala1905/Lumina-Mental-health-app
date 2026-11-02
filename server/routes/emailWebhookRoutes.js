// Provider delivery webhooks. This is the ONLY way an email is marked "delivered".
// Resend signs webhooks with Svix (headers svix-id / svix-timestamp / svix-signature).
// Enabled only when RESEND_WEBHOOK_SECRET is set.
const express = require('express');
const router = express.Router();
const { verifySvixSignature, applyWebhookEvent } = require('../services/email/emailService');

router.post('/resend', async (req, res) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return res.status(404).json({ success: false, message: 'Not found' });
    const valid = verifySvixSignature({
        id: req.get('svix-id'),
        timestamp: req.get('svix-timestamp'),
        signatureHeader: req.get('svix-signature'),
        rawBody: req.rawBody,
        secret,
    });
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid signature' });
    const result = await applyWebhookEvent(req.body);
    res.json({ success: true, ...result });
});

module.exports = router;
