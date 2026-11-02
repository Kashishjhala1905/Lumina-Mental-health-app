#!/usr/bin/env node
/**
 * Email configuration check for developers.
 *   node scripts/emailTest.js                 → show provider status + verify connection (no email sent)
 *   node scripts/emailTest.js you@example.com → also send a branded test email to that address
 *
 * Reports provider ACCEPTANCE honestly; it never claims delivery (only webhooks/inbox checks confirm that).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const crypto = require('crypto');
const mongoose = require('mongoose');
const { getEmailStatus, verifyProvider, sendEmail } = require('../services/email/emailService');

(async () => {
    const to = process.argv[2];
    const status = getEmailStatus();
    console.log('Email provider :', status.provider);
    console.log('Configured     :', status.configured ? 'yes' : 'NO');
    if (status.issues.length) console.log('Issues         :', status.issues.join(' | '));
    console.log('Delivery proof :', status.deliveryConfirmation === 'webhook' ? 'webhook (delivery can be confirmed)' : 'acceptance only (no delivery webhook configured)');

    const v = await verifyProvider();
    console.log(`Verify         : ${v.ok ? 'OK' : 'FAILED'} – ${v.message}`);

    if (!to) {
        console.log('\nTip: pass an email address to send a test email.');
        process.exit(status.configured && v.ok ? 0 : 1);
    }

    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const result = await sendEmail({
        to,
        type: 'test',
        isTest: true,
        idempotencyKey: `test:cli:${crypto.randomUUID()}`,
        data: { sentAt: new Date().toUTCString(), provider: status.provider },
    });
    await mongoose.disconnect();
    console.log('\nTest email     :', result.status.toUpperCase());
    if (result.providerMessageId) console.log('Provider id    :', result.providerMessageId);
    if (result.errorCode) console.log('Error          :', result.errorCode, '–', result.message);
    if (result.status === 'accepted') console.log('Note           : the provider accepted the message; confirm it arrived in the inbox (acceptance ≠ delivery).');
    if (result.status === 'captured') console.log('Note           : development outbox – written to server/.dev-outbox, NOT sent.');
    process.exit(['accepted', 'captured'].includes(result.status) ? 0 : 1);
})().catch((err) => { console.error('Email test failed:', err.message); process.exit(1); });
