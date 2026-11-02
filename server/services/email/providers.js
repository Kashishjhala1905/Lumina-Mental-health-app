// Email providers. Each provider implements:
//   name, isConfigured(), configIssues(), send({ from, to, subject, html, text, idempotencyKey, tags }) → { messageId }
//   optional verify() → { ok, message }
// Errors are thrown as EmailError with { code, retryable, uncertain } so the caller can retry safely.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

class EmailError extends Error {
    constructor(code, message, { retryable = false, uncertain = false, status } = {}) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.uncertain = uncertain;
        this.status = status;
    }
}

const timeoutMs = () => parseInt(process.env.EMAIL_TIMEOUT_MS, 10) || 10000;

// ---------------------------------------------------------------------------
// Resend – HTTPS API (https://resend.com/docs/api-reference/emails/send-email)
// Idempotency-Key makes retries safe: the provider will not send the same email twice.
// ---------------------------------------------------------------------------
const resend = {
    name: 'resend',
    isConfigured: () => !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    configIssues: () => [
        !process.env.RESEND_API_KEY && 'RESEND_API_KEY is not set',
        !process.env.EMAIL_FROM && 'EMAIL_FROM is not set (must use a domain verified in Resend)',
    ].filter(Boolean),
    async send({ from, to, subject, html, text, idempotencyKey, tags }) {
        const baseUrl = (process.env.RESEND_API_URL || 'https://api.resend.com').replace(/\/+$/, '');
        try {
            const res = await axios.post(`${baseUrl}/emails`, {
                from, to: [to], subject, html, text,
                tags: (tags || []).map(([name, value]) => ({ name, value: String(value).replace(/[^A-Za-z0-9_-]/g, '_') })),
            }, {
                timeout: timeoutMs(),
                headers: {
                    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey.slice(0, 256) } : {}),
                },
            });
            if (!res.data?.id) throw new EmailError('invalid_response', 'Provider response did not include a message id', { retryable: false, uncertain: true });
            return { messageId: res.data.id };
        } catch (err) {
            if (err instanceof EmailError) throw err;
            const status = err.response?.status;
            const providerName = err.response?.data?.name;
            if (status === 401 || status === 403) throw new EmailError('auth', `Provider rejected the API key (${providerName || status})`, { status });
            if (status === 409) throw new EmailError('idempotency_conflict', 'Provider reported an idempotency conflict', { status, uncertain: true });
            if (status === 400 || status === 422) throw new EmailError('invalid_request', `Provider rejected the message (${providerName || status})`, { status });
            if (status === 429) throw new EmailError('rate_limited', 'Provider rate limit reached', { status, retryable: true });
            if (status >= 500) throw new EmailError('provider_error', `Provider error (${status})`, { status, retryable: true });
            if (['ECONNABORTED', 'ETIMEDOUT'].includes(err.code)) throw new EmailError('timeout', 'Provider request timed out', { retryable: true, uncertain: true });
            if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN'].includes(err.code)) throw new EmailError('network', `Network error (${err.code})`, { retryable: true });
            throw new EmailError('unknown', err.message || 'Unknown provider error', { retryable: false, uncertain: true });
        }
    },
    async verify() {
        // Sending-only API keys cannot call management endpoints, so the only reliable check is a test send.
        return { ok: this.isConfigured(), message: this.isConfigured() ? 'Configured. Send a test email to confirm the key and sender domain.' : this.configIssues().join('; ') };
    },
};

// ---------------------------------------------------------------------------
// SMTP – any standard SMTP server (Gmail app password, Brevo, SendGrid SMTP, Mailgun SMTP, ...)
// SMTP has no idempotency, so errors after the DATA command are "uncertain" and are not retried.
// ---------------------------------------------------------------------------
// Accepts both naming styles: SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_SECURE
// and EMAIL_HOST/EMAIL_PORT/EMAIL_USER/EMAIL_PASSWORD/EMAIL_SECURE (e.g. Brevo: smtp-relay.brevo.com:587).
function smtpConfig() {
    const env = process.env;
    const port = parseInt(env.SMTP_PORT || env.EMAIL_PORT, 10) || 587;
    const secureRaw = env.SMTP_SECURE ?? env.EMAIL_SECURE;
    return {
        host: (env.SMTP_HOST || env.EMAIL_HOST || '').trim(),
        port,
        secure: secureRaw !== undefined && secureRaw !== '' ? secureRaw === 'true' : port === 465,
        user: (env.SMTP_USER || env.EMAIL_USER || '').trim(),
        pass: env.SMTP_PASS || env.EMAIL_PASSWORD || '',
        requireTLS: (env.SMTP_REQUIRE_TLS ?? env.EMAIL_REQUIRE_TLS) === 'true',
        ignoreTLS: (env.SMTP_IGNORE_TLS ?? env.EMAIL_IGNORE_TLS) === 'true', // local development/test servers only
    };
}

let smtpTransport = null;
let smtpKey = '';
function getSmtpTransport() {
    const cfg = smtpConfig();
    const key = [cfg.host, cfg.port, cfg.user, cfg.secure, cfg.requireTLS, cfg.ignoreTLS].join('|');
    if (smtpTransport && smtpKey === key) return smtpTransport;
    const nodemailer = require('nodemailer');
    smtpTransport = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        requireTLS: cfg.requireTLS,
        ignoreTLS: cfg.ignoreTLS,
        auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
        connectionTimeout: timeoutMs(),
        greetingTimeout: timeoutMs(),
        socketTimeout: timeoutMs() + 5000,
    });
    smtpKey = key;
    return smtpTransport;
}

function classifySmtpError(err) {
    const code = err.code;
    const response = err.responseCode;
    const afterData = err.command === 'DATA' || err.command === 'DATA END' || /^\.$/.test(err.command || '');
    if (code === 'EAUTH') return new EmailError('auth', 'SMTP authentication failed – check EMAIL_USER / EMAIL_PASSWORD (or SMTP_USER / SMTP_PASS)', { status: response });
    if (response && response >= 500) return new EmailError('rejected', `SMTP server rejected the message (${response})`, { status: response });
    if (response && [421, 450, 451, 452].includes(response)) return new EmailError('temporary_failure', `SMTP temporary failure (${response})`, { status: response, retryable: !afterData, uncertain: afterData });
    if (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNRESET'].includes(code) || err.command === 'CONN') {
        return afterData
            ? new EmailError('timeout', 'Connection lost after the message was submitted – delivery uncertain', { uncertain: true })
            : new EmailError('network', `Could not reach the SMTP server (${code || 'connection error'})`, { retryable: true });
    }
    if (code === 'EENVELOPE') return new EmailError('invalid_recipient', 'The recipient address was rejected');
    return new EmailError('unknown', err.message || 'Unknown SMTP error', { uncertain: true });
}

const smtp = {
    name: 'smtp',
    supportsInlineImages: true,
    isConfigured: () => !!(smtpConfig().host && process.env.EMAIL_FROM),
    configIssues: () => {
        const cfg = smtpConfig();
        return [
            !cfg.host && 'EMAIL_HOST (or SMTP_HOST) is not set',
            !process.env.EMAIL_FROM && 'EMAIL_FROM is not set',
            cfg.host && !cfg.user && 'EMAIL_USER (or SMTP_USER) is not set (most providers require authentication)',
            cfg.host && cfg.user && !cfg.pass && 'EMAIL_PASSWORD (or SMTP_PASS) is not set',
        ].filter(Boolean);
    },
    async send({ from, to, subject, html, text, idempotencyKey, attachments }) {
        try {
            const info = await getSmtpTransport().sendMail({
                from, to, subject, html, text,
                attachments: attachments?.length ? attachments : undefined,
                headers: idempotencyKey ? { 'X-Lumina-Ref': crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32) } : undefined,
            });
            if (info.rejected?.length) throw new EmailError('invalid_recipient', 'The SMTP server rejected the recipient');
            return { messageId: info.messageId };
        } catch (err) {
            if (err instanceof EmailError) throw err;
            throw classifySmtpError(err);
        }
    },
    async verify() {
        try {
            await getSmtpTransport().verify();
            return { ok: true, message: 'SMTP connection and authentication succeeded.' };
        } catch (err) {
            const e = classifySmtpError(err);
            return { ok: false, message: e.message, code: e.code };
        }
    },
};

// ---------------------------------------------------------------------------
// Outbox – DEVELOPMENT ONLY. Writes emails to server/.dev-outbox instead of sending them.
// Status is "captured" (never "accepted"/"delivered"). Disabled when NODE_ENV=production.
// ---------------------------------------------------------------------------
const OUTBOX_DIR = path.join(__dirname, '..', '..', '.dev-outbox');
const outbox = {
    name: 'outbox',
    supportsInlineImages: true,
    isConfigured: () => process.env.NODE_ENV !== 'production',
    configIssues: () => (process.env.NODE_ENV === 'production' ? ['The outbox provider is disabled in production'] : []),
    async send({ from, to, subject, html, text, attachments }) {
        fs.mkdirSync(OUTBOX_DIR, { recursive: true });
        // Inline (cid:) images become data URIs so the saved file renders like the real email
        for (const a of attachments || []) {
            if (a.cid && a.path && fs.existsSync(a.path)) {
                html = html.split(`cid:${a.cid}`).join(`data:image/png;base64,${fs.readFileSync(a.path).toString('base64')}`);
            }
        }
        const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
        const file = path.join(OUTBOX_DIR, `${id}.html`);
        const header = `<!-- DEV OUTBOX – NOT SENT\nFrom: ${from}\nTo: ${to}\nSubject: ${subject}\n\n${text.replace(/-->/g, '')}\n-->\n`;
        fs.writeFileSync(file, header + html);
        return { messageId: `outbox:${id}` };
    },
    async verify() {
        return { ok: this.isConfigured(), message: 'Development outbox: emails are written to server/.dev-outbox and never sent.' };
    },
};

const none = {
    name: 'none',
    isConfigured: () => false,
    configIssues: () => ['No email provider configured. Set EMAIL_PROVIDER=resend (RESEND_API_KEY) or EMAIL_PROVIDER=smtp (SMTP_*), plus EMAIL_FROM.'],
    async send() { throw new EmailError('not_configured', 'No email provider configured'); },
    async verify() { return { ok: false, message: this.configIssues()[0] }; },
};

const PROVIDERS = { resend, smtp, outbox, none };

/** Selected provider: EMAIL_PROVIDER, otherwise inferred from the credentials present. */
function getProvider() {
    const explicit = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
    if (explicit && PROVIDERS[explicit]) return PROVIDERS[explicit];
    if (process.env.RESEND_API_KEY) return resend;
    if (smtpConfig().host) return smtp;
    return none;
}

module.exports = { EmailError, getProvider, PROVIDERS, classifySmtpError, smtpConfig, OUTBOX_DIR };
