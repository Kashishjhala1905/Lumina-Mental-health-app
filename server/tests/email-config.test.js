// Unit tests for email configuration rules (no network, no database).
const test = require('node:test');
const assert = require('node:assert/strict');

const KEYS = ['EMAIL_PROVIDER', 'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_SECURE', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE', 'RESEND_API_KEY', 'EMAIL_FROM', 'CLIENT_URL', 'APP_BASE_URL', 'NODE_ENV'];
function withEnv(env, fn) {
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
    Object.assign(process.env, env);
    try { return fn(); } finally {
        for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    }
}
const { smtpConfig, getProvider } = require('../services/email/providers');
const { appLink, appUrlIssues, getAppBaseUrl } = require('../services/email/appUrl');
const { renderEmail } = require('../services/email/templates');

test('EMAIL_* variables configure SMTP (Brevo-style), SMTP_* still work as aliases', () => {
    withEnv({ EMAIL_HOST: 'smtp-relay.brevo.com', EMAIL_PORT: '587', EMAIL_USER: 'user@brevo', EMAIL_PASSWORD: 'secret', EMAIL_FROM: 'Lumina <a@b.org>' }, () => {
        const cfg = smtpConfig();
        assert.equal(cfg.host, 'smtp-relay.brevo.com');
        assert.equal(cfg.port, 587);
        assert.equal(cfg.secure, false, 'port 587 uses STARTTLS');
        assert.equal(cfg.user, 'user@brevo');
        assert.equal(cfg.pass, 'secret');
        assert.equal(getProvider().name, 'smtp', 'provider inferred from EMAIL_HOST');
        assert.equal(getProvider().isConfigured(), true);
    });
    withEnv({ EMAIL_HOST: 'smtp.gmail.com', EMAIL_PORT: '465' }, () => assert.equal(smtpConfig().secure, true, 'port 465 implies implicit TLS'));
    withEnv({ SMTP_HOST: 'legacy.example', SMTP_USER: 'u', SMTP_PASS: 'p' }, () => {
        assert.equal(smtpConfig().host, 'legacy.example');
        assert.equal(smtpConfig().pass, 'p');
    });
});

test('missing email settings are reported precisely', () => {
    withEnv({}, () => {
        assert.equal(getProvider().name, 'none');
        assert.match(getProvider().configIssues()[0], /No email provider configured/);
    });
    withEnv({ EMAIL_PROVIDER: 'smtp', EMAIL_HOST: 'smtp.example.org' }, () => {
        const issues = getProvider().configIssues().join(' | ');
        assert.match(issues, /EMAIL_FROM is not set/);
        assert.match(issues, /EMAIL_USER/);
    });
    withEnv({ EMAIL_PROVIDER: 'smtp', EMAIL_HOST: 'h', EMAIL_USER: 'u', EMAIL_FROM: 'x@y.z' }, () => {
        assert.match(getProvider().configIssues().join(' | '), /EMAIL_PASSWORD/);
    });
});

test('reset links use CLIENT_URL and never fall back to localhost in production', () => {
    withEnv({ CLIENT_URL: 'https://lumina.example.org,https://www.lumina.example.org' }, () => {
        assert.equal(appLink('/reset-password?token=abc'), 'https://lumina.example.org/#/reset-password?token=abc');
    });
    withEnv({}, () => assert.equal(getAppBaseUrl(), 'http://localhost:5173', 'development fallback only'));
    withEnv({ NODE_ENV: 'production' }, () => {
        assert.equal(appLink('/reset-password'), '');
        assert.match(appUrlIssues()[0], /CLIENT_URL/);
    });
    withEnv({ NODE_ENV: 'production', CLIENT_URL: 'http://localhost:5173' }, () => assert.match(appUrlIssues()[0], /localhost/));
    withEnv({ NODE_ENV: 'production', CLIENT_URL: 'https://lumina.example.org' }, () => assert.deepEqual(appUrlIssues(), []));
});

test('reset email: branding, logo, escaping, 15-minute notice, security notice', () => {
    withEnv({ CLIENT_URL: 'https://lumina.example.org' }, () => {
        const r = renderEmail('password_reset', { name: '<img src=x onerror=alert(1)>', resetUrl: 'https://lumina.example.org/#/reset-password?token=T', expiresMinutes: 15 }, { logoSrc: 'cid:lumina-logo' });
        assert.equal(r.subject, 'Reset your Lumina password');
        assert.match(r.html, /<img src="cid:lumina-logo" alt="Lumina logo"/);
        assert.ok(!r.html.includes('<img src=x'), 'user-controlled text is escaped');
        assert.match(r.html, /href="https:\/\/lumina\.example\.org\/#\/reset-password\?token=T"/);
        assert.match(r.text, /expires in 15 minutes/);
        assert.match(r.text, /Did not request this\?/);
        const noLogo = renderEmail('password_reset', { name: 'A', resetUrl: 'https://x/#/r', expiresMinutes: 15 });
        assert.ok(!noLogo.html.includes('<img'), 'no broken image when no logo is available');
    });
});
