// emailService – the single entry point for sending email.
// - Idempotent: one EmailDelivery record per idempotencyKey; an accepted email is never sent twice.
// - Retries only errors that are safe to retry (network / rate limit / provider 5xx); "uncertain"
//   errors (the provider may already have accepted the message) are never retried automatically.
// - Records provider ACCEPTANCE; DELIVERY is only confirmed by a verified provider webhook.
// - Never logs or stores message bodies, links or tokens.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EmailDelivery = require('../../models/EmailDelivery');
const { getProvider } = require('./providers');
const { renderEmail } = require('./templates');
const { getAppBaseUrl, appUrlIssues } = require('./appUrl');

// Email-sized copy of the official Lumina logo (generated from client/public/images/lumina-logo.png)
const LOGO_PATH = process.env.EMAIL_LOGO_PATH || path.join(__dirname, '..', '..', 'assets', 'email', 'lumina-logo.png');

/** How the logo is shown: inline attachment (SMTP/outbox) or a public URL (API providers). */
function emailLogo(provider) {
    if (provider.supportsInlineImages && fs.existsSync(LOGO_PATH)) {
        return { src: 'cid:lumina-logo', attachments: [{ filename: 'lumina-logo.png', path: LOGO_PATH, cid: 'lumina-logo', contentDisposition: 'inline' }] };
    }
    const base = getAppBaseUrl();
    const url = process.env.EMAIL_LOGO_URL || (base.startsWith('https://') ? `${base}/images/lumina-logo.png` : '');
    return { src: url || null, attachments: [] };
}

const SENT_STATES = ['sending', 'accepted', 'captured', 'delivered'];
const maxAttempts = () => Math.min(Math.max(parseInt(process.env.EMAIL_MAX_ATTEMPTS, 10) || 3, 1), 5);
const backoffMs = (attempt) => (process.env.NODE_ENV === 'test' ? 50 : 600) * attempt * attempt;

const maskEmail = (email = '') => {
    const [local, domain] = String(email).split('@');
    if (!domain) return '***';
    return `${local.slice(0, 1)}***@${domain}`;
};
const hashEmail = (email = '') => crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');

const isEmailConfigured = () => getProvider().isConfigured();

function getEmailStatus() {
    const provider = getProvider();
    return {
        provider: provider.name,
        configured: provider.isConfigured(),
        issues: [...provider.configIssues(), ...appUrlIssues()],
        appUrl: getAppBaseUrl() || null,
        logo: fs.existsSync(LOGO_PATH) ? 'available' : 'missing',
        from: process.env.EMAIL_FROM ? maskEmail(process.env.EMAIL_FROM.replace(/^.*</, '').replace(/>.*$/, '')) : null,
        deliveryConfirmation: provider.name === 'resend' && process.env.RESEND_WEBHOOK_SECRET
            ? 'webhook'
            : 'acceptance_only', // without webhooks we can only report provider acceptance
        isDevelopmentOutbox: provider.name === 'outbox',
    };
}

/**
 * Send a templated email.
 * @param {object} p
 * @param {string} p.to               recipient address
 * @param {string} p.type             template / delivery type (see EmailDelivery.TYPES)
 * @param {object} [p.data]           template data
 * @param {string} [p.idempotencyKey] stable key for this logical email (prevents duplicates across retries/runs)
 * @param {*}      [p.userId]
 * @param {boolean} [p.isTest]
 * @returns {Promise<{status: string, deliveryId?: string, providerMessageId?: string, errorCode?: string, message?: string}>}
 */
async function sendEmail({ to, type, data, idempotencyKey, userId, isTest = false }) {
    const provider = getProvider();
    const base = { type, userId, toMasked: maskEmail(to), toHash: hashEmail(to), provider: provider.name, isTest };

    if (!to) return { status: 'skipped', message: 'No recipient address' };

    if (!provider.isConfigured()) {
        const rec = await EmailDelivery.create({ ...base, status: 'skipped', skipReason: 'not_configured' });
        return { status: 'skipped', deliveryId: String(rec._id), errorCode: 'not_configured', message: provider.configIssues().join('; ') };
    }

    // Idempotency: reuse / short-circuit an existing record for the same logical email
    let record;
    if (idempotencyKey) {
        record = await EmailDelivery.findOne({ idempotencyKey });
        if (record && SENT_STATES.includes(record.status)) {
            return { status: 'duplicate', deliveryId: String(record._id), providerMessageId: record.providerMessageId, message: `Already ${record.status}` };
        }
        if (record && record.status === 'failed' && (record.uncertain || !record.retryable)) {
            return { status: 'failed', deliveryId: String(record._id), errorCode: record.lastErrorCode, message: 'Previous attempt failed permanently or with uncertain outcome; not resending automatically' };
        }
    }

    const logo = emailLogo(provider);
    const rendered = renderEmail(type, data, { logoSrc: logo.src });
    try {
        if (record) {
            record.status = 'sending';
            record.subject = rendered.subject;
            await record.save();
        } else {
            record = await EmailDelivery.create({ ...base, subject: rendered.subject, status: 'sending', idempotencyKey });
        }
    } catch (err) {
        if (err.code === 11000) return { status: 'duplicate', message: 'Another process is sending this email' };
        throw err;
    }

    const from = process.env.EMAIL_FROM || 'Lumina <no-reply@localhost>';
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts(); attempt++) {
        record.attempts += 1;
        try {
            const { messageId } = await provider.send({
                from, to, subject: rendered.subject, html: rendered.html, text: rendered.text,
                idempotencyKey, tags: [['type', type]], attachments: logo.attachments,
            });
            const status = provider.name === 'outbox' ? 'captured' : 'accepted';
            record.status = status;
            record.providerMessageId = messageId;
            record.acceptedAt = new Date();
            record.lastErrorCode = undefined;
            record.lastErrorMessage = undefined;
            record.events.push({ type: status, at: new Date() });
            await record.save();
            console.log(`📧 Email ${type} → ${record.toMasked}: ${status} by ${provider.name}`);
            return { status, deliveryId: String(record._id), providerMessageId: messageId };
        } catch (err) {
            lastError = err;
            record.lastErrorCode = err.code || 'unknown';
            record.lastErrorMessage = String(err.message || 'Error').slice(0, 300);
            record.retryable = !!err.retryable;
            record.uncertain = !!err.uncertain;
            // Resend retries reuse the Idempotency-Key, so even uncertain errors are safe to retry there.
            const safeToRetry = err.retryable && (!err.uncertain || provider.name === 'resend');
            if (!safeToRetry || attempt === maxAttempts()) break;
            await new Promise((r) => setTimeout(r, backoffMs(attempt)));
        }
    }

    record.status = 'failed';
    record.failedAt = new Date();
    record.events.push({ type: 'failed', at: new Date() });
    await record.save();
    console.warn(`📧 Email ${type} → ${record.toMasked}: failed via ${provider.name} (${lastError?.code}) after ${record.attempts} attempt(s)`);
    return { status: 'failed', deliveryId: String(record._id), errorCode: lastError?.code, message: lastError?.message };
}

/** Verifies provider configuration (SMTP: connection + auth). Does not send anything. */
async function verifyProvider() {
    const provider = getProvider();
    if (!provider.verify) return { ok: provider.isConfigured(), message: 'Verification not supported' };
    return provider.verify();
}

// ---------------- Resend delivery webhooks (Svix signatures) ----------------
const WEBHOOK_STATUS = {
    'email.delivered': 'delivered',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.failed': 'failed',
};

/** Verifies a Svix-signed webhook (used by Resend). Returns true only for a valid, fresh signature. */
function verifySvixSignature({ id, timestamp, signatureHeader, rawBody, secret, toleranceSec = 300 }) {
    if (!id || !timestamp || !signatureHeader || !rawBody || !secret) return false;
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;
    const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
    const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
    return String(signatureHeader).split(' ').some((part) => {
        const [version, sig] = part.split(',');
        if (version !== 'v1' || !sig) return false;
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
}

async function applyWebhookEvent(event) {
    const messageId = event?.data?.email_id;
    if (!messageId || !event.type) return { updated: false, reason: 'missing fields' };
    const record = await EmailDelivery.findOne({ providerMessageId: messageId });
    if (!record) return { updated: false, reason: 'unknown message' };
    record.events.push({ type: event.type, at: new Date() });
    const next = WEBHOOK_STATUS[event.type];
    if (next) {
        record.status = next;
        if (next === 'delivered') record.deliveredAt = new Date();
        if (['bounced', 'failed', 'complained'].includes(next)) record.failedAt = new Date();
    }
    await record.save();
    return { updated: !!next, status: record.status };
}

module.exports = {
    sendEmail,
    verifyProvider,
    getEmailStatus,
    isEmailConfigured,
    maskEmail,
    verifySvixSignature,
    applyWebhookEvent,
};
